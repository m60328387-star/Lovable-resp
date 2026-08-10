/** أسماء عربية مختصرة لكل أدوات الوكيل، تُستخدم في الدردشة والطرفية الحيّة. */
export const TOOL_LABELS: Record<string, string> = {
  design_blueprint: "تثبيت عقد التصميم",
  write_spec: "كتابة المواصفات",
  build_task_graph: "بناء رسم المهام",
  update_task: "تحديث مهمة",
  write_file: "كتابة ملف",
  write_files: "كتابة دفعة ملفات",

  edit_file: "تعديل جراحي",
  append_file: "إلحاق بملف",
  delete_file: "حذف ملف",
  read_file: "قراءة ملف",
  list_files: "سرد الملفات",
  run_command: "تنفيذ أمر",
  run_status: "حالة التنفيذ",
  run_checks: "فحص الجودة",
  browser_check: "فحص المتصفح",
  browser_open: "فتح المتصفح",
  browser_read: "قراءة الصفحة",
  browser_act: "إجراء في المتصفح",
  browser_close: "إغلاق المتصفح",

  fix_errors: "إصلاح الأخطاء",
  visual_audit: "تدقيق بصري",
  design_review: "مراجعة التصميم",
  capture_reference: "التقاط مرجع",
  brand_kit: "توليد الهوية البصرية",
  seo_kit: "تحسين محركات البحث",
  stack_plan: "اختيار المنظومة التقنية",
  promote_build: "ترقية البناء",
  publish_site: "نشر الموقع",
  generate_image: "توليد صورة",
  ask_user: "سؤال المالك",
  env_list: "سرد المفاتيح",
  env_get: "قراءة مفتاح",
  memory_save: "حفظ في الذاكرة",
  memory_list: "قراءة الذاكرة",
  memory_delete: "حذف من الذاكرة",
  web_search: "بحث في الويب",
  web_fetch: "جلب صفحة",
  connector_list: "سرد الروابط",
  connector_call: "نداء رابط خارجي",
  http_request: "نداء HTTP",

  bot_setup: "إعداد البوت",
  bot_status: "حالة البوت",
  bot_send: "إرسال عبر البوت",
  db_inspect: "فحص قاعدة البيانات",
  db_sql: "تنفيذ SQL",
  db_select: "قراءة صفوف",
  db_insert: "إدراج صفوف",
  project_map: "خريطة المشروع",
  file_outline: "مخطط ملف",
  read_slice: "قراءة مقطع",
  code_search: "بحث في الكود",
  semantic_index: "فهرسة دلالية",
  semantic_search: "بحث دلالي",
  analyze_content: "تحليل محتوى",
  deep_think: "تفكير عميق",
  analyze_image: "تحليل صورة",
  research: "بحث معمّق",
  propose_platform_change: "اقتراح تعديل على المنصة",
  platform_settings_get: "قراءة إعدادات المنصة",
  self_list_files: "سرد كود المنصة",
  self_read_file: "قراءة كود المنصة",
  self_map: "خريطة كود المنصة",
  self_search: "بحث في كود المنصة",
  self_edit_file: "تعديل جراحي على المنصة",
  self_auto_repair: "إصلاح ذاتي للمنصة",
  self_write_file: "تعديل كود المنصة",
};

export function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

const KEYS = [
  "path",
  "command",
  "query",
  "url",
  "slug",
  "table",
  "summary",
  "message",
  "label",
  "key",
  "prompt",
];

/** يستخرج سطراً واحداً يصف مدخلات/مخرجات الأداة لعرضه بجانب اسمها. */
export function toolDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  if (typeof record["error"] === "string") return record["error"].slice(0, 200);
  for (const key of KEYS) {
    const found = record[key];
    if (typeof found === "string" && found.trim()) return found.slice(0, 200);
  }
  if (Array.isArray(record["files"])) return `${record["files"].length} ملف`;
  if (typeof record["count"] === "number") return `${record["count"]} عنصر`;
  return undefined;
}

export function toolFailed(output: unknown) {
  return (
    !!output &&
    typeof output === "object" &&
    typeof (output as Record<string, unknown>)["error"] === "string"
  );
}
