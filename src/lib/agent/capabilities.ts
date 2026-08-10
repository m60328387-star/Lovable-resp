/**
 * جرد القدرات الحقيقية للمنصة وقت التشغيل.
 * الهدف: ألّا يحاول الوكيل استعمال أداة معطّلة بيئياً ثم يتوقف، بل يعرف البديل فوراً.
 */

type Capability = {
  key: string;
  tools: string[];
  available: boolean;
  /** ماذا يفعل بدلاً منها حين تكون غير متاحة. */
  fallback: string;
};

const has = (...names: string[]) => names.some((n) => (process.env[n] ?? "").trim().length > 8);

export function platformCapabilities(): Capability[] {
  return [
    {
      key: "runtime",
      tools: ["shell", "run_command", "dev_server", "browser_*", "auto_repair", "visual_audit"],
      available: has("EXECUTOR_TOKEN") && has("RUNTIME_URL", "WEAVER_RUNTIME_URL"),
      fallback:
        "تحقّق بالتحليل الساكن عبر run_checks ثم fix_errors، وراجع التصميم عبر design_review على لقطة سابقة أو على وصف الصفحة، ولا تنتظر المنفّذ.",
    },
    {
      key: "image",
      tools: ["generate_image"],
      available: has("LOVABLE_API_KEY"),
      fallback:
        "استعمل صور Unsplash/Picsum برابط مباشر أو تدرّجات CSS وأشكال SVG مولّدة يدوياً بدل توليد الصور.",
    },
    {
      key: "semantic",
      tools: ["semantic_index", "semantic_search"],
      available: has("OPENAI_API_KEY", "JINA_API_KEY", "VOYAGE_API_KEY"),
      fallback: "استعمل code_search و project_map و recall_knowledge للبحث داخل المشروع.",
    },
    {
      key: "selfRepo",
      tools: ["self_*", "propose_platform_change", "deploy_platform"],
      available: has("GITHUB_TOKEN") && has("GITHUB_REPO_URL"),
      fallback: "اشرح التعديل المطلوب على المنصة نصياً بدل محاولة تحريره أو نشره.",
    },
    {
      key: "projectDb",
      tools: ["db_inspect", "db_sql", "db_select", "db_insert"],
      available: has("DATABASE_URL", "WEAVER_DB_URL"),
      fallback: "ابنِ المشروع ببيانات ثابتة داخل الملفات أو localStorage بدل قاعدة بيانات.",
    },
    {
      key: "model",
      tools: ["fix_errors", "deep_think", "analyze_content"],
      available: has("OPENROUTER_API_KEY"),
      fallback: "أصلح الأخطاء يدوياً عبر edit_file بعد قراءة مخرجات run_checks.",
    },
  ];
}

/** كتلة نصية مختصرة تُحقن في تعليمات النظام — تُذكر الأدوات المعطّلة فقط. */
export function capabilitiesPrompt(): string {
  const off = platformCapabilities().filter((c) => !c.available);
  if (off.length === 0) return "";
  const lines = off.map((c) => `- ${c.tools.join(", ")}: غير متاحة الآن. البديل: ${c.fallback}`);
  return (
    "\n=== أدوات غير متاحة في هذه البيئة (لا تستدعِها ولا تنتظرها) ===\n" +
    lines.join("\n") +
    "\nاستعمل البديل مباشرة وأكمل المهمة حتى النهاية.\n"
  );
}
