// إدارة ميزانية التوكينز مقابل رصيد OpenRouter الفعلي.
//
// المشكلة التي يعالجها هذا الملف: طلب `max_tokens` كبير (64k) يجعل OpenRouter
// يرفض الطلب كليّاً برسالة "can only afford N tokens"، فيفشل البناء من أول خطوة
// ويُعاد المحاولة عشرين مرة بلا فائدة. الحل: سقف افتراضي آمن + تعلّم السقف
// الحقيقي من رسالة المزوّد وتطبيقه على الطلبات اللاحقة.

const SAFE_DEFAULT = 16_000;
const ABSOLUTE_MIN = 2_000;
const ABSOLUTE_MAX = 64_000;

let learnedCap: number | undefined;
let learnedAt = 0;
const LEARNED_TTL_MS = 10 * 60 * 1000;

function activeLearnedCap(): number | undefined {
  if (!learnedCap) return undefined;
  if (Date.now() - learnedAt > LEARNED_TTL_MS) {
    learnedCap = undefined;
    return undefined;
  }
  return learnedCap;
}

/** السقف الفعّال للرد الواحد بعد أخذ الرصيد المتاح بالحسبان. */
export function resolveMaxOutputTokens(preferred?: number): number {
  const envValue = Number(process.env["OPENROUTER_MAX_TOKENS"] ?? 0);
  let target = preferred || envValue || SAFE_DEFAULT;
  const cap = activeLearnedCap();
  if (cap) target = Math.min(target, cap);
  return Math.max(ABSOLUTE_MIN, Math.min(Math.floor(target), ABSOLUTE_MAX));
}

/**
 * يستخرج السقف الحقيقي من رسالة خطأ المزوّد ويحفظه.
 * يعيد السقف الجديد إن كان الخطأ متعلّقاً بالرصيد، وإلا `undefined`.
 */
export function noteTokenBudgetError(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = /can only afford\s+(\d+)/i.exec(message);
  if (!match) return undefined;
  const affordable = Number(match[1]);
  if (!Number.isFinite(affordable) || affordable <= 0) return undefined;
  const next = Math.max(ABSOLUTE_MIN, Math.floor(affordable * 0.9));
  learnedCap = next;
  learnedAt = Date.now();
  return next;
}

/** يشغّل عملية توليد مع إعادة محاولة تلقائية بسقف أصغر عند نفاد الرصيد. */
export async function withTokenBudget<T>(
  run: (maxOutputTokens: number) => Promise<T>,
  preferred?: number,
): Promise<T> {
  let attempt = 0;
  let budget = resolveMaxOutputTokens(preferred);
  // محاولتان إضافيتان كحد أقصى: واحدة بالسقف المستخرج من الخطأ، وأخرى بالحد الأدنى.
  for (;;) {
    try {
      return await run(budget);
    } catch (error) {
      attempt += 1;
      const learned = noteTokenBudgetError(error);
      if (!learned || attempt >= 3 || learned >= budget) throw error;
      budget = learned;
    }
  }
}
