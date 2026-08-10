/**
 * محرّك النصوص — مرحلة محتوى منفصلة عن مرحلة التخطيط.
 * الجزء الحتمي هنا: تدقيق النصوص المكتوبة فعلاً داخل HTML وكشف الحشو
 * والعناصر النائبة والتكرار قبل أن تصل إلى المستخدم.
 */
import { getStarterKit } from "./starter-kits";

export interface CopySlot {
  section: string;
  requirement: string;
}

export interface CopyBrief {
  kitId: string;
  voice: string[];
  rules: string[];
  slots: CopySlot[];
}

const VOICE_RULES = [
  "اكتب بالعربية الفصحى الحديثة، جُمَل قصيرة، صيغة المخاطب.",
  "كل عنوان يحمل فائدة أو نتيجة — لا عناوين تصنيفية مثل «خدماتنا» وحدها.",
  "ممنوع الحشو التسويقي: «حلول مبتكرة»، «رائدون»، «نسعى دائماً»، «الجودة والتميّز».",
  "الأرقام محدّدة وقابلة للتصديق، ولا تخترع جوائز أو شهادات أو أسماء عملاء وهمية.",
  "كل زر يبدأ بفعل واضح: «ابدأ الآن»، «احجز مكالمة»، «حمّل القائمة».",
  "طول عنوان الهيرو ≤ 10 كلمات، والوصف ≤ 25 كلمة.",
];

export function copyBrief(kitId: string, business?: string): CopyBrief {
  const kit = getStarterKit(kitId);
  const slots: CopySlot[] = kit
    ? Object.entries(kit.copyContract).map(([section, requirement]) => ({ section, requirement }))
    : [
        { section: "hero", requirement: "وعد قيمة واحد + جملة توضيح + زر إجراء." },
        { section: "features", requirement: "من 3 إلى 6 فوائد كنتائج للمستخدم." },
        { section: "cta", requirement: "دعوة أخيرة بهدف واحد." },
        { section: "footer", requirement: "بيانات تواصل حقيقية وروابط تعمل." },
      ];
  return {
    kitId,
    voice: VOICE_RULES,
    rules: [
      business
        ? `كل نص يجب أن يخصّ فعلياً: ${business}. لا نصوص صالحة لأي شركة أخرى.`
        : "اسأل المستخدم عن نشاطه إن لم يكن واضحاً قبل كتابة النصوص.",
      "اكتب النصوص أولاً كقائمة، ثم ألصقها في قصاصات ui_snippet — لا تكتب النص أثناء بناء HTML.",
      "بعد الكتابة نفّذ copy_audit على كل صفحة وأصلح كل ملاحظة.",
    ],
    slots,
  };
}

export interface CopyIssue {
  level: "error" | "warn";
  message: string;
  sample?: string;
}

const PLACEHOLDER_PATTERNS: { re: RegExp; message: string }[] = [
  { re: /\{\{\s*[A-Z_]+\s*\}\}/g, message: "عناصر نائبة {{...}} لم تُستبدل" },
  { re: /lorem\s+ipsum/gi, message: "نص lorem ipsum" },
  { re: /نص\s*(تجريبي|افتراضي|بديل)/g, message: "نص تجريبي عربي" },
  { re: /اسم\s*(الشركة|المنتج|العلامة)\b/g, message: "اسم عام غير مستبدَل" },
  { re: /\bTODO\b|\bFIXME\b/g, message: "علامات TODO/FIXME" },
  { re: /example\.com|#\s*"|href="#"(?![^>]*aria)/g, message: "روابط وهمية" },
  { re: /\bXXX\b|\bxxx\b|\b0000\b|123-456/g, message: "قيم نائبة (أرقام وهمية)" },
];

const FILLER_PHRASES = [
  "حلول مبتكرة",
  "حلول متكاملة",
  "رائدون في",
  "نسعى دائماً",
  "الجودة والتميز",
  "الجودة والتميّز",
  "أفضل الخدمات",
  "خبرة سنوات طويلة",
  "نحن نؤمن",
  "رضا العملاء هو",
  "بأعلى معايير",
];

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** تدقيق حتمي لنصوص صفحة HTML واحدة. */
export function auditCopy(
  html: string,
  opts: { path?: string } = {},
): { ok: boolean; score: number; issues: CopyIssue[]; stats: Record<string, number> } {
  const issues: CopyIssue[] = [];
  const text = stripTags(html);
  const words = text ? text.split(/\s+/).filter(Boolean) : [];

  for (const { re, message } of PLACEHOLDER_PATTERNS) {
    const hits = html.match(re);
    if (hits?.length) {
      issues.push({
        level: "error",
        message: `${message} (${hits.length} موضع).`,
        sample: hits.slice(0, 3).join(" | ").slice(0, 120),
      });
    }
  }

  for (const phrase of FILLER_PHRASES) {
    if (text.includes(phrase)) {
      issues.push({
        level: "warn",
        message: `عبارة حشو تسويقي: «${phrase}» — استبدلها بنتيجة محدّدة.`,
      });
    }
  }

  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (words.length > 40 && latin / Math.max(text.length, 1) > 0.35) {
    issues.push({ level: "error", message: "أغلب المحتوى بالإنجليزية بينما الواجهة عربية." });
  }

  if (words.length < 180) {
    issues.push({
      level: "error",
      message: `المحتوى النصّي ${words.length} كلمة فقط — الصفحة سطحية (الحد الأدنى 180).`,
    });
  }

  const headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) =>
    stripTags(m[2] ?? ""),
  );
  const genericHeadings = headings.filter((h) =>
    ["خدماتنا", "من نحن", "مميزاتنا", "ميزاتنا", "تواصل معنا", "أعمالنا"].includes(h.trim()),
  );
  if (genericHeadings.length > 2) {
    issues.push({
      level: "warn",
      message: `${genericHeadings.length} عناوين تصنيفية عامة — حوّلها إلى عناوين فائدة.`,
      sample: genericHeadings.slice(0, 3).join(" | "),
    });
  }

  const dupes = new Map<string, number>();
  for (const h of headings) {
    const k = h.trim();
    if (k.length > 3) dupes.set(k, (dupes.get(k) ?? 0) + 1);
  }
  const repeated = [...dupes.entries()].filter(([, n]) => n > 1);
  if (repeated.length) {
    issues.push({
      level: "warn",
      message: `عناوين مكرّرة حرفياً: ${repeated
        .map(([k]) => k)
        .slice(0, 3)
        .join(" | ")}.`,
    });
  }

  const buttons = [
    ...html.matchAll(/<(?:a|button)[^>]*class="[^"]*u-btn[^"]*"[^>]*>([\s\S]*?)<\//gi),
  ]
    .map((m) => stripTags(m[1] ?? ""))
    .filter(Boolean);
  const weakButtons = buttons.filter((b) => /^(اضغط هنا|المزيد|هنا|اقرأ المزيد)$/.test(b.trim()));
  if (weakButtons.length) {
    issues.push({
      level: "warn",
      message: `${weakButtons.length} زر بصياغة ضعيفة («اضغط هنا»/«المزيد») — ابدأ بفعل يصف النتيجة.`,
    });
  }

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  if (!title || title.length < 12) {
    issues.push({ level: "error", message: "عنوان الصفحة <title> ناقص أو قصير جداً." });
  }
  const desc = /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html)?.[1]?.trim() ?? "";
  if (desc.length < 60) {
    issues.push({ level: "error", message: "وصف الميتا أقل من 60 حرفاً أو مفقود." });
  }

  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.length - errors;
  const score = Math.max(0, 100 - errors * 18 - warns * 6);

  return {
    ok: errors === 0 && score >= 80,
    score,
    issues,
    stats: {
      words: words.length,
      headings: headings.length,
      buttons: buttons.length,
      titleLength: title.length,
      descriptionLength: desc.length,
      ...(opts.path ? {} : {}),
    },
  };
}
