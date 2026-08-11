import { useCallback, useEffect, useState } from "react";

export const MODE_STORAGE_KEY = "weaver:mode";

export type ModeId = "build" | "research" | "advise" | "bot" | "platform";

export type Mode = {
  id: ModeId;
  name: string;
  icon: string;
  desc: string;
  prompt: string;
};

/** أوضاع التشغيل: كل وضع يغيّر سلوك الوكيل وتعليماته. */
export const MODES: Mode[] = [
  {
    id: "build",
    name: "بناء",
    icon: "Hammer",
    desc: "دورة العمل الكاملة: مواصفات، مهام، ملفات، فحص، نشر.",
    prompt: `وضع التشغيل الحالي: **بناء**.
التزم بدورة العمل الكاملة (Intake → Spec → Task Graph → Execution → Verify → Publish) واكتب ملفات فعلية.
عند الحاجة إلى معلومة حديثة أو توثيق مكتبة استخدم web_search ثم web_fetch قبل الكتابة.`,
  },
  {
    id: "research",
    name: "بحث",
    icon: "Search",
    desc: "بحث حيّ على الإنترنت مع مصادر موثّقة وملخّص منظّم.",
    prompt: `وضع التشغيل الحالي: **بحث**.
- لا تبنِ مشروعاً ولا تكتب ملفات ولا تستخدم write_spec أو build_task_graph إلا إذا طلب المستخدم صراحةً.
- ابدأ دائماً بـ web_search (2-4 استعلامات مختلفة الصياغة)، ثم web_fetch لأهم 2-5 نتائج لقراءة المحتوى الفعلي.
- لا تعتمد على معرفتك المخزّنة وحدها في المواضيع المتغيّرة (أسعار، إصدارات، أخبار، مقارنات).
- أخرج: ملخّص تنفيذي (3-5 نقاط) → التفاصيل منظّمة بعناوين/جداول → المخاطر أو التناقضات بين المصادر → قائمة مصادر مرقّمة بروابط كاملة.
- إذا تعارضت المصادر اذكر التعارض صراحةً بدل اختيار رأي واحد.`,
  },
  {
    id: "advise",
    name: "استشارة",
    icon: "MessagesSquare",
    desc: "حوار تقني وتحليل قرارات بدون بناء أو ملفات.",
    prompt: `وضع التشغيل الحالي: **استشارة**.
- تجاهل دورة البناء تماماً: ممنوع write_spec و build_task_graph و write_file و publish_site.
- تصرّف كمستشار هندسي أول: افهم السياق، اسأل أسئلة توضيحية عند الغموض (3 كحد أقصى)، ثم قدّم رأياً صريحاً.
- قدّم دائماً: التوصية المباشرة → الأسباب → البدائل مع المفاضلة (جدول) → المخاطر → الخطوة التالية العملية.
- استخدم web_search عند الحاجة للتحقّق من معلومة قابلة للتغيّر.
- كن مختصراً وحاسماً؛ لا تكرر كلام المستخدم.`,
  },
  {
    id: "bot",
    name: "بوت تيليغرام",
    icon: "Send",
    desc: "إنشاء بوت تيليغرام حيّ وربطه بالمشروع، مع Mini App.",
    prompt: `وضع التشغيل الحالي: **بوت تيليغرام**.
- اسأل المستخدم عن توكن البوت من @BotFather إن لم يكن مسجّلاً، ثم استخدم bot_setup لتسجيله وربط الـWebhook تلقائياً.
- عرّف شخصية البوت وتعليماته في bot_setup عبر الحقل persona؛ البوت سيردّ تلقائياً على رسائل المستخدمين بنفس النموذج.
- استخدم bot_status لعرض حالة الربط، و bot_send لإرسال رسالة اختبار بعد معرفة chat_id.
- إن طلب المستخدم Mini App: ابنِ موقعاً عادياً بأدوات مساحة العمل (index.html + styles.css) مع تضمين
  <script src="https://telegram.org/js/telegram-web-app.js"></script>، واستخدم Telegram.WebApp.ready() و themeParams
  و MainButton، ثم انشره بـ publish_site وأعطِ المستخدم الرابط ليضعه في BotFather كزر Web App.
- بعد الربط اذكر للمستخدم بوضوح: اسم البوت، رابط الـWebhook، وكيف يختبره.`,
  },
  {
    id: "platform",
    name: "تطوير Weaver",
    icon: "Wrench",
    desc: "دردشة تعديل المنصة نفسها: اقرأ كود Weaver، عدّله، ثم انشره على الخادم.",
    prompt: `وضع التشغيل الحالي: **تطوير المنصة (Weaver نفسه)**.
- كل طلب في هذا الوضع يخصّ كود منصة Weaver نفسها، وليس مشروعاً للمستخدم. ممنوع تماماً استخدام write_file أو publish_site أو build_task_graph.
- الترتيب الإلزامي: self_map/self_search لتحديد الملف → self_read_file لقراءته كاملاً → self_edit_file لتعديل جراحي (أو self_write_file عند إعادة الكتابة الكاملة) → deploy_platform للنشر مع فحص صحي وتراجع تلقائي.
- عند فشل النشر: self_auto_repair لاستخراج الأخطاء والملفات المتورطة ثم أصلح وأعد النشر.
- استخدم propose_platform_change فقط إذا طلب المالك معاينة Diff قبل التطبيق.
- بعد التعديل، إن طلب المالك التفعيل على الخادم فاستخدم أداة deploy_platform ثم اذكر نتيجة الفحص الصحي.
- اذكر دائماً في نهاية ردّك: الملفات التي عُدِّلت، وسبب كل تعديل، وكيف يتحقّق المالك منه.`,
  },
];

export function modePrompt(id: string | null | undefined) {
  const mode = MODES.find((m) => m.id === id) ?? MODES[0]!;
  return `\n\n## وضع التشغيل\n${mode.prompt}\n`;
}

/**
 * حالة الوضع محفوظة **لكل محادثة** حتى لا يتسرّب وضع "تطوير Weaver" إلى مشاريع المستخدم.
 * كان المفتاح عاماً سابقاً، فبمجرد فتح دردشة تطوير المنصة تبقى كل الدردشات في وضع platform
 * فتُحجب أدوات مساحة العمل ولا يبدأ أي بناء.
 */
export function modeStorageKey(threadId?: string | null) {
  return threadId ? `${MODE_STORAGE_KEY}:${threadId}` : MODE_STORAGE_KEY;
}

export function useMode(threadId?: string | null) {
  const [mode, setModeState] = useState<ModeId>("build");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(modeStorageKey(threadId));
    setModeState(stored && MODES.some((m) => m.id === stored) ? (stored as ModeId) : "build");
  }, [threadId]);

  const setMode = useCallback(
    (next: ModeId) => {
      setModeState(next);
      if (typeof window !== "undefined")
        window.localStorage.setItem(modeStorageKey(threadId), next);
    },
    [threadId],
  );

  return { mode, setMode };
}
