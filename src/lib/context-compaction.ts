/**
 * ضغط سياق ذكي للمشاريع الكبيرة.
 *
 * المشكلة: في مشروع فيه عشرات الملفات تتراكم مخرجات الأدوات (محتوى ملفات كاملة،
 * سجلات بناء، نتائج فحص) داخل تاريخ المحادثة، فينفجر حجم الطلب، ويبطؤ كل خطوة،
 * وأحياناً يقطع المزوّد الجولة في المنتصف فيبدو أن الوكيل "توقّف قبل أن يكمل".
 *
 * الحل: نُبقي الرسائل الأخيرة كاملة (السياق العامل)، ونضغط ما قبلها:
 * - نصوص طويلة تُقصّ مع ذكر عدد الأحرف المحذوفة.
 * - مخرجات الأدوات تُختزل إلى خلاصة قصيرة (الحقول المهمة فقط).
 * - أجزاء التفكير (reasoning) القديمة تُحذف كلياً — لا قيمة لها بعد انتهاء الخطوة.
 * - إن بقي التاريخ ضخماً نحذف من الوسط ونُبقي أول رسالتين (الطلب الأصلي) والأحدث.
 */
import type { UIMessage } from "ai";

const KEEP_RECENT = 8;
const MAX_MESSAGES = 60;
const MAX_CONTEXT_TOKENS = 120_000;
const MAX_TEXT_CHARS = 1200;
const MAX_TOOL_CHARS = 700;

type AnyPart = Record<string, unknown> & { type: string };

function clip(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n…[اختُصر ${value.length - limit} حرفاً لتوفير السياق]`;
}

/** خلاصة مقروءة لمخرجات أداة: نحتفظ بالحقول الحاسمة ونقصّ الباقي. */
function summarizeToolOutput(output: unknown): unknown {
  if (output == null) return output;
  if (typeof output === "string") return clip(output, MAX_TOOL_CHARS);
  if (typeof output !== "object") return output;

  const source = output as Record<string, unknown>;
  const keep: Record<string, unknown> = {};
  for (const key of [
    "ok",
    "error",
    "status",
    "exitCode",
    "score",
    "verdict",
    "summary",
    "url",
    "slug",
    "path",
    "clean",
  ]) {
    if (key in source) keep[key] = source[key];
  }
  const serialized = JSON.stringify(source);
  if (serialized.length <= MAX_TOOL_CHARS) return output;
  keep["_compacted"] = clip(serialized, MAX_TOOL_CHARS);
  return keep;
}

function compactPart(part: AnyPart): AnyPart | null {
  if (part.type === "reasoning") return null;
  if (part.type === "text" && typeof part["text"] === "string") {
    return { ...part, text: clip(part["text"], MAX_TEXT_CHARS) };
  }
  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    const next: AnyPart = { ...part };
    if ("output" in next) next["output"] = summarizeToolOutput(next["output"]);
    if ("input" in next) {
      const raw = JSON.stringify(next["input"] ?? null);
      if (raw && raw.length > MAX_TOOL_CHARS)
        next["input"] = { _compacted: clip(raw, MAX_TOOL_CHARS) };
    }
    if (typeof next["errorText"] === "string") next["errorText"] = clip(next["errorText"], 300);
    return next;
  }
  return part;
}

function compactMessage(message: UIMessage): UIMessage {
  const parts = (message.parts as unknown as AnyPart[]) ?? [];
  const compacted = parts.map(compactPart).filter((p): p is AnyPart => p !== null);
  // رسالة بلا أجزاء تكسر التحويل إلى رسائل النموذج — نُبقي نصاً بديلاً.
  const safe = compacted.length > 0 ? compacted : [{ type: "text", text: "(محتوى مضغوط)" }];
  return { ...message, parts: safe } as unknown as UIMessage;
}

/** يعيد نسخة مضغوطة من تاريخ المحادثة جاهزة للإرسال إلى النموذج. */
export function compactMessages(messages: UIMessage[], keepRecent = KEEP_RECENT): UIMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  let working = messages;
  // الطيّ يعتمد على عدد الرسائل *و* على الحجم الفعلي: رسالة واحدة ضخمة
  // (مخرجات read_file لملف كبير) قد تتجاوز عشرات الرسائل مجتمعة.
  const tooLarge = estimateContextTokens(messages) > MAX_CONTEXT_TOKENS;
  if (working.length > MAX_MESSAGES || (tooLarge && working.length > keepRecent + 3)) {
    const limit = Math.min(MAX_MESSAGES, Math.max(keepRecent + 3, working.length));
    const head = working.slice(0, 2);
    const tail = working.slice(-(limit - 3));
    const droppedCount = working.length - head.length - tail.length;
    const marker = {
      id: `compact-${droppedCount}`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `[تم طيّ ${droppedCount} رسالة قديمة من هذه المحادثة. الحالة الحقيقية للمشروع تُقرأ من قاعدة البيانات ومن الأدوات، لا من التاريخ المطوي.]`,
        },
      ],
    } as unknown as UIMessage;
    working = [...head, marker, ...tail];
  }

  const cut = Math.max(0, working.length - keepRecent);
  return working.map((message, index) => (index < cut ? compactMessage(message) : message));
}

/** تقدير تقريبي لحجم السياق بالتوكينز (لأغراض التشخيص فقط). */
export function estimateContextTokens(messages: UIMessage[]): number {
  return Math.round(JSON.stringify(messages).length / 3.6);
}
