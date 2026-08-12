export const LIFECYCLE = [
  { id: "intake", label: "الاستقبال", en: "INTAKE", desc: "تحويل الطلب إلى متطلبات صريحة" },
  {
    id: "discovery",
    label: "الاستكشاف",
    en: "DISCOVERY",
    desc: "بحث في الواقع: مكتبات، APIs، أنماط",
  },
  { id: "spec", label: "المواصفات", en: "SPEC", desc: "مصدر حقيقة واحد للمشروع" },
  { id: "architect", label: "المعمارية", en: "ARCHITECT", desc: "قرارات وحدود ومخطط بيانات" },
  { id: "graph", label: "رسم المهام", en: "TASK GRAPH", desc: "مهام باعتماديات ومعايير قبول" },
  { id: "execute", label: "التنفيذ", en: "AGENT LOOP", desc: "Observe → Think → Act → Observe", canRetry: true, maxRetries: 3, retryCount: 0 },
  { id: "verify", label: "التحقق", en: "VERIFY", desc: "أدلة: build / test / browser", canRetry: true, maxRetries: 3, retryCount: 0 },
  { id: "review", label: "المراجعة", en: "REVIEW", desc: "مراجع مستقل + اختبار انحدار" },
  { id: "deploy", label: "النشر", en: "DEPLOY", desc: "بناء، نشر، فحص صحة" },
  { id: "monitor", label: "المراقبة", en: "MONITOR", desc: "سجلات، أخطاء، حوادث → حلقة" },
] as const;

export type LifecycleId = (typeof LIFECYCLE)[number]["id"];
