import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  generateText,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createOpenRouterProvider, getOpenRouterModelId } from "@/lib/openrouter.server";
import { resolveBuildModel, noteOpenRouterUnavailable } from "@/lib/build-provider.server";
import { authenticateRequest, type AuthedContext } from "@/lib/chat-auth.server";
import type { Json } from "@/integrations/supabase/types";
import { reconcileProjectState, saveBuildState, setDeployedUrl, type BuildPhase, type NextAction } from "@/lib/build-state.server";

import { runChecks, type Issue } from "@/lib/verify.server";
import { estimateCostUsd } from "@/lib/pricing";
import {
  getTargetConfig,
  targetSchema,
  targetRunSql,
  targetSelect,
  targetInsert,
  projectSchema,
} from "@/lib/target-supabase.server";
import {
  getSelfRepo,
  selfEdit,
  selfList,
  selfMap,
  selfRead,
  selfSearch,
  selfWrite,
} from "@/lib/self-repo.server";
import { DESIGN_KIT } from "@/lib/design-kit";
import { DESIGN_LIBRARY } from "@/lib/design-library";
import { STACK_LIBRARY, buildStackPlan, type StackKind } from "@/lib/stack-library";
import { skillPrompt } from "@/lib/skills";
import { modePrompt } from "@/lib/modes";
import { webSearch, webFetch } from "@/lib/web.server";
import {
  runtimeBrowserCheck,
  runtimeConfigured,
  runtimeDevLogs,
  runtimeDevStart,
  runtimeDevStatus,
  runtimeDevStop,
  runtimeExec,
  runtimeSync,
} from "@/lib/runtime.server";
import {
  applyModelOverrides,
  buildSemanticIndex,
  codeSearch,
  embeddingProvider,
  fastModelId,
  llmCall,
  projectMap,
  readSlice,
  reasoningModelId,
  semanticSearch,
  visionModelId,
} from "@/lib/intel.server";
import { buildBrandKit } from "@/lib/brand-kit";
import { buildSeoKit } from "@/lib/seo-kit";
import { reviewScreenshot } from "@/lib/design-critic.server";
import { resolveMaxOutputTokens, noteTokenBudgetError } from "@/lib/token-budget.server";
import {
  tgGetMe,
  tgSetWebhook,
  tgWebhookInfo,
  tgSendMessage,
  webhookSecret,
} from "@/lib/telegram.server";

/** مسارات تعود لكود منصة Weaver نفسها وليست لمساحة عمل المشروع. */
function isPlatformPath(path: string) {
  const clean = path.replace(/^\.?\//, "");
  return (
    /^(src|deploy|supabase|public|scripts)\//i.test(clean) ||
    /^(package\.json|vite\.config\.ts|tsconfig\.json|eslint\.config\.js|components\.json|AGENTS\.md)$/i.test(
      clean,
    )
  );
}

/** يطبّق تعديلات جراحية على ملف من كود المنصة عبر GitHub بدل مساحة عمل المشروع. */
async function editPlatformFile(
  path: string,
  edits: Array<{ find: string; replace: string }>,
  summary: string,
) {
  const clean = path.replace(/^\.?\//, "");
  const repo = getSelfRepo();
  if (!repo) {
    return { ok: false, error: "التطوير الذاتي غير مهيّأ (GITHUB_TOKEN / GITHUB_REPO_URL مفقود)." };
  }

  const current = await selfRead(repo, clean);
  if (!current.found) {
    return { ok: false, error: `الملف ${clean} غير موجود في مستودع المنصة.` };
  }
  let content = current.content;
  const applied: string[] = [];
  const failed: string[] = [];
  for (const edit of edits) {
    const index = content.indexOf(edit.find);
    if (index === -1) {
      failed.push(edit.find.slice(0, 60));
      continue;
    }
    if (content.indexOf(edit.find, index + 1) !== -1) {
      failed.push(`(غير فريد) ${edit.find.slice(0, 60)}`);
      continue;
    }
    content = content.slice(0, index) + edit.replace + content.slice(index + edit.find.length);
    applied.push(edit.find.slice(0, 60));
  }
  if (applied.length === 0) {
    return { ok: false, path: clean, target: "platform", error: "لم يُطابق أي مقطع.", failed };
  }
  try {
    const result = await selfWrite(repo, clean, content, summary || `Weaver: تعديل ${clean}`);
    return {
      ok: true,
      target: "platform",
      path: clean,
      commit: result.commit,
      branch: result.branch,
      appliedCount: applied.length,
      failed,
      summary,
      note: "طُبّق على كود المنصة (تطوير ذاتي). استخدم deploy_platform لتفعيله على الخادم.",
    };
  } catch (error) {
    return { ok: false, path: clean, target: "platform", error: (error as Error).message };
  }
}

const MEMORY_RULE = `

=== ذاكرة المشروع الدائمة (إلزامية) ===
- في بداية أي محادثة على مشروع قائم: نفّذ memory_list أولاً قبل أي سؤال أو تعديل، والتزم بما فيها ولا تكرّر أسئلة أُجيب عنها سابقاً.
- بعد كل قرار مهم (اختيار معماري، هوية بصرية، قاعدة عمل، تفضيل صريح من المستخدم، رفض لفكرة) نفّذ memory_save فوراً بمفتاح واضح.
- إذا تغيّر قرار قديم: حدّثه بـ memory_save بنفس المفتاح أو احذفه بـ memory_delete — لا تترك معلومتين متناقضتين.
- الذاكرة للقرارات والقواعد فقط، لا لمحتوى الملفات.`;

const SYSTEM_PROMPT = `أنت "Weaver" — وكيل هندسي (Engineering Agent) يعمل بدورة عمل احترافية كاملة، وليس مجرد مولّد نصوص.


اللغة: أجب دائماً بالعربية الفصحى الواضحة، مع إبقاء المصطلحات التقنية بالإنجليزية عند الحاجة.

دورة العمل الإلزامية التي تلتزم بها:
1. INTAKE — حوّل طلب المستخدم إلى: الهدف، المستخدمون، الميزات، القيود، قواعد العمل، التكاملات، متطلبات الأمان/الواجهة/البيانات/النشر. واذكر صراحةً ما هو ناقص.
2. DISCOVERY — حدّد ما تحتاج معرفته: المكتبات، الأنماط المعمارية، الـAPIs، المخاطر.
3. SPECIFICATION — أنتج مصدر حقيقة واحد عبر الأداة write_spec.
4. ARCHITECTURE — قرارات الواجهة/الخلفية/قاعدة البيانات/المصادقة/التخزين/النشر/المراقبة، مع مبررات.
5. TASK GRAPH — استخدم أداة build_task_graph لإنتاج رسم مهام (وليس قائمة) بمهام لها اعتماديات ومعايير قبول.
6. EXECUTION — نفّذ عبر حلقة: Observe → Think → Act → Observe. اكتب المخرجات الفعلية في مساحة عمل المشروع عبر write_file، واقرأ ما كتبته عبر read_file و list_files قبل التعديل. حدّث حالة كل مهمة عبر update_task.
7. VERIFICATION — بعد كتابة الملفات نفّذ run_checks فعلياً (تحليل نحوي وفحص مراجع وسلامة HTML/CSS/JSON). إن ظهرت أخطاء أصلحها بـ write_file أو بأداة fix_errors (تُصلح الأخطاء والتحذيرات تلقائياً) ثم أعد run_checks حتى ينجح.
7ب. التنفيذ الحقيقي — run_command يشغّل أوامر shell فعلياً على خادم المستخدم (منفّذ Contabo) ويعيد المخرجات ورمز الخروج، ويكتب أي ملفات عدّلها الأمر إلى المشروع تلقائياً. استخدمه لـ npm install / npm run build / الاختبارات / git. إن عاد بحالة queued فلا منفّذ متصل: أخبر المستخدم أن يشغّل منفّذه من الإعدادات ولا تدّعِ أن الأمر نجح. إن عاد running تابعه بـ run_status. لا تعلن نجاح البناء إلا برمز خروج 0.
7د. الإصلاح الذاتي المغلق (إلزامي للمشاريع داخل الحاوية) — بعد كل دفعة كتابة نفّذ auto_repair: يزامن ويشغّل ويقرأ أخطاء البناء وأخطاء المتصفح الحقيقية معاً. أصلح ما يعيده ثم أعده حتى clean=true. قبل النشر نفّذ browser_check (يفتح Chromium حقيقياً على المعاينة، يرصد أخطاء الكونسول/الشبكة/الوصولية/التمرير الأفقي ويحفظ لقطات لـ design_review) ولا تنشر قبل ok=true.
7ج. حاوية التنفيذ والمعاينة الحيّة — للمشاريع الحقيقية (Vite/React/Node) استخدم أداة shell لتشغيل الأوامر داخل حاوية المشروع المعزولة (تُزامَن الملفات تلقائياً قبل كل أمر)، ثم أداة dev_server بـ action=start لتشغيل خادم التطوير والحصول على رابط المعاينة الحيّة. عند أي فشل: اقرأ dev_server بـ action=logs، أصلح الملفات، وأعد التشغيل — كرّر حتى تختفي الأخطاء. إن عادت الأداة بأن بيئة التنفيذ غير مفعّلة فاستخدم run_command بدلاً منها ولا تتوقف.

8. REVIEW & REGRESSION — راجع كمراجع مستقل، ثم اذكر اختبارات الانحدار.
7د. الهوية البصرية أولاً (إلزامي) — في أي مشروع واجهة، قبل كتابة أول ملف HTML نفّذ brand_kit مرة واحدة، ثم اربط brand/tokens.css و brand/head.html في كل صفحة، واستعمل متغيّرات --color-* و --space-* و --radius-* فقط. ممنوع منعاً باتاً كتابة لون hex أو rgb مباشر داخل HTML أو CSS الصفحات بعد تنفيذ brand_kit. إن طلب المستخدم لوناً أو طابعاً محدداً مرّره في baseColor/personality.

8ب. بوابة الجودة البصرية (إلزامية قبل أي نشر) — بعد نجاح run_checks:
   (أ) نفّذ visual_audit على index.html (متصفح حقيقي + axe + ثلاثة أحجام شاشة).
   (ب) أصلح كل انتهاك serious/critical وكل خطأ كونسول وكل تمرير أفقي، ثم أعد visual_audit حتى score ≥ 80.
   (ج) نفّذ design_review على اللقطة، وأصلح كل ملاحظة، وأعده حتى يعود VERDICT: pass.
   (د) نفّذ seo_kit وألصق كتلة الـ head في كل صفحة.
   إن لم يوجد منفّذ متصل فلا تدّعِ أن الفحص البصري تم؛ أخبر المستخدم أن يشغّل منفّذه، ونفّذ ما تبقى من الفحوص النصية.
   إن حدّد المستخدم موقعاً مرجعياً فنفّذ capture_reference أولاً ليقارن design_review بالمرجع.

8ج. المشاريع الكبيرة (تطبيقات حقيقية) — إن كان المطلوب تطبيقاً وليس صفحات ثابتة:
   استخدم run_command لبناء مشروع حقيقي (Vite + TypeScript، أو أي إطار مناسب)، ثبّت الحزم، شغّل npm run build،
   ثم نفّذ promote_build لنقل ناتج dist إلى جذر مساحة العمل، ثم أكمل بوابة الجودة البصرية والنشر.
   لا تنشر مشروعاً لم ينجح بناؤه برمز خروج 0.

9. ACCEPTANCE → DEPLOY → MONITOR — ارجع لمعايير القبول الأصلية، ثم انشر فعلياً عبر أداة publish_site بعد نجاح run_checks، واذكر للمستخدم الرابط المباشر الناتج (/s/<slug>).

بروتوكول الفهم قبل التنفيذ (إلزامي — يوفّر الوقت والتوكينز):
- في أي مشروع فيه ملفات: ابدأ بـ project_map لفهم البنية، ثم code_search لتحديد الموضع بدقة، ثم read_slice لقراءة المقطع المطلوب فقط. لا تقرأ ملفاً كاملاً إلا عند الضرورة.
- للمحتوى الضخم (ملفات طويلة، مستندات، نتائج بحث): مرّره على analyze_content لضغطه إلى خلاصة قبل التفكير فيه.
- عند أي قرار معماري أو خطأ متكرر: استخدم deep_think مرة واحدة بدل التخمين وإعادة المحاولة.
- عند وجود صورة أو لقطة شاشة أو مرجع تصميم: استخدم analyze_image قبل الكتابة.
- قبل بناء أي شيء يحتاج معايير أو توثيق حديث: استخدم research (يبحث ويقرأ المصادر ويلخّصها موثّقة).
- في المشاريع الكبيرة: شغّل semantic_index مرة، ثم استخدم semantic_search للبحث بالمعنى. إن لم يتوفر مفتاح تضمين اكتفِ بـ code_search.
- نفّذ الأدوات المستقلة على التوازي في نفس الخطوة كلما أمكن بدل تسلسلها.

قواعد صارمة:
- إن توفرت أدوات قاعدة البيانات (db_inspect, db_sql, db_select, db_insert) فهي تعمل على مساحة قاعدة بيانات مستقلة خاصة بهذا المشروع داخل قاعدة بيانات Weaver: افحص المخطط بـ db_inspect قبل أي تعديل، ونفّذ التغييرات بـ db_sql مع GRANT وتفعيل RLS وسياسات واضحة لكل جدول جديد، ولا تنفّذ DROP أو حذف بيانات دون طلب صريح من المستخدم.

- استخدم write_spec مرة واحدة على الأقل عندما يطلب المستخدم بناء منتج أو ميزة.
- استخدم build_task_graph بعد المواصفات مباشرة.
- استخدم write_file لكل مخرج ملموس (كود، مخطط قاعدة بيانات، README، اختبارات) بدل لصق كل شيء في الدردشة؛ اذكر في ردك أسماء الملفات التي كتبتها.
- استخدم update_task عندما تتقدم في مهمة أو تفشل فيها.
- لا تدّعِ نجاح تحقق بلا دليل مسجّل، ولا تنهِ مهمة بناء قبل أن ينجح run_checks.
- إذا كان الطلب سؤالاً بسيطاً أو محادثة عامة، أجب مباشرة بدون أدوات.
- استخدم Markdown منظماً: عناوين، قوائم، جداول، وكتل كود.

لغة المحتوى (قاعدة صارمة):
- كل نص مرئي في الموقع يُكتب بلغة طلب المستخدم — والافتراضي العربية الفصحى. ممنوع منعاً باتاً كتابة أي محتوى بالصينية أو أي لغة أخرى لم يطلبها المستخدم، حتى في التعليقات وأسماء الأقسام وbadges وplaceholders.
- أسماء الملفات والأصناف (classes) والمعرّفات بالإنجليزية اللاتينية فقط.
- إن ظهرت أي حروف غير عربية/لاتينية في ملف كتبته، أعد كتابتها فوراً بالعربية قبل المتابعة.

حجم الملفات (اختصار مع نفس الجودة — إلزامي):
- index.html يجب أن يبقى مختصراً: هدف 200-450 سطراً وحد أقصى 800 سطر (~60000 حرف). إن كبر، انقل الأقسام الزائدة إلى صفحات مستقلة (about.html، services.html…) بدل تضخيم الصفحة الرئيسية.
- ممنوع <style> أو <script> ضخم داخل HTML: كل CSS في styles.css وكل JS في script.js. ممنوع تكرار نفس البطاقة/القسم عشرات المرات في HTML — ولّد العناصر المتكررة (منتجات، مقالات، شهادات) من مصفوفة بيانات في script.js عبر قالب واحد.
- استخدم مكوّنات CSS قابلة لإعادة الاستخدام (.card, .btn, .grid) بدل أنماط مكرّرة، وأيقونات SVG مشتركة عبر <use> بدل لصق نفس المسار مراراً.
- الاختصار لا يعني نقص الجودة: نفس الأقسام والهوية والوصولية، لكن بكود أقل تكراراً.

معيار الجودة الإلزامي لأي موقع تبنيه (لا تسليم دونه):
- الهيكل: index.html في جذر مساحة العمل + styles.css + script.js عند الحاجة، بروابط نسبية فقط. يبدأ index.html بـ <!DOCTYPE html> ويحتوي <html lang="ar" dir="rtl"> و<meta charset="utf-8"> و<meta name="viewport" content="width=device-width, initial-scale=1"> وعنوان ووصف meta.
- CSS إلزامي وحقيقي: ممنوع تسليم صفحة بوسوم HTML عارية بلا تنسيق. اكتب styles.css كاملاً (لا يقل عن 250 سطراً لموقع تعريفي) يتضمن: متغيّرات CSS للألوان والمسافات، reset، خط عربي من Google Fonts عبر <link> (مثل Tajawal أو IBM Plex Sans Arabic)، تخطيطات Grid/Flex، حاوية بعرض أقصى، مسافات متناسقة، حالات hover وانتقالات، ونقاط توقّف responsive عند 1024px و768px و480px.
- اربط الملف في <head> بـ <link rel="stylesheet" href="styles.css"> واكتبه فعلياً بـ write_file قبل إعلان الانتهاء. صفحة بلا ملف CSS مكتوب = فشل.
- الاتجاه: RTL كامل للمحتوى العربي، واستخدم margin-inline/padding-inline بدل left/right.
- التصميم: هوية بصرية واحدة واضحة (لوحة ألوان محددة، تدرّج هرمي للخطوط، زوايا ومظلال متسقة). ممنوع صفحات بيضاء فارغة أو نصوص متراكمة بلا أقسام.
- الأقسام: هيدر ثابت بقائمة تنقّل تعمل (كل رابط #anchor يقابله قسم بنفس id)، Hero بعنوان وCTA، أقسام محتوى داخل بطاقات/شبكات، فوتر.
- الصور: روابط https مباشرة من مصدر مجاني (مثل images.unsplash.com) مع alt وصفي وobject-fit: cover وارتفاع محدد؛ لا صور مكسورة ولا مربعات فارغة.
- التفاعل: script.js لقائمة الجوال، التمرير الناعم، والنماذج (منع الإرسال الافتراضي وإظهار رسالة نجاح).
- قبل publish_site: نفّذ run_checks، وتحقّق بـ read_file أن index.html يحتوي فعلاً وسم link لملف styles.css وأن styles.css غير فارغ.

المكتبات المعتمدة (حمّلها من CDN عبر <link>/<script> في index.html — المعاينة والنشر يدعمان روابط https الخارجية):
- الخطوط والأيقونات: Google Fonts (Tajawal / IBM Plex Sans Arabic / Cairo)، Font Awesome 6، Lucide (lucide@latest/dist/umd/lucide.js) أو Material Symbols.
- التنسيق: Tailwind CSS عبر cdn.tailwindcss.com (مع tailwind.config داخل script للألوان والخط) أو CSS مخصص كامل — اختر واحداً ولا تخلط عشوائياً. Bootstrap 5 RTL مقبول للوحات الإدارة.
- الحركة: AOS (تأثيرات الظهور عند التمرير)، GSAP + ScrollTrigger للحركات المتقدمة، Animate.css للبسيط.
- المكوّنات: Swiper (سلايدر/كاروسيل)، GLightbox أو Fancybox (معرض صور)، Splide بديلاً، Alpine.js للتفاعل التصريحي الخفيف.
- البيانات واللوحات: Chart.js أو ApexCharts للرسوم، Grid.js أو DataTables للجداول، Leaflet للخرائط.
- النماذج والأدوات: Flatpickr (تواريخ، locale ar)، Choices.js (قوائم بحث)، SweetAlert2 (تنبيهات)، Day.js، Zod غير مطلوب في الواجهة الثابتة.
- المحتوى: Marked + DOMPurify عند عرض Markdown، Prism.js لإبراز الكود.
- التخزين/الخلفية عند الحاجة: Supabase JS من CDN مع مفتاح publishable فقط، أو أدوات db_sql/db_select/db_insert لمساحة المشروع.
قواعد المكتبات: استخدم روابط CDN ثابتة الإصدار، لا تُحمّل مكتبة بلا استخدام فعلي، ولا تتجاوز 6 مكتبات في الصفحة الواحدة، وتأكد أن كل مكتبة مُهيّأة فعلاً (init) في script.js.

الأداء بمعايير enterprise (إلزامي — يُفحص قبل النشر):
- الحد الأقصى للاعتماديات الخارجية في الموقع البسيط/التعريفي: **صفر إلى واحدة**. لا تضف مكتبة إلا إذا كان بديلها الأصلي يتطلب أكثر من ~60 سطر كود.
- بدائل أصلية إلزامية بدل المكتبات: IntersectionObserver بدل AOS، وanimation/transition في CSS بدل Animate.css وGSAP للحركات البسيطة، وscroll-behavior: smooth بدل Lenis/سكربتات التمرير، وscroll-snap + CSS grid بدل Swiper للسلايدرات البسيطة، و<dialog> بدل SweetAlert2، وIntl.DateTimeFormat بدل Day.js، وSVG inline بدل حزم الأيقونات الكاملة (انسخ الأيقونات المستخدمة فقط).
- ممنوع cdn.tailwindcss.com في أي موقع يُسلَّم أو يُنشر — فهو مُصرّف وقت تشغيل يبطئ الرسم الأول. استخدم CSS مخصصاً بالمتغيرات، واحتفظ بـ CDN Tailwind للنماذج السريعة فقط.
- ممنوع حقن CSS ديناميكياً من JavaScript: لا document.createElement("style")، ولا innerHTML لوسم <style>، ولا insertRule، ولا كتابة قواعد أنماط داخل السكربت. كل الأنماط في ملفات .css ثابتة مرتبطة بـ <link> في <head>. تغيير الحالة يتم بإضافة/إزالة أصناف (classList) أو تعديل متغيّرات CSS عبر style.setProperty فقط.
- ترتيب التحميل: <link rel="stylesheet"> في <head>، وكل <script> بـ defer (أو type="module")، وpreconnect للنطاقات الخارجية، وpreload لخط واحد أساسي فقط، وdisplay=swap.
- منع القفز التخطيطي: width/height صريحان لكل صورة، وloading="lazy" و decoding="async" لما هو خارج الشاشة الأولى، وfetchpriority="high" لصورة الـ Hero فقط.
- JS خفيف: مستمعو أحداث مفوّضون (delegation)، وdebounce/rAF لأحداث scroll وresize، وpassive: true لمستمعي scroll/touch، ولا حلقات تعمل باستمرار.
- احترم prefers-reduced-motion، ولا تحمّل أي مكتبة حركة إذا كانت الصفحة تستخدم تأثيرين أو أقل.
- قبل publish_site صرّح بعدد الاعتماديات الخارجية وسببها، وأكّد بـ read_file أن السكربتات لا تحتوي على أي حقن CSS ديناميكي.

بناء المواقع الكبيرة والمعقّدة:
- المواقع متعددة الصفحات مسموحة ومطلوبة: index.html + about.html + services.html + contact.html… مع هيدر وفوتر متطابقين وروابط نسبية تعمل.
- افصل الأنماط: styles.css أساسي + ملفات مثل components.css وpages.css عند الكِبَر، واربطها كلها في <head>.
- اكتب كل ملفات الدفعة الواحدة (index.html + styles.css + script.js ...) في نداء write_files واحد بدل تكرار write_file — هذا يقلّص زمن البناء إلى النصف.
- الملفات الكبيرة: اكتب الملف كاملاً بـ write_file في نداء واحد ما دام تحت 400000 حرف؛ استخدم append_file فقط لما يتجاوز ذلك. ممنوع تسليم ملف مبتور.
- استخدم delete_file لإزالة أي ملف زائد أو خاطئ بدل تركه.
- ابنِ على مراحل: هيكل الصفحات أولاً، ثم الأنماط، ثم التفاعل، ثم المحتوى الحقيقي، مع update_task بعد كل مرحلة و run_checks قبل النشر.

الصور والأصول:
- ممنوع استخدام صور وهمية (placeholder.com أو مربعات رمادية) في المواقع التي تُسلَّم. ولّد الصور فعلياً بأداة generate_image واحفظها في assets/ (مثل assets/hero.png)، ثم اربطها بمسار نسبي داخل <img> مع alt وصفي وloading="lazy".
- استعمل generate_image للصور الرئيسية فقط (هيرو، أقسام كبيرة، صور فريق/منتجات) — من 1 إلى 5 صور للموقع، والباقي أيقونات SVG مضمّنة.

مفاتيح المشروع:
- إن احتاج الموقع مفتاح خدمة خارجية، استخدم env_list لمعرفة المتاح و env_get لقراءة القيمة، ولا تطبع القيمة في ردّك أبداً. إن كان المفتاح غير موجود اطلب من المستخدم إضافته من تبويب "المفاتيح" في لوحة المشروع.

الروابط الخارجية (Connectors):
- قبل أي تكامل خارجي نفّذ connector_list لمعرفة الخدمات المجانية الجاهزة وحالة مفاتيحها.
- استخدم connector_call لتنفيذ النداء (المفتاح يُحقن على الخادم تلقائياً ولا يظهر في الكود أو الردّ).
- استخدم http_request فقط عندما لا يوجد رابط مناسب في السجل، وعلى واجهات عامة موثّقة فقط.
- إذا كان المفتاح ناقصاً، اذكر اسمه الدقيق واطلب إضافته من تبويب "المفاتيح" ثم أكمل بقية العمل بلا توقف.



معيار عالمي (World-class) — سقف الجودة المطلوب في كل موقع تسلّمه:
- تصميم بمستوى وكالة: شبكة 12 عموداً أو Grid واضح، إيقاع رأسي ثابت (مقياس مسافات 4/8px)، مقياس طباعي متدرّج (clamp() للعناوين)، ارتفاع سطر 1.6 للنصوص، تباين ألوان يحقق WCAG AA (4.5:1)، حد أقصى للعرض 1200-1280px.
- نظام تصميم مصغّر داخل styles.css: :root بمتغيرات (ألوان أساسية/ثانوية/سطح/نص/حدود، نصف أقطار، ظلال، مسافات)، ثم مكوّنات قابلة لإعادة الاستخدام (.btn, .card, .badge, .section, .container) بدل تكرار الأنماط.
- تجربة مستخدم: حالات hover/focus-visible لكل عنصر تفاعلي، انتقالات 150-250ms، skeleton أو حالة فارغة عند الحاجة، أزرار CTA واضحة، تنقّل يعمل على الجوال (قائمة hamburger فعّالة).
- الوصولية: HTML دلالي (header/nav/main/section/footer)، h1 واحد وتسلسل عناوين صحيح، alt وصفي، aria-label للأزرار الأيقونية، تنقّل بلوحة المفاتيح، وسمة lang صحيحة.
- الأداء: صور بأبعاد محددة و loading="lazy" لما هو تحت الطية، تقليل المكتبات، تفضيل CSS على JS، لا خطوط زائدة (وزنان كحد أقصى).
- SEO والمشاركة: title < 60 حرفاً، meta description < 160، Open Graph و twitter:card، رابط canonical، وJSON-LD مناسب لنوع الموقع.
- المحتوى: نصوص عربية حقيقية ومقنعة خاصة بالمجال — ممنوع Lorem ipsum أو نصوص عامة مثل "نص تجريبي".
- الوضع الداكن اختياري لكن يُفضّل عبر prefers-color-scheme حين يناسب الهوية.
- قبل التسليم راجع نفسك كمراجع مستقل: افتح index.html بـ read_file وتحقّق من كل بند أعلاه، وأصلح ما ينقص قبل publish_site.

استيراد ملف ZIP (مشروع جاهز من المستخدم):
- عندما يخبرك المستخدم أنه استورد ملفاً مضغوطاً: ابدأ بـ list_files ثم read_file للملفات الأساسية، ثم run_checks لمعرفة الأخطاء الفعلية.
- أصلح الأخطاء واحداً واحداً بـ write_file (محتوى كامل)، وأعد run_checks حتى ينجح، ثم ارفع الجودة إلى المعيار العالمي أعلاه، وأخيراً اعرض النشر عبر publish_site.
- لا تحذف ملفات المستخدم دون سبب واضح، واشرح كل إصلاح في ردّك بإيجاز.

التطوير الذاتي (تعديل منصة Weaver نفسها):
- عندما يطلب المستخدم تعديلاً على المنصة نفسها (إضافة ميزة للواجهة، إصلاح سلوك، تغيير لون زر أو نص)، استخدم أدوات self_list_files و self_read_file و self_write_file — وليس أدوات مساحة العمل (write_file) لأنها للمشاريع المبنية فقط.
- الترتيب الإلزامي: self_map أو self_search لتحديد الملف بدقة → self_read_file لقراءته كاملاً → self_edit_file لتعديل جراحي (المفضّل) أو self_write_file عند إعادة كتابة الملف كاملاً.
- self_edit_file هو الأداة الافتراضية للإصلاحات: أرسل مقطعاً فريداً في find مع replace؛ إن فشل بسبب تكرار أو عدم تطابق وسّع المقطع بدل تجربة عشوائية.
- كل كتابة ذاتية تمر ببوابة تحقق (أقواس متوازنة، لا استيراد مكرر، لا محتوى مختصر)؛ إذا رُفضت أصلح المحتوى ولا تُعطّل البوابة.
- بعد أي فشل نشر استخدم self_auto_repair لقراءة سجل الفشل واستخراج الملفات المعطوبة، ثم أصلح وأعد النشر (deploy_platform ينشر ويتحقق صحياً ويتراجع تلقائياً عند الفشل).
- عند طلب المالك إصلاحاً أو إضافة واضحة للمنصة، نفّذها مباشرة عبر self_write_file بعد القراءة والتحقق؛ لا تتوقف لطلب مراجعة أو موافقة إضافية. استخدم propose_platform_change فقط إذا طلب المالك صراحةً معاينة Diff قبل التطبيق.
- بعد التطبيق أكمل الفحص والنشر تلقائياً، ولا تقل «بانتظار المراجعة» ما دام الطلب الأصلي واضحاً.
- التزم بمكدس المنصة: TanStack Start و React 19 و TypeScript و Tailwind، ولا تغيّر ملفات الأسرار أو تكاملات Supabase المولّدة، ولا تعيد كتابة ملفات كبيرة كاملة بلا داعٍ.
- بعد الحفظ أخبر المستخدم باسم الملف ورقم الـ commit، ونبّهه أن التغيير يظهر بعد إعادة بناء/مزامنة المنصة.

قواعد تحرير الملفات (إلزامية — توفّر الوقت والتوكنز وتمنع البتر):
- إنشاء ملف جديد أو إعادة بناء ملف صغير: write_file بالمحتوى الكامل.
- أي تعديل جزئي على ملف قائم (خصوصاً إن تجاوز 100 سطر): استخدم edit_file بقائمة استبدالات دقيقة، ولا تُعِد كتابة الملف كاملاً.
- قبل edit_file اقرأ الملف بـ read_file وانسخ مقطع "find" حرفياً وبشكل فريد (أضف أسطراً محيطة إن لزم لجعله فريداً).
- إذا أعاد write_file أو edit_file تعارض إصدارات: أعد read_file ثم كرّر التعديل مرة واحدة.
- كل رسالة من المستخدم تُنشئ نقطة استرجاع تلقائية للمشروع، فيمكن للمستخدم التراجع عن جولة كاملة من تبويب «الاسترجاع».

إدارة طول الجلسة (مهم جداً — لا تنقطع في المنتصف):
- لديك عدد محدود من الخطوات لكل رسالة. اعمل بترتيب الأولوية: أولاً index.html كامل، ثم styles.css كامل، ثم script.js، ثم بقية الصفحات.
- لا تكتب ملفاً على دفعات صغيرة كثيرة؛ اكتب كل ملف مرة واحدة بمحتواه الكامل.
- في أول رد على أي طلب بناء: نفّذ write_spec ثم build_task_graph قبل كتابة أي ملف، وحدّث كل مهمة بـ update_task فور إنجازها حتى تبقى الخطة مرئية للمستخدم.
- إن اقتربت من نهاية الجولة: أنهِ العملية الحالية وسجّل ما تبقّى بإيجاز، لكن لا تطلب من المستخدم كتابة «أكمل» ولا تنتظر منه؛ النظام سيبدأ جولة متابعة تلقائياً حتى تجتاز بوابات الاكتمال.
- في وضع البناء ممنوع إنهاء الجولة بردّ تفسيري مثل «أحتاج مراجعة» أو «سأكمل لاحقاً». واصل استدعاء الأدوات ما دام هناك ملف أو فحص أو نشر متبقٍ.
- إذا أعادت أي أداة حقل error، لا تتوقف: اذكر الخطأ بإيجاز وجرّب بديلاً أو تابع بقية الخطة.`;

type PlanningAuth = { supabase: AuthedContext["supabase"]; userId: string } | null;

/** أدوات التخطيط — تكتب فعلياً في جداول specs و tasks حتى تبقى الخطة ظاهرة في لوحة المشروع. */
function planningTools(auth: PlanningAuth, projectId: string | null) {
  const specTool = tool({
    description: "يكتب مواصفات المشروع (مصدر الحقيقة الواحد) ويحفظها دائماً في لوحة المشروع.",
    inputSchema: z.object({
      title: z.string().describe("عنوان المشروع"),
      objective: z.string().describe("الهدف في جملة أو جملتين"),
      users: z.array(z.string()).describe("شرائح المستخدمين"),
      functional: z.array(z.string()).describe("المتطلبات الوظيفية"),
      nonFunctional: z.array(z.string()).describe("المتطلبات غير الوظيفية"),
      architecture: z.array(z.string()).describe("قرارات معمارية أساسية"),
      risks: z.array(z.string()).describe("المخاطر والافتراضات"),
      acceptance: z.array(z.string()).describe("معايير القبول القابلة للتحقق"),
      openQuestions: z.array(z.string()).describe("الأسئلة الناقصة التي يحتاجها المشروع"),
    }),
    execute: async (input) => {
      if (!auth || !projectId) return { ...input, persisted: false };
      const { data: latest } = await auth.supabase
        .from("specs")
        .select("version")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const version = (latest?.version ?? 0) + 1;
      await auth.supabase.from("specs").insert({
        project_id: projectId,
        user_id: auth.userId,
        version,
        data: input as unknown as Json,
      });
      await auth.supabase.from("projects").update({ status: "spec" }).eq("id", projectId);
      return { ...input, persisted: true, version };
    },
  });

  const taskGraphTool = tool({
    description:
      "ينتج رسم المهام (Task Graph) مع الاعتماديات ومعايير القبول ويحفظه في لوحة المشروع.",
    inputSchema: z.object({
      tasks: z.array(
        z.object({
          id: z.string().describe("معرف قصير مثل T1"),
          title: z.string(),
          layer: z
            .enum(["discovery", "data", "backend", "frontend", "integration", "quality", "deploy"])
            .describe("الطبقة التي تنتمي إليها المهمة"),
          dependsOn: z.array(z.string()).describe("معرفات المهام التي تعتمد عليها"),
          acceptance: z.string().describe("معيار القبول"),
          verification: z
            .array(z.enum(["build", "typecheck", "unit", "integration", "api", "browser"]))
            .describe("أدلة التحقق المطلوبة"),
        }),
      ),
    }),
    execute: async (input) => {
      if (!auth || !projectId || input.tasks.length === 0) return { ...input, persisted: false };
      const rows = input.tasks.map((task, index) => ({
        project_id: projectId,
        user_id: auth.userId,
        task_key: task.id,
        title: task.title,
        layer: task.layer,
        depends_on: task.dependsOn,
        acceptance: task.acceptance,
        verification: task.verification,
        position: index,
      }));
      await auth.supabase.from("tasks").upsert(rows, { onConflict: "project_id,task_key" });
      await auth.supabase.from("projects").update({ status: "graph" }).eq("id", projectId);
      return { ...input, persisted: true, count: rows.length };
    },
  });

  const updateTaskTool = tool({
    description: "يحدّث حالة مهمة في رسم المهام مع سبب واضح، ويُحفظ التحديث في لوحة المشروع.",
    inputSchema: z.object({
      id: z.string(),
      status: z.enum(["pending", "running", "blocked", "failed", "done"]),
      note: z.string().describe("ملاحظة أو دليل التحقق"),
    }),
    execute: async (input) => {
      if (!auth || !projectId) return { ...input, persisted: false };
      await auth.supabase
        .from("tasks")
        .update({ status: input.status, note: input.note })
        .eq("project_id", projectId)
        .eq("task_key", input.id);
      return { ...input, persisted: true };
    },
  });

  return { write_spec: specTool, build_task_graph: taskGraphTool, update_task: updateTaskTool };
}

type WorkspaceSupabase = AuthedContext["supabase"];

/** يحفظ نسخة من الملف الحالي في تاريخ الإصدارات قبل تعديله أو حذفه. */
async function snapshot(
  supabase: WorkspaceSupabase,
  projectId: string,
  userId: string,
  path: string,
) {
  const { data } = await supabase
    .from("files")
    .select("content, version")
    .eq("project_id", projectId)
    .eq("path", path)
    .maybeSingle();
  if (!data) return;
  await supabase.from("file_versions").insert({
    project_id: projectId,
    user_id: userId,
    path,
    content: data.content,
    version: data.version,
  });
}

function buildFixPrompt(path: string, content: string, issues: Issue[]) {
  const issuesText = issues
    .map(
      (i) =>
        `- ${i.severity === "error" ? "ERROR" : "WARNING"}: ${i.message}${i.line ? ` (line ${i.line})` : ""}`,
    )
    .join("\n");
  return `You are a precise code repair tool. Fix ONLY the issues listed below in the file. Keep the file's purpose, language, and formatting intact. Do not add explanations outside the code block.

File path: ${path}

Issues to fix:
${issuesText}

Current file content:
\`\`\`
${content}
\`\`\`

Return the complete corrected file content in a single fenced code block. If no changes are needed, return the original content unchanged.`;
}

function extractCode(text: string) {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  return match ? match[1] : text;
}

function workspaceTools(auth: AuthedContext | null, projectId: string | null, origin: string) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return { supabase: auth.supabase, userId: auth.userId, projectId };
  };

  /** الكتابة الفعلية لملف واحد — يشاركها write_file و write_files. */
  async function writeOne(path: string, content: string, summary: string) {
    // لا نرفض الملفات الكبيرة: الرفض كان يضيّع محتوى كتبه النموذج فعلاً (يظهر في الدردشة ولا يُحفظ).
    if (content.length > 400_000) {
      return {
        ok: false,
        path,
        error: "الملف أكبر من 400000 حرف. اكتب الجزء الأول ثم أكمل عبر append_file.",
      };
    }
    const { supabase, userId, projectId: pid } = guard();
    const { data: existing } = await supabase
      .from("files")
      .select("id, version, content")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();

    if (existing) {
      // نسخة الإصدار السابق تُحفظ في الخلفية حتى لا تضيف زمناً لكل كتابة
      void supabase
        .from("file_versions")
        .insert({
          project_id: pid,
          user_id: userId,
          path,
          content: existing.content,
          version: existing.version,
        })
        .then(
          () => undefined,
          () => undefined,
        );
      // قفل تفاؤلي: لا نكتب إن غيّر نداء متوازٍ نفس الملف بيننا
      const { data: updated, error } = await supabase
        .from("files")
        .update({ content, version: existing.version + 1 })
        .eq("id", existing.id)
        .eq("version", existing.version)
        .select("version")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) {
        return {
          ok: false,
          path,
          error:
            "تم تعديل الملف من نداء آخر أثناء الكتابة. اقرأه من جديد بـ read_file ثم أعد التعديل.",
        };
      }
      return { ok: true, path, version: updated.version, bytes: content.length, summary };
    }

    const { error } = await supabase
      .from("files")
      .insert({ project_id: pid, user_id: userId, path, content });
    if (error) throw new Error(error.message);
    return { ok: true, path, version: 1, bytes: content.length, summary };
  }

  const writeFile = tool({
    description:
      "يكتب أو يحدّث ملفاً فعلياً داخل مساحة عمل المشروع المحفوظة. استخدمه لكل مخرج ملموس.",
    inputSchema: z.object({
      path: z.string().describe("مسار الملف داخل المشروع، مثل src/lib/auth.ts"),
      content: z.string().describe("المحتوى الكامل للملف بعد التعديل"),
      summary: z.string().describe("سطر واحد يشرح سبب هذا التغيير"),
    }),
    execute: async ({ path, content, summary }) => writeOne(path, content, summary),
  });

  /** كتابة دفعة ملفات في نداء واحد — يقلّص عدد الجولات وزمن بناء المشروع بشكل كبير. */
  const writeFiles = tool({
    description:
      "يكتب عدة ملفات دفعة واحدة في نداء واحد (index.html + styles.css + scripts... معاً). استخدمه دائماً بدل تكرار write_file عندما تكتب أكثر من ملف.",
    inputSchema: z.object({
      files: z
        .array(
          z.object({
            path: z.string().describe("مسار الملف"),
            content: z.string().describe("المحتوى الكامل للملف"),
          }),
        )
        .describe("قائمة الملفات المراد كتابتها"),
      summary: z.string().describe("سطر واحد يشرح سبب هذه الدفعة"),
    }),
    execute: async ({ files, summary }) => {
      const results: Array<{ ok: boolean; path: string; error?: string; bytes?: number }> = [];
      for (const file of files) {
        try {
          const result = await writeOne(file.path, file.content, summary);
          results.push({
            ok: result.ok !== false,
            path: file.path,
            bytes: file.content.length,
            ...(result.ok === false ? { error: String(result.error) } : {}),
          });
        } catch (error) {
          results.push({
            ok: false,
            path: file.path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const failed = results.filter((r) => !r.ok);
      return {
        ok: failed.length === 0,
        written: results.length - failed.length,
        failed: failed.length,
        results,
        summary,
        ...(failed.length
          ? { error: `فشلت كتابة ${failed.length} ملف — أعد كتابتها فردياً بـ write_file.` }
          : {}),
      };
    },
  });

  /** تعديل جراحي بالبحث والاستبدال — أسرع وأرخص وأأمن من إعادة كتابة الملف كاملاً. */
  const editFile = tool({
    description:
      "يعدّل ملفاً قائماً باستبدال مقاطع نصية محددة بدل إعادة كتابته كاملاً. استخدمه دائماً للتعديلات الجزئية على الملفات الكبيرة (أسرع وأقل خطراً من write_file).",
    inputSchema: z.object({
      path: z.string().describe("مسار الملف المراد تعديله"),
      edits: z
        .array(
          z.object({
            find: z.string().describe("النص القديم كما هو حرفياً (فريد داخل الملف)"),
            replace: z.string().describe("النص الجديد الذي يحل محله"),
          }),
        )
        .describe("قائمة عمليات الاستبدال بالترتيب"),
      summary: z.string().describe("سطر واحد يشرح سبب التعديل"),
    }),
    execute: async ({ path, edits, summary }) => {
      const { supabase, userId, projectId: pid } = guard();
      const { data: existing } = await supabase
        .from("files")
        .select("id, version, content")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();
      if (!existing) {
        // الملف ليس في مساحة عمل المشروع — قد يكون من كود المنصة نفسها (تطوير ذاتي).
        if (isPlatformPath(path)) {
          return editPlatformFile(path, edits, summary);
        }
        return {
          ok: false,
          error: `الملف ${path} غير موجود في مساحة عمل المشروع. استخدم write_file لإنشائه، أو self_read_file/self_write_file إن كان من كود المنصة.`,
        };
      }

      let content = existing.content;
      const applied: string[] = [];
      const failed: string[] = [];
      for (const edit of edits) {
        const index = content.indexOf(edit.find);
        if (index === -1) {
          failed.push(edit.find.slice(0, 60));
          continue;
        }
        if (content.indexOf(edit.find, index + 1) !== -1) {
          failed.push(`(غير فريد) ${edit.find.slice(0, 60)}`);
          continue;
        }
        content = content.slice(0, index) + edit.replace + content.slice(index + edit.find.length);
        applied.push(edit.find.slice(0, 60));
      }

      if (applied.length === 0) {
        return { ok: false, path, error: "لم يُطابق أي مقطع.", failed };
      }

      await snapshot(supabase, pid, userId, path);
      const { data: updated, error } = await supabase
        .from("files")
        .update({ content, version: existing.version + 1 })
        .eq("id", existing.id)
        .eq("version", existing.version)
        .select("version")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) {
        return { ok: false, path, error: "تعارض إصدارات — أعد read_file ثم أعد المحاولة." };
      }
      return {
        ok: true,
        path,
        version: updated.version,
        bytes: content.length,
        appliedCount: applied.length,
        failed,
        summary,
      };
    },
  });

  const readFile = tool({
    description: "يقرأ محتوى ملف من مساحة عمل المشروع.",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("files")
        .select("path, content, version")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();
      if (!data) return { path, found: false, content: "" };
      return { path, found: true, version: data.version, content: data.content };
    },
  });

  const listFiles = tool({
    description: "يسرد ملفات مساحة عمل المشروع الحالية مع أحجامها.",
    inputSchema: z.object({}),
    execute: async () => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("files")
        .select("path, version, content")
        .eq("project_id", pid)
        .order("path", { ascending: true });
      return {
        files: ((data ?? []) as any[]).map((f: any) => ({
          path: f.path,
          version: f.version,
          bytes: f.content.length,
        })),
      };
    },
  });

  /** يزامن ملفات المشروع من قاعدة البيانات إلى مساحة التنفيذ الحقيقية. */
  const syncRuntime = async () => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase.from("files").select("path, content").eq("project_id", pid);
    const files = ((data ?? []) as any[]).map((f: any) => ({
      path: f.path,
      content: f.content ?? "",
    }));
    await runtimeSync(pid, files, false);
    return { pid, count: files.length };
  };

  const shell = tool({
    description:
      "ينفّذ أمر shell داخل حاوية تنفيذ حقيقية خاصة بالمشروع (Node 22 + npm + git + python). يزامن ملفات المشروع أولاً ثم يعيد المخرجات ورمز الخروج. استخدمه لـ npm install / npm run build / npx vitest.",
    inputSchema: z.object({
      command: z.string().describe("الأمر المراد تنفيذه"),
      reason: z.string().describe("سبب تنفيذ الأمر"),
      timeoutSeconds: z.number().int().min(5).max(600).default(300),
    }),
    execute: async ({ command, timeoutSeconds }) => {
      if (!runtimeConfigured()) {
        return { ok: false, error: "بيئة التنفيذ غير مفعّلة — استخدم run_command بدلاً منها." };
      }
      const { pid } = await syncRuntime();
      const result = await runtimeExec(pid, command, timeoutSeconds * 1000);
      return {
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        output: result.output.slice(-20_000),
      };
    },
  });

  const devServer = tool({
    description:
      "يدير خادم التطوير الحقيقي للمشروع داخل حاوية التنفيذ: start يشغّله ويعيد رابط المعاينة الحيّة، logs يقرأ السجل لاكتشاف الأخطاء، stop يوقفه.",
    inputSchema: z.object({
      action: z.enum(["start", "stop", "logs", "status"]),
      command: z.string().optional().describe("أمر مخصص للتشغيل (اختياري)"),
    }),
    execute: async ({ action, command }) => {
      if (!runtimeConfigured()) {
        return { ok: false, error: "بيئة التنفيذ غير مفعّلة على هذه النسخة." };
      }
      const { projectId: pid } = guard();
      if (action === "stop") return { ...(await runtimeDevStop(pid)), ok: true };
      if (action === "status") return { ...(await runtimeDevStatus(pid)), ok: true };
      if (action === "logs") {
        const logs = await runtimeDevLogs(pid, 200);
        return { ok: true, logs: logs.logs?.slice(-120) ?? [] };
      }
      await syncRuntime();
      const started = await runtimeDevStart(pid, command);
      return {
        ...started,
        ok: started.ready === true,
        previewUrl: `/api/public/rt/${pid}/`,
        logs: (started.logs ?? []).slice(-60),
      };
    },
  });

  /** كتابة ملف داخلي (تقارير الفحص واللقطات) دون المرور بأداة write_file. */
  const saveInternalFile = async (path: string, content: string) => {
    const { supabase, userId, projectId: pid } = guard();
    const { data: existing } = await supabase
      .from("files")
      .select("id, version")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("files")
        .update({ content, version: (existing as any).version + 1 })
        .eq("id", (existing as any).id);
    } else {
      await supabase.from("files").insert({ project_id: pid, user_id: userId, path, content });
    }
  };

  /** فحص متصفح حقيقي داخل حاوية التنفيذ (لا يحتاج منفّذاً خارجياً). */
  const runBrowserCheck = async (opts: {
    path?: string;
    devices?: string[];
    screenshots?: boolean;
  }) => {
    const { projectId: pid } = guard();
    await syncRuntime();
    const status = await runtimeDevStatus(pid).catch(() => null);
    if (!status?.running) {
      // مشروع ثابت أو خادم متوقف: خادم الحاوية يقدّم الملفات مباشرة، فلا حاجة للتشغيل.
      await runtimeDevStart(pid).catch(() => undefined);
    }
    const result = await runtimeBrowserCheck(pid, {
      path: opts.path ?? "",
      devices: opts.devices ?? ["desktop", "mobile"],
      screenshots: opts.screenshots !== false,
    });
    for (const r of result.results) {
      if (r.screenshot) await saveInternalFile(`.weaver/shot-${r.device}.txt`, r.screenshot);
    }
    return result;
  };

  const browserCheckTool = tool({
    description:
      "فحص متصفح حقيقي (Chromium) داخل حاوية المشروع: يفتح المعاينة الحيّة على أحجام شاشة متعددة، يجمع أخطاء الكونسول والشبكة وملاحظات الوصولية والتمرير الأفقي، ويحفظ لقطات الشاشة لاستخدامها في design_review. لا يحتاج منفّذاً خارجياً. نفّذه بعد run_checks وقبل publish_site.",
    inputSchema: z.object({
      path: z
        .string()
        .default("")
        .describe("مسار الصفحة داخل المعاينة مثل about.html (فارغ = الرئيسية)"),
      devices: z.array(z.enum(["desktop", "tablet", "mobile"])).default(["desktop", "mobile"]),
    }),
    execute: async ({ path, devices }) => {
      if (!runtimeConfigured()) {
        return { ok: false, error: "بيئة التنفيذ غير مفعّلة — استخدم visual_audit عبر المنفّذ." };
      }
      const result = await runBrowserCheck({ path, devices });
      return {
        ok: result.ok,
        errors: result.errors.slice(0, 40),
        warnings: result.warnings.slice(0, 40),
        pages: result.results.map((r) => ({
          device: r.device,
          status: r.status,
          title: r.title,
          navError: r.navError,
          screenshotSaved: Boolean(r.screenshot),
        })),
        hint: result.ok
          ? "لا أخطاء في المتصفح — يمكنك متابعة design_review ثم النشر."
          : "أصلح كل خطأ ثم أعد browser_check حتى ok=true.",
      };
    },
  });

  /** حلقة إصلاح ذاتي مغلقة: تشغيل → قراءة الأخطاء الحقيقية → تقرير قابل للتنفيذ. */
  const autoRepair = tool({
    description:
      "حلقة إصلاح ذاتي مغلقة: تزامن الملفات، تشغّل خادم التطوير، تقرأ سجل البناء وأخطاء المتصفح الفعلية، وتعيد قائمة أخطاء مرتّبة مع الملفات المرشّحة للإصلاح. استخدمها بعد كل دفعة كتابة وكرّرها بعد كل إصلاح حتى تصبح clean=true.",
    inputSchema: z.object({
      install: z
        .boolean()
        .default(false)
        .describe("تشغيل npm install قبل الفحص إن تغيّرت الاعتماديات"),
      page: z.string().default("").describe("الصفحة المراد فحصها في المتصفح"),
    }),
    execute: async ({ install, page }) => {
      if (!runtimeConfigured()) {
        return { ok: false, error: "بيئة التنفيذ غير مفعّلة — استخدم fix_errors + run_checks." };
      }
      const { pid } = await syncRuntime();
      const steps: Array<{ step: string; ok: boolean; detail: string }> = [];

      if (install) {
        const res = await runtimeExec(pid, "npm install --no-audit --no-fund", 300_000);
        steps.push({ step: "npm install", ok: res.ok, detail: res.output.slice(-3000) });
      }

      const started = await runtimeDevStart(pid).catch(
        (err) => ({ ready: false, logs: [String(err)] }) as any,
      );
      const logs = await runtimeDevLogs(pid, 200).catch(() => ({ logs: [], errors: [] }) as any);
      const buildErrors: string[] = (logs.errors ?? []).slice(-30);
      steps.push({
        step: "dev server",
        ok: Boolean(started?.ready),
        detail: (logs.logs ?? []).slice(-40).join("\n").slice(-4000),
      });

      let browser: Awaited<ReturnType<typeof runBrowserCheck>> | null = null;
      if (started?.ready !== false || buildErrors.length === 0) {
        browser = await runBrowserCheck({ path: page, devices: ["desktop", "mobile"] }).catch(
          () => null,
        );
      }

      const allErrors = [...buildErrors, ...(browser?.errors ?? [])];
      const clean = allErrors.length === 0 && Boolean(started?.ready);
      await saveInternalFile(
        ".weaver/auto-repair.json",
        JSON.stringify(
          {
            at: new Date().toISOString(),
            clean,
            errors: allErrors,
            warnings: browser?.warnings ?? [],
          },
          null,
          2,
        ),
      );

      return {
        ok: true,
        clean,
        previewUrl: `/api/public/rt/${pid}/`,
        errors: allErrors.slice(0, 40),
        warnings: (browser?.warnings ?? []).slice(0, 30),
        steps,
        next: clean
          ? "لا أخطاء — تابع design_review ثم publish_site."
          : "أصلح الأخطاء أعلاه بـ edit_file/write_file ثم أعد auto_repair. لا تعلن الإنجاز قبل clean=true.",
      };
    },
  });

  const runCommand = tool({
    description:
      "ينفّذ أمر shell حقيقياً على المنفّذ المتصل (npm install / build / test / git). ينتظر النتيجة ويعيد المخرجات ورمز الخروج. إن لم يكن هناك منفّذ متصل يبقى الأمر في الطابور ويُنفَّذ فور اتصال المنفّذ.",
    inputSchema: z.object({
      command: z.string().describe("الأمر المراد تشغيله"),
      reason: z.string().describe("لماذا هذا الأمر ولأي مهمة"),
      waitSeconds: z.number().int().min(0).max(240).default(120),
    }),
    execute: async ({ command, reason, waitSeconds }) => {
      const { supabase, userId, projectId: pid } = guard();

      const since = new Date(Date.now() - 90_000).toISOString();
      const { data: executor } = await supabase
        .from("executors")
        .select("id, name")
        .gt("last_seen_at", since)
        .limit(1)
        .maybeSingle();

      const { data: run, error } = await supabase
        .from("runs")
        .insert({
          project_id: pid,
          user_id: userId,
          kind: "command",
          input: { command, reason },
          status: "queued",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      if (!executor || waitSeconds === 0) {
        return {
          runId: run.id,
          command,
          status: "queued",
          message: executor
            ? `الأمر في الطابور على المنفّذ ${executor.name}. تابعه بـ run_status.`
            : "لا يوجد منفّذ متصل الآن — الأمر محفوظ في الطابور وسيُنفَّذ فور اتصال خادمك. أخبر المستخدم بذلك.",
        };
      }

      const deadline = Date.now() + waitSeconds * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const { data: row } = await supabase
          .from("runs")
          .select("status, output, exit_code")
          .eq("id", run.id)
          .maybeSingle();
        if (row && (row.status === "success" || row.status === "failed")) {
          return {
            runId: run.id,
            command,
            status: row.status,
            exitCode: row.exit_code,
            output: (row.output ?? "").slice(-12_000),
          };
        }
      }

      return {
        runId: run.id,
        command,
        status: "running",
        message: "ما زال قيد التنفيذ — استخدم run_status للاطلاع على النتيجة لاحقاً.",
      };
    },
  });

  /** يضع أمراً في طابور المنفّذ وينتظر نتيجته الحقيقية. */
  const queueCommand = async (command: string, reason: string, waitSeconds: number) => {
    const { supabase, userId, projectId: pid } = guard();
    const { data: run, error } = await supabase
      .from("runs")
      .insert({
        project_id: pid,
        user_id: userId,
        kind: "command",
        input: { command, reason },
        status: "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: row } = await supabase
        .from("runs")
        .select("status, output, exit_code")
        .eq("id", run.id)
        .maybeSingle();
      if (row && (row.status === "success" || row.status === "failed")) {
        return {
          runId: run.id,
          status: row.status,
          exitCode: row.exit_code,
          output: (row.output ?? "").slice(-8000),
        };
      }
    }
    return { runId: run.id, status: "running", exitCode: null, output: "" };
  };

  const readWorkspaceFile = async (path: string) => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase
      .from("files")
      .select("content")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();
    return data?.content ?? "";
  };

  const auditBaseCommand = () => {
    const origin = (
      process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app"
    ).replace(/\/+$/, "");
    return `curl -fsSL ${origin}/weaver-audit.mjs -o .weaver-audit.mjs && node .weaver-audit.mjs`;
  };

  const visualAudit = tool({
    description:
      "فحص بصري حقيقي: يفتح الموقع في متصفح Chromium فعلي على المنفّذ بثلاثة أحجام شاشة، يلتقط لقطات، ويشغّل axe-core للوصولية ويرصد أخطاء الكونسول والروابط المكسورة والتمرير الأفقي. نفّذه بعد run_checks وقبل publish_site. يتطلب منفّذاً متصلاً.",
    inputSchema: z.object({
      page: z.string().describe("الصفحة المراد فحصها مثل index.html"),
      waitSeconds: z.number().int().min(30).max(240).default(200),
    }),
    execute: async ({ page, waitSeconds }) => {
      const command = `${auditBaseCommand()} --page ${page.replace(/[^a-zA-Z0-9._/-]/g, "")}`;
      const result = await queueCommand(command, `فحص بصري للصفحة ${page}`, waitSeconds);
      if (result.status !== "success") {
        return {
          ...result,
          hint:
            result.status === "running"
              ? "التدقيق ما زال يعمل — تابعه بـ run_status ثم اقرأ .weaver/audit.json بـ read_file."
              : "لم ينجح التدقيق. إن لم يكن هناك منفّذ متصل أخبر المستخدم بتشغيله من الإعدادات ولا تدّعِ نجاح الفحص.",
        };
      }

      const raw = await readWorkspaceFile(".weaver/audit.json");
      if (!raw) return { ...result, error: "لم يُكتب تقرير التدقيق." };
      try {
        return { ...result, audit: JSON.parse(raw) };
      } catch {
        return { ...result, auditRaw: raw.slice(0, 6000) };
      }
    },
  });

  const captureReference = tool({
    description:
      "يلتقط لقطة شاشة حقيقية من موقع مرجعي خارجي حدّده المستخدم لتصبح المرجع البصري الملزم للتصميم. تُحفظ في .weaver/reference.txt وتُستخدم تلقائياً في design_review.",
    inputSchema: z.object({
      url: z.string().describe("رابط الموقع المرجعي الكامل"),
      waitSeconds: z.number().int().min(30).max(240).default(150),
    }),
    execute: async ({ url, waitSeconds }) => {
      if (!/^https:\/\//.test(url)) return { ok: false, error: "الرابط يجب أن يبدأ بـ https://" };
      const command = `${auditBaseCommand()} --url ${JSON.stringify(url)}`;
      const result = await queueCommand(command, `التقاط مرجع بصري من ${url}`, waitSeconds);
      const shot = await readWorkspaceFile(".weaver/reference.txt");
      return { ...result, captured: shot.length > 1000, bytes: shot.length, url };
    },
  });

  const designReview = tool({
    description:
      "مراجعة نقدية بالرؤية: يرسل لقطة الصفحة (من visual_audit) إلى نموذج رؤية ويعيد حكماً ودرجة وقائمة إصلاحات محددة، ويقارن بالمرجع البصري إن وُجد. نفّذه قبل publish_site وأصلح كل ملاحظة ثم أعده حتى يصبح VERDICT: pass.",
    inputSchema: z.object({
      context: z.string().describe("وصف موجز للصفحة ونوع المشروع والجمهور"),
      device: z.enum(["desktop", "tablet", "mobile"]).default("desktop"),
      useReference: z.boolean().default(true),
    }),
    execute: async ({ context, device, useReference }) => {
      const shot = await readWorkspaceFile(`.weaver/shot-${device}.txt`);
      if (shot.length < 1000) {
        return { ok: false, error: "لا توجد لقطة — نفّذ visual_audit أولاً." };
      }
      const reference = useReference ? await readWorkspaceFile(".weaver/reference.txt") : "";
      const result = await reviewScreenshot(
        shot,
        context,
        reference.length > 1000 ? reference : undefined,
      );
      return { ...result, device, comparedToReference: Boolean(reference) };
    },
  });

  const brandKit = tool({
    description:
      "يولّد هوية بصرية كاملة للمشروع ويكتبها كملفات: brand/tokens.css (لوحة ألوان محسوبة رياضياً بتباين WCAG مضمون + مقياس مسافات وطباعة + مكوّنات أساسية) و brand/logo.svg و brand/wordmark.svg و brand/favicon.svg و brand/BRAND.md و brand/head.html. نفّذه كأول خطوة في أي مشروع واجهة قبل كتابة أي HTML، ثم اربط brand/tokens.css في كل صفحة ولا تكتب أي لون مباشر بعدها.",
    inputSchema: z.object({
      brandName: z.string().describe("اسم العلامة كما يظهر للزائر"),
      personality: z
        .string()
        .describe(
          "طابع العلامة: technical أو warm أو luxury أو playful أو natural أو medical أو editorial (أو وصف عربي مثل «مطعم دافئ»)",
        ),
      baseColor: z
        .string()
        .describe("لون أساسي بصيغة hex إن طلبه المستخدم، أو نص فارغ ليُشتق تلقائياً"),
      locale: z.enum(["ar", "en"]).describe("لغة المحتوى الأساسية"),
      scheme: z.enum(["light", "dark"]).describe("الوضع الافتراضي للواجهة"),
      logoStyle: z.enum(["monogram", "geometric", "wordmark"]).describe("نمط الشعار"),
    }),
    execute: async ({ brandName, personality, baseColor, locale, scheme, logoStyle }) => {
      const { supabase, userId, projectId: pid } = guard();
      const kit = buildBrandKit({
        brandName,
        personality,
        ...(baseColor?.trim() ? { baseColor } : {}),
        locale,
        scheme,
        logoStyle,
      });

      const written: string[] = [];
      for (const file of kit.files) {
        const { data: existing } = await supabase
          .from("files")
          .select("id, version")
          .eq("project_id", pid)
          .eq("path", file.path)
          .maybeSingle();
        if (existing) {
          await snapshot(supabase, pid, userId, file.path);
          await supabase
            .from("files")
            .update({ content: file.content, version: existing.version + 1 })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("files")
            .insert({ project_id: pid, user_id: userId, path: file.path, content: file.content });
        }
        written.push(file.path);
      }

      return {
        written,
        palette: kit.palette,
        fonts: kit.fonts,
        summary: kit.summary,
        headSnippet: kit.files.find((f) => f.path === "brand/head.html")?.content ?? "",
      };
    },
  });

  const stackPlanTool = tool({
    description:
      "يعيد المنظومة الهندسية الموصى بها لبناء مشروع كبير: الإطار والحزم وأوامر التهيئة وبنية المجلدات ومعايير الجودة. نفّذه قبل أي مشروع أكبر من صفحة واحدة، ثم ثبّت الحزم عبر shell/run_command.",
    inputSchema: z.object({
      kind: z
        .enum([
          "landing",
          "marketing",
          "dashboard",
          "saas",
          "ecommerce",
          "api",
          "realtime",
          "content",
        ])
        .describe("نوع المشروع المطلوب"),
    }),
    execute: async ({ kind }) => buildStackPlan(kind as StackKind),
  });

  const seoKit = tool({
    description:
      "يولّد ويكتب طبقة SEO والأصول القياسية للموقع: sitemap.xml و robots.txt و site.webmanifest و favicon.svg وكتلة <head> جاهزة (canonical + Open Graph + JSON-LD). نفّذه قبل النشر وألصق كتلة الـ head في كل صفحة.",
    inputSchema: z.object({
      siteName: z.string().describe("اسم الموقع كما يظهر للزائر"),
      description: z.string().describe("وصف الموقع في أقل من 155 حرفاً"),
      baseUrl: z
        .string()
        .describe("العنوان الأساسي للموقع بعد النشر مثل https://example.com/s/my-site"),
      themeColor: z.string().describe("لون الهوية بصيغة hex مثل #0f766e"),
      organizationType: z
        .string()
        .describe("نوع الجهة في schema.org مثل Organization أو LocalBusiness أو Person"),
    }),
    execute: async ({ siteName, description, baseUrl, themeColor, organizationType }) => {
      const { supabase, userId, projectId: pid } = guard();
      const { data: files } = await supabase.from("files").select("path").eq("project_id", pid);

      const kit = buildSeoKit({
        siteName,
        description,
        baseUrl,
        themeColor,
        organizationType,
        pages: ((files ?? []) as any[]).map((f: any) => f.path),
      });

      const written: string[] = [];
      for (const file of kit.files) {
        const { data: existing } = await supabase
          .from("files")
          .select("id, version")
          .eq("project_id", pid)
          .eq("path", file.path)
          .maybeSingle();
        if (existing) {
          await snapshot(supabase, pid, userId, file.path);
          await supabase
            .from("files")
            .update({ content: file.content, version: existing.version + 1 })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("files")
            .insert({ project_id: pid, user_id: userId, path: file.path, content: file.content });
        }
        written.push(file.path);
      }

      return { written, headSnippet: kit.headSnippet };
    },
  });

  const promoteBuild = tool({
    description:
      "ينقل ناتج البناء (مجلد dist/ أو build/) إلى جذر مساحة العمل حتى يعمل النشر على /s/<slug>. استخدمه بعد نجاح npm run build عبر run_command.",
    inputSchema: z.object({
      from: z.string().describe("مجلد ناتج البناء مثل dist أو build"),
      reason: z.string().describe("سبب الترقية"),
    }),
    execute: async ({ from, reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      const prefix = `${from.replace(/^\/+|\/+$/g, "")}/`;
      const { data: files } = await supabase
        .from("files")
        .select("path, content")
        .eq("project_id", pid)
        .like("path", `${prefix}%`);

      if (!files?.length) {
        return {
          ok: false,
          error: `لا توجد ملفات تحت ${prefix} — شغّل البناء أولاً عبر run_command.`,
        };
      }

      const moved: string[] = [];
      for (const file of files) {
        const target = file.path.slice(prefix.length);
        if (!target || target.includes("..")) continue;
        const { data: existing } = await supabase
          .from("files")
          .select("id, version")
          .eq("project_id", pid)
          .eq("path", target)
          .maybeSingle();
        if (existing) {
          await snapshot(supabase, pid, userId, target);
          await supabase
            .from("files")
            .update({ content: file.content, version: existing.version + 1 })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("files")
            .insert({ project_id: pid, user_id: userId, path: target, content: file.content });
        }
        moved.push(target);
      }

      return { ok: true, moved, count: moved.length, reason };
    },
  });

  const runStatus = tool({
    description: "يعرض حالة ومخرجات أمر سابق أُرسل إلى المنفّذ عبر run_command.",
    inputSchema: z.object({ runId: z.string().uuid() }),
    execute: async ({ runId }) => {
      const { supabase } = guard();
      const { data } = await supabase
        .from("runs")
        .select("status, output, exit_code, input")
        .eq("id", runId)
        .maybeSingle();
      if (!data) return { error: "الأمر غير موجود." };
      return {
        status: data.status,
        exitCode: data.exit_code,
        command: ((data.input ?? {}) as { command?: string }).command ?? "",
        output: (data.output ?? "").slice(-12_000),
      };
    },
  });

  const runChecksTool = tool({
    description:
      "ينفّذ فحصاً حقيقياً على ملفات مساحة العمل: تحليل نحوي لملفات JavaScript، تحقق من صحة JSON، توازن CSS، سلامة وسوم HTML، ووجود المراجع المحلية. يسجّل النتيجة في سجل التشغيل. استخدمه قبل إعلان نجاح أي مهمة.",
    inputSchema: z.object({
      reason: z.string().describe("لأي مهمة يجري هذا الفحص"),
    }),
    execute: async ({ reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      const { data } = await supabase
        .from("files")
        .select("path, content")
        .eq("project_id", pid)
        .order("path", { ascending: true });

      const report = runChecks(data ?? []);
      await supabase.from("runs").insert({
        project_id: pid,
        user_id: userId,
        kind: "check",
        input: { command: "weaver verify", reason },
        status: report.ok ? "passed" : "failed",
        exit_code: report.ok ? 0 : 1,
        output: JSON.stringify(report),
      });

      return report;
    },
  });

  const fixErrors = tool({
    description:
      "يعيد تشغيل run_checks تلقائياً ويصلح الأخطاء والتحذيرات المكتشفة في ملفات مساحة العمل. استخدمه عندما يطلب المستخدم 'أصلح الأخطاء' أو بعد كتابة ملفات لضمان نظافة الفحص.",
    inputSchema: z.object({
      maxIterations: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe("عدد محاولات الإصلاح القصوى"),
      focus: z.enum(["errors", "warnings", "all"]).default("all").describe("أي المشاكل تُصلح"),
    }),
    execute: async ({ maxIterations, focus }) => {
      const { supabase, userId, projectId: pid } = guard();
      const apiKey = process.env["OPENROUTER_API_KEY"];
      if (!apiKey) return { ok: false, error: "OPENROUTER_API_KEY غير مضبوط" };

      const origin = process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app";
      const openrouter = createOpenRouterProvider(apiKey, origin);
      const fixerModel = process.env["WEAVER_FIXER_MODEL"] || "google/gemini-2.5-flash";

      let files =
        (
          await supabase
            .from("files")
            .select("path, content")
            .eq("project_id", pid)
            .order("path", { ascending: true })
        ).data ?? [];

      let report = runChecks(files);
      if (report.ok) return { ok: true, fixed: [], iterations: 0, report };

      const fixedFiles: string[] = [];
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const issuesToFix =
          focus === "all"
            ? report.issues
            : report.issues.filter((i) =>
                focus === "errors" ? i.severity === "error" : i.severity === "warning",
              );

        const byFile = new Map<string, Issue[]>();
        for (const issue of issuesToFix) {
          if (!issue.path || issue.path === "-") continue;
          const arr = byFile.get(issue.path) ?? [];
          arr.push(issue);
          byFile.set(issue.path, arr);
        }

        if (byFile.size === 0) break;

        const batch: { path: string; content: string }[] = [];
        for (const [path, fileIssues] of byFile.entries()) {
          const file = (files as any[]).find((f: any) => f.path === path);
          if (!file) continue;
          const prompt = buildFixPrompt(path, file.content, fileIssues);
          const result = await generateText({
            model: openrouter(fixerModel),
            messages: [{ role: "user", content: prompt }],
            maxOutputTokens: 12_000,
          });
          // تسجيل استهلاك نموذج الإصلاح حتى تبقى الفوترة دقيقة
          try {
            const inputTokens = result.usage?.inputTokens ?? 0;
            const outputTokens = result.usage?.outputTokens ?? 0;
            if (inputTokens || outputTokens) {
              await supabase.from("usage_events").insert({
                project_id: pid,
                user_id: userId,
                model: fixerModel,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: result.usage?.totalTokens ?? inputTokens + outputTokens,
                cost_usd: estimateCostUsd(fixerModel, inputTokens, outputTokens),
              });
            }
          } catch {
            /* تتبّع الاستهلاك لا يُفشل الإصلاح */
          }
          const fixed = extractCode(result.text);

          if (fixed && fixed !== file.content) {
            batch.push({ path, content: fixed });
          }
        }

        for (const { path, content } of batch) {
          await snapshot(supabase, pid, userId, path);
          const { data: existing } = await supabase
            .from("files")
            .select("id, version")
            .eq("project_id", pid)
            .eq("path", path)
            .maybeSingle();
          if (existing) {
            await supabase
              .from("files")
              .update({ content, version: existing.version + 1 })
              .eq("id", existing.id);
          } else {
            await supabase
              .from("files")
              .insert({ project_id: pid, user_id: userId, path, content });
          }
          fixedFiles.push(path);
        }

        files =
          (
            await supabase
              .from("files")
              .select("path, content")
              .eq("project_id", pid)
              .order("path", { ascending: true })
          ).data ?? [];
        report = runChecks(files);
        if (report.ok) break;
      }

      await supabase.from("runs").insert({
        project_id: pid,
        user_id: userId,
        kind: "check",
        input: { command: "weaver fix_errors", focus, maxIterations },
        status: report.ok ? "passed" : "failed",
        exit_code: report.ok ? 0 : 1,
        output: JSON.stringify(report),
      });

      return {
        ok: report.ok,
        fixed: [...new Set(fixedFiles)],
        iterations: maxIterations,
        report,
      };
    },
  });

  const publishSite = tool({
    description:
      "ينشر مساحة عمل المشروع كموقع عام مباشر على مسار /s/<slug>. استخدمه بعد نجاح run_checks ووجود index.html.",
    inputSchema: z.object({
      slug: z.string().describe("عنوان مختصر بالإنجليزية للموقع، مثل coffee-shop"),
      reason: z.string().describe("سبب النشر / أي مهمة يحقق"),
    }),
    execute: async ({ slug, reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      const base =
        slug
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "site";

      const { data: workspace } = await supabase
        .from("files")
        .select("path, content")
        .eq("project_id", pid)
        .order("path", { ascending: true });
      const files = workspace ?? [];
      const index = files.find((file: { path: string }) => file.path === "index.html");
      const styles = files.find((file: { path: string }) => file.path === "styles.css");
      if (!index) throw new Error("لا يوجد index.html في مساحة العمل — أنشئه أولاً.");
      if (!styles || styles.content.trim().length < 400) {
        throw new Error("لا يوجد styles.css صالح واحترافي — أكمل التصميم أولاً.");
      }
      const report = runChecks(files);
      if (!report.ok) {
        throw new Error(`فشل النشر لأن فحص الجودة لم ينجح: ${report.summary}`);
      }

      const { data: latestRun } = await supabase
        .from("runs")
        .select("status")
        .eq("project_id", pid)
        .eq("kind", "check")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRun?.status !== "passed") {
        throw new Error("يجب تنفيذ run_checks بنجاح مباشرة قبل النشر.");
      }

      let finalSlug = "";
      for (let i = 0; i < 25; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`;
        const { error } = await supabase
          .from("projects")
          .update({
            slug: candidate,
            published: true,
            published_at: new Date().toISOString(),
            status: "deployed",
          })
          .eq("id", pid);
        if (!error) {
          finalSlug = candidate;
          break;
        }
        if (!error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
      }
      if (!finalSlug) throw new Error("تعذّر إيجاد عنوان متاح للنشر");

      await setDeployedUrl(pid, `${origin}/s/${finalSlug}`);
      await supabase.from("runs").insert({
        project_id: pid,
        user_id: userId,
        kind: "deploy",
        input: { slug: finalSlug, reason },
        status: "succeeded",
        exit_code: 0,
        output: `published at /s/${finalSlug}`,
      });

      return { url: `${origin}/s/${finalSlug}`, slug: finalSlug, deployed: true };
    },
  });

  const configureCustomDomain = tool({
    description:
      "يربط دوميناً مخصّصاً (مثل example.com) بالموقع المنشور: يتحقّق من سجلات DNS، ثم يهيّئ nginx على السيرفر ويصدر شهادة SSL تلقائياً. استخدمه بعد publish_site فقط. إذا لم تكن سجلات DNS جاهزة يعيد التعليمات الواجب على المستخدم إضافتها عند مزوّد الدومين.",
    inputSchema: z.object({
      domain: z.string().describe("الدومين بدون https مثل example.com"),
      email: z.string().optional().describe("بريد لإصدار شهادة Let's Encrypt (اختياري)"),
    }),
    execute: async ({ domain, email }) => {
      const { supabase, projectId: pid } = guard();
      const mod = await import("@/lib/domains.server");
      const clean = mod.normalizeDomain(domain);

      const { data: project } = await supabase
        .from("projects")
        .select("slug, published")
        .eq("id", pid)
        .maybeSingle();
      const slug = (project as { slug?: string | null } | null)?.slug ?? "";
      if (!project || !(project as { published?: boolean }).published || !slug) {
        throw new Error("انشر الموقع أولاً عبر publish_site ثم اربط الدومين.");
      }

      const dns = await mod.checkDomainDns(clean);
      const instructions = mod.dnsInstructions(clean);
      if (!dns.ok) {
        await mod.saveDomainState(pid, clean, "pending_dns", dns.detail);
        return {
          ok: false,
          stage: "dns",
          domain: clean,
          detail: dns.detail,
          instructions,
          message: `سجلات DNS غير جاهزة. اطلب من المستخدم إضافتها ثم أعد المحاولة:\n${instructions}`,
        };
      }

      const setup = await mod.requestDomainSetup(
        clean,
        slug,
        email ?? process.env["LETSENCRYPT_EMAIL"] ?? "",
      );
      await mod.saveDomainState(
        pid,
        clean,
        setup.ok ? "configuring" : "failed",
        setup.ok ? null : setup.log,
      );
      return {
        ok: setup.ok,
        stage: "provision",
        domain: clean,
        jobId: setup.jobId,
        url: `https://${clean}`,
        instructions,
        message: setup.ok
          ? `جارٍ تهيئة ${clean} وإصدار شهادة SSL على السيرفر. الرابط النهائي: https://${clean}`
          : `تعذّرت التهيئة: ${setup.log}`,
      };
    },
  });



  const appendFile = tool({
    description:
      "يلحق محتوى بنهاية ملف موجود في مساحة العمل (أو ينشئه إن لم يوجد). استخدمه لكتابة الملفات الكبيرة على دفعات دون اقتطاع.",
    inputSchema: z.object({
      path: z.string().describe("مسار الملف"),
      content: z.string().describe("الجزء التالي من المحتوى"),
    }),
    execute: async ({ path, content }) => {
      if (content.length > 400_000) {
        return {
          ok: false,
          path,
          error: "دفعة الإلحاق أكبر من 400000 حرف؛ قسّمها إلى دفعات أصغر.",
        };
      }
      const { supabase, userId, projectId: pid } = guard();
      const { data: existing } = await supabase
        .from("files")
        .select("id, version, content")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from("files")
          .insert({ project_id: pid, user_id: userId, path, content });
        if (error) throw new Error(error.message);
        return { path, version: 1, bytes: content.length };
      }

      const next = existing.content + content;
      await snapshot(supabase, pid, userId, path);
      const { error } = await supabase
        .from("files")
        .update({ content: next, version: existing.version + 1 })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { path, version: existing.version + 1, bytes: next.length };
    },
  });

  const deleteFile = tool({
    description: "يحذف ملفاً من مساحة عمل المشروع.",
    inputSchema: z.object({ path: z.string(), reason: z.string() }),
    execute: async ({ path, reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      await snapshot(supabase, pid, userId, path);
      const { error } = await supabase
        .from("files")
        .delete()
        .eq("project_id", pid)
        .eq("path", path);
      if (error) throw new Error(error.message);
      return { path, deleted: true, reason };
    },
  });

  const generateImage = tool({
    description:
      "يولّد صورة حقيقية بالذكاء الاصطناعي ويحفظها كملف في مساحة العمل (مثل assets/hero.png). استخدمها بدل الصور الوهمية أو placeholder.",
    inputSchema: z.object({
      path: z.string().describe("مسار حفظ الصورة داخل المشروع، مثل assets/hero.png"),
      prompt: z.string().describe("وصف دقيق بالإنجليزية للصورة المطلوبة"),
    }),
    execute: async ({ path, prompt }) => {
      const { supabase, userId, projectId: pid } = guard();
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) return { path, ok: false, error: "مفتاح توليد الصور غير متاح" };

      const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
          stream: false,
        }),
      });
      if (!response.ok) {
        return { path, ok: false, error: `فشل التوليد (${response.status})` };
      }

      const payload = (await response.json()) as {
        data?: { b64_json?: string; url?: string }[];
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
      };
      const b64 = payload.data?.[0]?.b64_json;
      const direct =
        payload.data?.[0]?.url ?? payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const dataUrl = b64 ? `data:image/png;base64,${b64}` : direct;
      if (!dataUrl?.startsWith("data:")) {
        return { path, ok: false, error: "لم تُرجع الخدمة صورة صالحة" };
      }

      const { data: existing } = await supabase
        .from("files")
        .select("id, version")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();

      if (existing) {
        await snapshot(supabase, pid, userId, path);
        await supabase
          .from("files")
          .update({ content: dataUrl, version: existing.version + 1 })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("files")
          .insert({ project_id: pid, user_id: userId, path, content: dataUrl });
      }

      return { path, ok: true, bytes: dataUrl.length, usage: `<img src="${path}" alt="">` };
    },
  });

  const envList = tool({
    description: "يسرد أسماء مفاتيح/متغيّرات هذا المشروع المحفوظة (بدون قيمها).",
    inputSchema: z.object({}),
    execute: async () => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("project_secrets")
        .select("name, updated_at")
        .eq("project_id", pid);
      return { secrets: data ?? [] };
    },
  });

  const envGet = tool({
    description:
      "يقرأ قيمة مفتاح مشروع محفوظ لاستخدامه في كود الموقع أو الاتصال بخدمة خارجية. لا تطبع القيمة في ردّك للمستخدم.",
    inputSchema: z.object({ name: z.string() }),
    execute: async ({ name }) => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("project_secrets")
        .select("value")
        .eq("project_id", pid)
        .eq("name", name)
        .maybeSingle();
      return data ? { name, found: true, value: data.value } : { name, found: false };
    },
  });

  const memorySave = tool({
    description:
      "يحفظ معلومة دائمة عن هذا المشروع (قرار معماري، تفضيل المستخدم، هوية بصرية، قاعدة عمل) لتبقى متاحة في كل المحادثات القادمة. استخدمه كلما اتُّخذ قرار مهم.",
    inputSchema: z.object({
      key: z.string().min(1).max(80).describe("مفتاح قصير مثل brand.colors أو decision.auth"),
      value: z.string().min(1).max(8000),
      kind: z.enum(["decision", "preference", "constraint", "brand", "note"]).default("note"),
    }),
    execute: async ({ key, value, kind }) => {
      const { supabase, projectId: pid, userId } = guard();
      const { error } = await supabase
        .from("project_memory")
        .upsert(
          { project_id: pid, user_id: userId, key, value, kind },
          { onConflict: "project_id,key" },
        );
      if (error) return { ok: false, error: error.message };
      return { ok: true, key, kind };
    },
  });

  const memoryList = tool({
    description: "يقرأ كل ذاكرة هذا المشروع. نفّذه في بداية أي محادثة جديدة على مشروع قائم.",
    inputSchema: z.object({}),
    execute: async () => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("project_memory")
        .select("key, value, kind, updated_at")
        .eq("project_id", pid)
        .order("updated_at", { ascending: false });
      return { memory: data ?? [] };
    },
  });

  const memoryDelete = tool({
    description: "يحذف معلومة من ذاكرة المشروع عندما تصبح غير صحيحة.",
    inputSchema: z.object({ key: z.string().min(1) }),
    execute: async ({ key }) => {
      const { supabase, projectId: pid } = guard();
      await supabase.from("project_memory").delete().eq("project_id", pid).eq("key", key);
      return { ok: true, key };
    },
  });

  return {
    write_file: writeFile,
    write_files: writeFiles,

    edit_file: editFile,

    append_file: appendFile,
    delete_file: deleteFile,
    read_file: readFile,
    list_files: listFiles,
    run_command: runCommand,
    shell: shell,
    dev_server: devServer,
    browser_check: browserCheckTool,
    auto_repair: autoRepair,
    run_status: runStatus,

    run_checks: runChecksTool,
    fix_errors: fixErrors,
    visual_audit: visualAudit,
    design_review: designReview,
    capture_reference: captureReference,
    brand_kit: brandKit,
    stack_plan: stackPlanTool,
    seo_kit: seoKit,
    promote_build: promoteBuild,
    publish_site: publishSite,
    configure_custom_domain: configureCustomDomain,
    generate_image: generateImage,
    env_list: envList,
    env_get: envGet,
    memory_save: memorySave,
    memory_list: memoryList,
    memory_delete: memoryDelete,
  };
}

/** أدوات التطوير الذاتي: تعديل كود منصة Weaver نفسها عبر مستودعها. */
/** أدوات التعديل الذاتي بمراجعة: تقترح تغييراً على كود المنصة بدل كتابته مباشرة. */
function platformTools(auth: AuthedContext | null) {
  return {
    propose_platform_change: tool({
      description:
        "يقترح تعديلاً على كود منصة Weaver نفسها ويحفظه كطلب مراجعة يظهر للمالك في صفحة «تطوير المنصة» مع Diff، ولا يُكتب حتى يعتمده. استخدمه بدل self_write_file عند أي تعديل على المنصة إلا إذا طلب المالك التطبيق المباشر.",
      inputSchema: z.object({
        title: z.string().describe("عنوان مختصر للتغيير"),
        description: z.string().describe("شرح ما سيتغيّر ولماذا"),
        files: z
          .array(z.object({ path: z.string(), content: z.string() }))
          .describe("الملفات بمحتواها الكامل بعد التعديل"),
      }),
      execute: async ({ title, description, files }) => {
        if (!auth) throw new Error("الجلسة غير صالحة");
        const { getSql } = await import("@/lib/db");
        const { ensurePlatformTables } = await import("@/lib/platform.server");
        const { getSelfRepo, selfRead, assertAllowed } = await import("@/lib/self-repo.server");
        await ensurePlatformTables();
        const repo = getSelfRepo();
        if (!repo) throw new Error("مستودع المنصة غير مضبوط");
        const payload: { path: string; before: string; after: string }[] = [];
        for (const f of files.slice(0, 20)) {
          const clean = assertAllowed(f.path);
          const current = await selfRead(repo, clean);
          payload.push({ path: clean, before: current.content, after: f.content });
        }
        const sql = getSql();
        const rows = await sql`
          INSERT INTO public.platform_changes (user_id, title, description, files)
          VALUES (${auth.userId}, ${title}, ${description ?? ""}, ${JSON.stringify(payload)}::jsonb)
          RETURNING id
        `;
        return {
          ok: true,
          changeId: String(rows[0]?.["id"] ?? ""),
          files: payload.map((f) => f.path),
          note: "بانتظار اعتماد المالك من صفحة تطوير المنصة",
        };
      },
    }),
    platform_settings_get: tool({
      description:
        "يقرأ إعدادات المنصة الحالية (النماذج، الحدود، الهوية) التي يضبطها المالك بلا كود.",
      inputSchema: z.object({}),
      execute: async () => {
        const { loadPlatformSettings } = await import("@/lib/platform.server");
        return loadPlatformSettings();
      },
    }),
  };
}

function selfTools() {
  const repo = getSelfRepo();
  if (!repo) return {};

  return {
    self_list_files: tool({
      description:
        "يسرد ملفات كود منصة Weaver نفسها (المستودع). استخدمه عندما يطلب المستخدم تعديل المنصة نفسها (ميزة، إصلاح، تغيير لون أو نص).",
      inputSchema: z.object({
        prefix: z.string().describe("بادئة المسار مثل src/components أو نص فارغ للكل"),
      }),
      execute: async ({ prefix }) => ({ files: await selfList(repo, prefix) }),
    }),
    self_read_file: tool({
      description: "يقرأ ملفاً من كود منصة Weaver نفسها. اقرأ دائماً قبل أي تعديل ذاتي.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => selfRead(repo, path),
    }),
    self_write_file: tool({
      description:
        "يكتب/يحدّث ملفاً في كود منصة Weaver نفسها ويعمل commit على الفرع الافتراضي. استخدمه فقط بعد self_read_file وبمحتوى كامل للملف، وبعد موافقة صريحة من المستخدم على تعديل المنصة.",
      inputSchema: z.object({
        path: z.string().describe("مسار الملف داخل مستودع Weaver"),
        content: z.string().describe("المحتوى الكامل للملف بعد التعديل"),
        message: z.string().describe("رسالة الـ commit بالعربية"),
        confirmed: z
          .boolean()
          .describe("true فقط إذا وافق المستخدم صراحةً في هذه المحادثة على تعديل كود المنصة"),
      }),
      execute: async ({ path, content, message, confirmed }) => {
        if (!confirmed) {
          return {
            error:
              "تعديل كود المنصة يحتاج موافقة صريحة من المستخدم. اسأله أولاً ثم أعد المحاولة مع confirmed=true.",
          };
        }
        // منع الكتابة على ملفات حسّاسة تكسر الأمان أو النشر
        const blocked = [
          /^\.env/i,
          /^supabase\/config\.toml$/i,
          /^src\/integrations\/supabase\//i,
          /^\.github\/workflows\//i,
          /(^|\/)package-lock\.json$|(^|\/)bun\.lock/i,
        ];
        const clean = path.replace(/^\.?\//, "");
        if (blocked.some((rule) => rule.test(clean))) {
          return { error: `الملف ${clean} محميّ ولا يمكن تعديله ذاتياً.` };
        }
        return selfWrite(repo, clean, content, message);
      },
    }),
    self_map: tool({
      description:
        "خريطة كود منصة Weaver: المجلدات وعدد ملفاتها وأكبر الملفات. استخدمه أولاً قبل أي إصلاح ذاتي لتحديد مكان العمل بأقل توكينز.",
      inputSchema: z.object({}),
      execute: async () => selfMap(repo),
    }),
    self_search: tool({
      description:
        "بحث نصّي داخل كود المنصة يعيد المسار ورقم السطر والنص. استخدمه للعثور على مكان الميزة أو الخطأ بدل التخمين.",
      inputSchema: z.object({
        query: z.string().describe("النص المطلوب البحث عنه"),
        prefix: z.string().describe("نطاق البحث مثل src أو deploy — استخدم src افتراضياً"),
      }),
      execute: async ({ query, prefix }) => selfSearch(repo, query, prefix || "src"),
    }),
    self_edit_file: tool({
      description:
        "تعديل جراحي على ملف من كود المنصة: يستبدل مقاطع محددة بدل إعادة كتابة الملف كاملاً، ويمر ببوابة تحقق قبل الالتزام. هذه الأداة المفضّلة لإصلاح المنصة.",
      inputSchema: z.object({
        path: z.string().describe("مسار الملف داخل مستودع Weaver"),
        edits: z
          .array(z.object({ find: z.string(), replace: z.string() }))
          .describe("مقاطع فريدة للاستبدال (find يجب أن يظهر مرة واحدة فقط)"),
        message: z.string().describe("رسالة الـ commit بالعربية"),
      }),
      execute: async ({ path, edits, message }) => {
        try {
          return await selfEdit(repo, path, edits, message);
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
    self_auto_repair: tool({
      description:
        "حلقة إصلاح مغلقة: يقرأ سجل آخر نشر فاشل، يستخرج رسائل الأخطاء والملفات المتورطة ويعيد محتواها لتصلحها مباشرة عبر self_edit_file ثم تعيد النشر.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getSql } = await import("@/lib/db");
        const { ensurePlatformTables } = await import("@/lib/platform.server");
        await ensurePlatformTables();
        const sql = getSql();
        const rows = await sql`
          SELECT status, log, created_at FROM public.platform_deploys
          ORDER BY created_at DESC LIMIT 1
        `;
        const last = rows[0];
        if (!last) return { ok: true, note: "لا يوجد سجل نشر بعد" };
        const log = String(last["log"] ?? "");
        if (last["status"] === "success") return { ok: true, note: "آخر نشر ناجح — لا حاجة للإصلاح" };
        const lines = log.split("\n");
        const errors = lines
          .filter((l) => /error|failed|cannot find|is not|TS\d{4}/i.test(l))
          .slice(-40);
        const paths = [
          ...new Set(
            [...log.matchAll(/(?:^|[\s(])((?:src|deploy)\/[\w./-]+\.(?:tsx?|jsx?|css|json|mjs|sh))/g)].map(
              (m) => m[1] as string,
            ),
          ),
        ].slice(0, 5);
        const files: { path: string; content: string }[] = [];
        for (const p of paths) {
          const f = await selfRead(repo, p);
          if (f.found) files.push({ path: p, content: f.content.slice(0, 20000) });
        }
        return {
          ok: false,
          status: last["status"],
          errors,
          suspectFiles: paths,
          files,
          next: "أصلح الملفات أعلاه بـ self_edit_file ثم أعد deploy_platform.",
        };
      },
    }),
    deploy_platform: tool({
      description:
        "ينشر آخر إصدار من كود منصة Weaver على خادم Contabo (سحب من GitHub ثم إعادة بناء الحاويات وفحص صحي)، أو يتراجع عن آخر نشر. استخدمه بعد self_write_file عندما يطلب المالك تفعيل التعديلات على الخادم.",
      inputSchema: z.object({
        action: z.enum(["deploy", "rollback"]).describe("deploy للنشر أو rollback للتراجع"),
        confirmed: z.boolean().describe("true فقط بعد موافقة المالك الصريحة"),
      }),
      execute: async ({ action, confirmed }) => {
        if (!confirmed) return { error: "النشر يحتاج موافقة صريحة من المالك." };
        const { deployWithGuard } = await import("@/lib/platform.server");
        const result = await deployWithGuard(action);
        return {
          ok: result.ok,
          status: result.status,
          health: result.health ?? null,
          rolledBack: result.rolledBack ?? false,
          log: result.log.slice(-4000),
        };
      },
    }),
  };
}

/** أدوات الذكاء التحليلي: فهم أعمق وأسرع للمحتوى والمشروع. */
function intelTools(auth: AuthedContext | null, projectId: string | null) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return projectId;
  };

  return {
    project_map: tool({
      description:
        "خريطة كاملة للمشروع: كل ملف بحجمه ومخططه (أقسام/عناوين/دوال) دون قراءة المحتوى الكامل. استخدمه أولاً دائماً قبل أي تعديل لفهم الموقع بسرعة وبأقل توكينز.",
      inputSchema: z.object({}),
      execute: async () => projectMap(guard()),
    }),
    file_outline: tool({
      description:
        "مخطط ملف واحد: أقسامه وعناوينه ودواله مع أرقام الأسطر — بديل خفيف عن read_file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const map = await projectMap(guard());
        const file = map.files.find((f) => f.path === path);
        return file ? { ...file, found: true } : { path, found: false };
      },
    }),
    read_slice: tool({
      description:
        "يقرأ مقطعاً محدداً من ملف بالأسطر (from/to) بدل الملف كاملاً — أسرع وأدق للتعديلات الجراحية.",
      inputSchema: z.object({ path: z.string(), from: z.number(), to: z.number() }),
      execute: async ({ path, from, to }) => readSlice(guard(), path, from, to),
    }),
    code_search: tool({
      description:
        "بحث نصي مرتّب داخل كل ملفات المشروع يعيد المسار ورقم السطر والمقتطف. استخدمه لإيجاد موضع أي عنصر أو نص أو دالة فوراً.",
      inputSchema: z.object({ query: z.string(), limit: z.number() }),
      execute: async ({ query, limit }) => codeSearch(guard(), query, limit),
    }),
    semantic_index: tool({
      description:
        "يبني فهرساً دلالياً (Embeddings) لملفات المشروع لتمكين البحث بالمعنى. يتطلب مفتاح تضمين (OPENAI_API_KEY أو JINA_API_KEY أو VOYAGE_API_KEY).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!embeddingProvider()) {
          return { ok: false, error: "لا يوجد مفتاح تضمين مضبوط — استخدم code_search بدلاً منه." };
        }
        return buildSemanticIndex(guard());
      },
    }),
    semantic_search: tool({
      description:
        "بحث بالمعنى داخل فهرس المشروع (بعد semantic_index). يعيد المقاطع الأقرب دلالياً للسؤال.",
      inputSchema: z.object({ query: z.string(), limit: z.number() }),
      execute: async ({ query, limit }) => {
        if (!embeddingProvider()) {
          return { ok: false, error: "لا يوجد مفتاح تضمين — استخدم code_search." };
        }
        return semanticSearch(guard(), query, limit);
      },
    }),
    analyze_content: tool({
      description:
        "يحلّل نصاً طويلاً أو ملفات المشروع بنموذج سريع ويعيد خلاصة مركّزة/استخراجاً منظّماً حسب التعليمة. استخدمه لضغط المحتوى الضخم قبل التفكير فيه.",
      inputSchema: z.object({
        instruction: z.string().describe("ما المطلوب استخراجه أو تلخيصه"),
        text: z.string().describe("النص المراد تحليله، أو اتركه فارغاً واستخدم paths"),
        paths: z.array(z.string()).describe("مسارات ملفات من المشروع تُضاف للتحليل"),
      }),
      execute: async ({ instruction, text, paths }) => {
        const pid = guard();
        let body = text ?? "";
        for (const path of (paths ?? []).slice(0, 6)) {
          const slice = await readSlice(pid, path, 1, 1200);
          if (slice.found) body += `\n\n=== ${path} ===\n${slice.text}`;
        }
        if (!body.trim()) return { ok: false, error: "لا يوجد محتوى للتحليل" };
        const answer = await llmCall({
          model: fastModelId(),
          kind: "fast",
          system: "أنت محلل محتوى دقيق. أجب بالعربية، منظّماً ومختصراً بلا حشو.",
          content: `${instruction}\n\nالمحتوى:\n${body.slice(0, 120_000)}`,
          maxTokens: 2500,
        });
        return { ok: true, model: fastModelId(), analysis: answer };
      },
    }),
    deep_think: tool({
      description:
        "تحليل عميق بنموذج تفكير قوي لقرار معماري أو تشخيص مشكلة معقّدة. يعيد استنتاجاً وخطوات تنفيذ. استخدمه عند التردد بدل التخمين.",
      inputSchema: z.object({ question: z.string(), context: z.string() }),
      execute: async ({ question, context }) => {
        const answer = await llmCall({
          model: reasoningModelId(),
          kind: "reasoning",
          system:
            "أنت مهندس برمجيات أول. حلّل بعمق، وازن البدائل، ثم اعطِ قراراً واحداً واضحاً وخطوات تنفيذ مرقّمة بالعربية.",
          content: `السؤال: ${question}\n\nالسياق:\n${(context ?? "").slice(0, 60_000)}`,
          maxTokens: 3000,
        });
        return { ok: true, model: reasoningModelId(), analysis: answer };
      },
    }),
    analyze_image: tool({
      description:
        "يحلّل صورة أو لقطة شاشة عبر رابط (أو data URL) بنموذج رؤية: يصف التصميم، يستخرج النص، ويقترح تحسينات دقيقة.",
      inputSchema: z.object({ url: z.string(), question: z.string() }),
      execute: async ({ url, question }) => {
        const answer = await llmCall({
          model: visionModelId(),
          kind: "vision",
          system: "أنت ناقد تصميم ومحلّل بصري دقيق. أجب بالعربية بنقاط عملية قابلة للتنفيذ.",
          content: [
            { type: "text" as const, text: question || "حلّل هذه الصورة بدقة." },
            { type: "image_url" as const, image_url: { url } },
          ],
          maxTokens: 2000,
        });
        return { ok: true, model: visionModelId(), analysis: answer };
      },
    }),
    research: tool({
      description:
        "بحث معمّق: ينفّذ عدة استعلامات، يقرأ أفضل المصادر فعلياً، ثم يعيد خلاصة موثّقة بالروابط. استخدمه قبل بناء أي شيء يحتاج معايير أو توثيق حديث.",
      inputSchema: z.object({ topic: z.string(), queries: z.array(z.string()) }),
      execute: async ({ topic, queries }) => {
        const list = (queries ?? []).filter(Boolean).slice(0, 4);
        const all = list.length > 0 ? list : [topic];
        const found = (await Promise.all(all.map((q) => webSearch(q, 4)))).flat();
        const unique = Array.from(new Map(found.map((r) => [r.url, r])).values()).slice(0, 6);
        const pages = await Promise.all(
          unique.slice(0, 4).map(async (r) => {
            try {
              const page = await webFetch(r.url, 6000);
              return `=== ${r.title} (${r.url}) ===\n${(page as { content?: string }).content ?? ""}`;
            } catch {
              return `=== ${r.title} (${r.url}) ===\n${r.snippet}`;
            }
          }),
        );
        const summary = await llmCall({
          model: fastModelId(),
          kind: "fast",
          system: "أنت باحث تقني. لخّص بالعربية بنقاط عملية مع ذكر الرابط بجانب كل معلومة مهمة.",
          content: `الموضوع: ${topic}\n\nالمصادر:\n${pages.join("\n\n").slice(0, 100_000)}`,
          maxTokens: 2500,
        });
        return { ok: true, sources: unique, summary };
      },
    }),
  };
}

/** أدوات البحث على الإنترنت (مجانية بلا اشتراك). */
function webTools() {
  return {
    web_search: tool({
      description:
        "يبحث على الإنترنت فعلياً (DuckDuckGo) ويعيد نتائج بعناوين وروابط ومقتطفات. استخدمه لأي معلومة حديثة أو متغيّرة: أسعار، إصدارات، توثيق، أخبار، مقارنات.",
      inputSchema: z.object({
        query: z.string().describe("استعلام البحث"),
        limit: z.number().describe("عدد النتائج المطلوبة 1-10"),
      }),
      execute: async ({ query, limit }) => ({ query, results: await webSearch(query, limit) }),
    }),
    web_fetch: tool({
      description:
        "يفتح رابطاً ويعيد محتوى الصفحة نصاً/Markdown نظيفاً للقراءة. استخدمه بعد web_search لقراءة المصادر المهمة فعلياً قبل الاستنتاج.",
      inputSchema: z.object({ url: z.string().describe("رابط كامل يبدأ بـ https://") }),
      execute: async ({ url }) => webFetch(url),
    }),
  };
}

/**
 * يعيد الأصل العام الصحيح للروابط المنشورة.
 * إذا كان الطلب قادماً من عنوان IP خام (مثل http://194.163.155.52) نستخدم
 * WEAVER_PUBLIC_URL إن وُجد حتى لا تظهر روابط المشاريع بعنوان IP غير آمن.
 */
export function resolvePublicOrigin(requestOrigin: string) {
  const configured = (
    process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app"
  )
    .trim()
    .replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(requestOrigin).hostname;
  } catch {
    return configured || requestOrigin;
  }
  const isRawIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isRawIp && !isLocal) return configured;
  return requestOrigin;
}

/** يحوّل أصل الطلب إلى رابط عام ثابت صالح لـ Webhook تيليغرام. */
function publicBase(origin: string) {
  const url = new URL(origin);
  const match = url.host.match(/^id-preview--([0-9a-f-]+)\.(.+)$/i);
  if (match) return `https://project--${match[1]}-dev.${match[2]}`;
  return url.origin;
}

/** أدوات بوتات تيليغرام: تسجيل بوت للمشروع وربط الـWebhook وإرسال الرسائل. */
function botTools(auth: AuthedContext | null, projectId: string | null, origin: string) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return { supabase: auth.supabase, userId: auth.userId, projectId };
  };

  const loadBot = async () => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase
      .from("bots")
      .select("id, token, username, persona, model, enabled, webhook_url")
      .eq("project_id", pid)
      .eq("platform", "telegram")
      .maybeSingle();
    return data;
  };

  return {
    bot_setup: tool({
      description:
        "يسجّل بوت تيليغرام لهذا المشروع ويربط الـWebhook تلقائياً بحيث يبدأ البوت بالرد على المستخدمين فوراً. يحتاج توكن البوت من @BotFather (مرة واحدة؛ بعدها يكفي تمرير persona للتحديث).",
      inputSchema: z.object({
        token: z.string().describe("توكن البوت من BotFather، أو نص فارغ للاحتفاظ بالتوكن المسجّل"),
        persona: z
          .string()
          .describe("تعليمات وشخصية البوت: من هو، ماذا يفعل، أسلوبه، وما لا يفعله"),
      }),
      execute: async ({ token, persona }) => {
        const { supabase, userId, projectId: pid } = guard();
        const existing = await loadBot();
        const botToken = token.trim() || existing?.token;
        if (!botToken)
          throw new Error("لا يوجد توكن مسجّل؛ اطلب من المستخدم توكن البوت من @BotFather");

        const me = await tgGetMe(botToken);
        const url = `${publicBase(origin)}/api/public/tg/${pid}`;
        await tgSetWebhook(botToken, url, await webhookSecret(botToken));

        const row = {
          project_id: pid,
          user_id: userId,
          platform: "telegram",
          token: botToken,
          username: me.username ?? null,
          persona,
          webhook_url: url,
          enabled: true,
        };
        const { error } = existing
          ? await supabase.from("bots").update(row).eq("id", existing.id)
          : await supabase.from("bots").insert(row);
        if (error) throw new Error(error.message);

        return {
          username: me.username,
          link: me.username ? `https://t.me/${me.username}` : null,
          webhook: url,
          message: "تم ربط البوت؛ أي رسالة تصل إليه سيرد عليها تلقائياً.",
        };
      },
    }),

    bot_status: tool({
      description: "يعرض حالة بوت تيليغرام لهذا المشروع: اسم المستخدم، الويب هوك، وعدد الرسائل.",
      inputSchema: z.object({}),
      execute: async () => {
        const { supabase } = guard();
        const bot = await loadBot();
        if (!bot) return { linked: false };
        const info = await tgWebhookInfo(bot.token).catch(() => null);
        const { count } = await supabase
          .from("bot_messages")
          .select("id", { count: "exact", head: true })
          .eq("bot_id", bot.id);
        return {
          linked: true,
          username: bot.username,
          enabled: bot.enabled,
          webhook: bot.webhook_url,
          messages: count ?? 0,
          telegram: info,
        };
      },
    }),

    bot_send: tool({
      description: "يرسل رسالة من البوت إلى محادثة محددة (اختبار أو إشعار). يحتاج chat_id.",
      inputSchema: z.object({
        chat_id: z.string().describe("معرّف المحادثة في تيليغرام"),
        text: z.string().describe("نص الرسالة (HTML بسيط مسموح)"),
      }),
      execute: async ({ chat_id, text }) => {
        const bot = await loadBot();
        if (!bot) throw new Error("لا يوجد بوت مرتبط بهذا المشروع؛ استخدم bot_setup أولاً");
        await tgSendMessage(bot.token, chat_id, text);
        return { sent: true, chat_id };
      },
    }),
  };
}

/** أدوات قاعدة بيانات المشروع: مخطط مستقل لكل مشروع داخل نفس القاعدة. */
function targetSupabaseTools(projectId: string) {
  const cfg = getTargetConfig();
  if (!cfg) return {};
  const schema = projectSchema(projectId);

  const inspect = tool({
    description:
      "يفحص مخطط قاعدة بيانات هذا المشروع (جداول وأعمدة مساحته المستقلة). استخدمه قبل أي تعديل.",
    inputSchema: z.object({}),
    execute: async () => ({ schema: await targetSchema(cfg, schema) }),
  });

  const sql = tool({
    description:
      "ينفّذ SQL فعلياً داخل مساحة هذا المشروع (CREATE TABLE، فهارس، دوال). لا تكتب اسم المخطط؛ الجداول تُنشأ تلقائياً داخل مساحة المشروع.",
    inputSchema: z.object({
      sql: z.string().describe("جملة أو جمل SQL كاملة"),
      reason: z.string().describe("سبب هذا التغيير ولأي مهمة"),
    }),
    execute: async ({ sql: statement, reason }) => ({
      reason,
      result: await targetRunSql(cfg, schema, statement),
    }),
  });

  const readRows = tool({
    description: "يقرأ صفوفاً من جدول داخل مساحة هذا المشروع.",
    inputSchema: z.object({
      table: z.string(),
      where: z.string().describe("شرط SQL بدون كلمة where، أو نص فارغ"),
      limit: z.number().describe("عدد الصفوف (1-200)"),
    }),
    execute: async ({ table, where, limit }) => ({
      rows: await targetSelect(cfg, schema, table, where, limit),
    }),
  });

  const insertRows = tool({
    description: "يدرج صفوفاً في جدول داخل مساحة هذا المشروع.",
    inputSchema: z.object({
      table: z.string(),
      rows: z.array(z.record(z.string(), z.unknown())).describe("الصفوف المراد إدراجها"),
    }),
    execute: async ({ table, rows }) => ({
      inserted: await targetInsert(cfg, schema, table, rows),
    }),
  });

  return {
    db_inspect: inspect,
    db_sql: sql,
    db_select: readRows,
    db_insert: insertRows,
  };
}

type ChatRequestBody = {
  messages?: unknown;
  projectId?: unknown;
  model?: unknown;
  skills?: unknown;
  mode?: unknown;
};

/** حد الخطوات لكل رسالة، وحد زمني يمنع قطع الاتصال في منتصف البناء. */
const MAX_STEPS = Number(process.env["WEAVER_MAX_STEPS"] ?? 120);
const TIME_BUDGET_MS = Number(process.env["WEAVER_TIME_BUDGET_MS"] ?? 240_000);

function budgetReached(startedAt: number) {
  return () => Date.now() - startedAt > TIME_BUDGET_MS;
}

type AnyTool = { execute?: (...args: never[]) => unknown };

type LifecycleState = {
  hasTasks: boolean;
  hasFiles: boolean;
  checksPassed: boolean;
  published: boolean;
  acted: boolean;
};

const BUILD_INTENT_PATTERN =
  /(?:ابن|بناء|أنش|انش|صمّم|صمم|طوّر|طور|أضف|اضف|عدّل|عدل|أصلح|اصلح|نفّذ|نفذ|انشر|موقع|تطبيق|مشروع|ميزة|كود|صفحة|أكمل|اكمل|تابع|build|create|implement|develop|fix|continue|deploy)/i;

/** يميّز طلب التنفيذ عن السؤال العام حتى لا تدخل المحادثات العادية في حلقة بناء. */
export function hasBuildIntent(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = (lastUser?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  return BUILD_INTENT_PATTERN.test(text);
}

/** آخر نصّ كتبه المستخدم — يُستخدم لاختيار الأدوات المرسلة للنموذج. */
function lastUserText(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return (lastUser?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .toLowerCase();
}

/**
 * يحدّد مجموعات الأدوات المرسلة في هذه الجولة.
 * إرسال كل الأدوات دائماً كان يضيف آلاف التوكينات إلى كل خطوة من خطوات الوكيل،
 * وهو أحد أكبر أسباب البطء وطول الصمت مقارنة بالمنصات الكبرى.
 */
export function selectToolGroups(mode: string, messages: UIMessage[]) {
  const text = lastUserText(messages);
  const mentions = (pattern: RegExp) => pattern.test(text);
  if (mode === "platform") {
    return { workspace: false, bot: false, db: false, connectors: false, platform: true };
  }
  return {
    workspace: mode === "build",
    bot: mode === "bot" || mentions(/telegram|تيليغرام|بوت|bot/),
    db:
      mode === "build" &&
      mentions(/قاعدة|جدول|sql|database|supabase|بيانات|تسجيل|حساب|auth|مستخدم/),
    connectors: mentions(
      /connector|رابط خارجي|api|notion|airtable|slack|github|resend|unsplash|بريد|webhook/,
    ),
    platform: mentions(/weaver نفس|المنصة نفسها|عدّل المنصة|طوّر المنصة|self_/),
  };
}

/** البناء مكتمل فعلياً حين توجد ملفات + نجح الفحص + تم النشر — حالة محفوظة في قاعدة البيانات. */
export function isBuildComplete(state: LifecycleState) {
  return state.hasFiles && state.checksPassed && state.published;
}

export function isBuildIncomplete(state: LifecycleState, buildIntent: boolean) {
  if (!buildIntent) return false;
  // إن كان المشروع مكتملاً بالفعل فلا نطلب استئنافاً حتى لو كانت الجولة نصّية فقط.
  return !isBuildComplete(state);
}

/** الخطوة التالية الوحيدة المطلوبة لإغلاق البناء — تُرسَل للواجهة وتُحقن في التعليمات. */
export function nextBuildAction(state: LifecycleState): string | null {
  if (!state.hasFiles)
    return "اكتب ملفات المشروع الفعلية عبر write_file (ابدأ بـ index.html و styles.css).";
  if (!state.checksPassed)
    return "شغّل run_checks وأصلح كل خطأ عبر fix_errors/write_file حتى ينجح الفحص.";
  if (!state.published) return "انشر المشروع عبر publish_site واذكر الرابط /s/<slug>.";
  return null;
}

function isSuccessfulResult(value: unknown) {
  if (!value || typeof value !== "object") return true;
  const result = value as { ok?: unknown; error?: unknown };
  return result.ok !== false && !result.error;
}

function applyToolResult(state: LifecycleState, name: string, value: unknown) {
  if (!isSuccessfulResult(value)) return;
  if (
    [
      "write_file",
      "write_files",
      "append_file",
      "edit_file",
      "delete_file",
      "promote_build",
      "run_checks",
      "fix_errors",
      "run_command",
      "shell",
      "publish_site",
    ].includes(name)
  ) {
    state.acted = true;
  }
  if (name === "build_task_graph") state.hasTasks = true;
  if (
    [
      "write_file",
      "write_files",
      "append_file",
      "edit_file",
      "delete_file",
      "promote_build",
    ].includes(name)
  ) {
    state.hasFiles = true;
    state.checksPassed = false;
    state.published = false;
  }
  if (name === "run_checks" || name === "fix_errors") {
    const result = value as { ok?: boolean };
    state.checksPassed = result.ok === true;
  }
  if (name === "publish_site") state.published = true;
}

function lifecyclePhase(state: LifecycleState): BuildPhase {
  if (state.published) return "done";
  if (state.checksPassed) return "verify";
  if (state.hasFiles) return "execute";
  if (state.hasTasks) return "graph";
  return "intake";
}

function lifecycleNextAction(state: LifecycleState): NextAction | undefined {
  if (state.published) return "done";
  if (!state.hasFiles) return "execute_next_task";
  if (!state.checksPassed) return "run_checks";
  return "deploy";
}

const RETRYABLE_TOOLS = new Set([
  "write_file",
  "write_files",
  "append_file",
  "edit_file",
  "delete_file",
  "run_checks",
  "fix_errors",
  "publish_site",
  "run_command",
  "shell",
  "dev_server",
  "browser_check",
  "auto_repair",
  "promote_build",
  "generate_image",
  "visual_audit",
  "web_search",
  "web_fetch",
  "research",
  "analyze_content",
  "deep_think",
  "analyze_image",
  "semantic_index",
]);

const RETRY_DELAYS_MS = [400, 1200];

/**
 * نتائج الأدوات المنظّمة ({ ok:false }) نتيجة حتمية وليست عطلاً عابراً:
 * إعادة محاولتها كانت تضيف ثوانيَ صمت لكل خطوة (وتعيد فحصاً فاشلاً بلا داعٍ).
 * لا نعيد المحاولة إلا على الأعطال العابرة فعلاً (شبكة/مهلة/5xx/حدّ معدّل).
 */
const TRANSIENT_ERROR =
  /(fetch failed|network|timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|socket|rate limit|429|50[0-4]\b|temporarily|overloaded)/i;

function isTransientError(message: string) {
  return TRANSIENT_ERROR.test(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ToolEvent = {
  name: string;
  ok: boolean;
  attempt: number;
  durationMs: number;
  detail?: string | undefined;
};

/**
 * يمنع خطأ أداة واحدة من إسقاط البثّ كاملاً، ويعيد المحاولة تلقائياً
 * مع تأخير تصاعدي (backoff) للأدوات الحسّاسة مثل write_file و run_checks.
 */
export function hardenTools<T extends Record<string, unknown>>(
  tools: T,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
  audit?: { userId?: string | null; projectId?: string | null },
): T {
  const logAudit = (
    name: string,
    ok: boolean,
    durationMs: number,
    attempt: number,
    detail?: string | undefined,
  ) => {
    void import("@/lib/audit.server")
      .then(({ recordAudit }) =>
        recordAudit({
          userId: audit?.userId ?? null,
          projectId: audit?.projectId ?? null,
          kind: name.startsWith("connector") || name === "http_request" ? "connector" : "tool",
          name,
          ok,
          durationMs,
          attempt,
          detail: detail ?? null,
        }),
      )
      .catch(() => undefined);
  };
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(tools)) {
    const t = value as AnyTool;
    if (typeof t?.execute !== "function") {
      out[name] = value;
      continue;
    }
    const original = t.execute.bind(t);
    const maxAttempts = RETRYABLE_TOOLS.has(name) ? RETRY_DELAYS_MS.length + 1 : 1;
    out[name] = {
      ...(value as object),
      execute: async (...args: never[]) => {
        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const startedAt = Date.now();
          try {
            const { runInSandbox } = await import("@/lib/sandbox.server");
            const result = await runInSandbox(name, async () => original(...args));
            const ok = isSuccessfulResult(result);
            const okDetail = ok ? undefined : JSON.stringify(result).slice(0, 400);
            onEvent?.({ name, ok, attempt, durationMs: Date.now() - startedAt, detail: okDetail });
            logAudit(name, ok, Date.now() - startedAt, attempt, okDetail);
            // النتيجة المنظّمة تُعاد فوراً — نجحت أو فشلت — بلا إعادة محاولة
            onResult?.(name, result);
            return result;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            console.error(`[weaver:tool:${name}] attempt ${attempt}`, lastError);
            onEvent?.({
              name,
              ok: false,
              attempt,
              durationMs: Date.now() - startedAt,
              detail: lastError,
            });
            logAudit(name, false, Date.now() - startedAt, attempt, lastError);
            if (attempt === maxAttempts || !isTransientError(lastError)) {
              return { ok: false, error: lastError, tool: name, attempts: attempt };
            }
          }
          await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 2000);
        }
        return { ok: false, error: lastError, tool: name, attempts: maxAttempts };
      },
    };
  }
  return out as T;
}

/** أدوات الروابط الخارجية (Connectors) ونداءات HTTP العامة. */
function connectorTools(projectId: string | null, userId: string | null = null) {
  /** يمنع الوكيل من استعمال رابط عطّله المالك من صفحة الروابط. */
  const assertEnabled = async (connectorId: string) => {
    const { enabledConnectorIds } = await import("@/lib/connector-settings.server");
    const allowed = await enabledConnectorIds(userId);
    if (allowed && !allowed.includes(connectorId)) {
      return `الرابط ${connectorId} معطّل من إعدادات الروابط. فعّله من صفحة «الروابط» أو استخدم رابطاً مفعّلاً.`;
    }
    return null;
  };
  return {
    connector_list: tool({
      description:
        "يسرد الروابط الخارجية المجانية المتاحة (Telegram، GitHub، Notion، Airtable، Resend، Slack، Unsplash، بيانات مفتوحة…) مع حالة المفتاح لكل واحد. نفّذه قبل أي تكامل خارجي.",
      inputSchema: z.object({}),
      execute: async () => {
        const { listConnectorStatus } = await import("@/lib/connectors.server");
        const { enabledConnectorIds } = await import("@/lib/connector-settings.server");
        const allowed = await enabledConnectorIds(userId);
        const all = await listConnectorStatus(projectId);
        return { connectors: allowed ? all.filter((c) => allowed.includes(c.id)) : all };
      },
    }),
    connector_call: tool({
      description:
        "ينفّذ نداءً على رابط خارجي من سجل الروابط باستخدام مفتاح المشروع تلقائياً (لا تكتب المفتاح أبداً). حدّد connectorId والمسار والطريقة والجسم.",
      inputSchema: z.object({
        connectorId: z.string().describe("معرّف الرابط من connector_list"),
        path: z.string().describe("المسار بعد قاعدة العنوان، مثل /user/repos"),
        method: z.string().describe("GET أو POST أو PATCH أو DELETE"),
        query: z.record(z.string(), z.string()).describe("معاملات الاستعلام، أو كائن فارغ"),
        body: z.string().describe("جسم الطلب كنص JSON، أو نص فارغ"),
      }),
      execute: async ({ connectorId, path, method, query, body }) => {
        const blocked = await assertEnabled(connectorId);
        if (blocked) return { ok: false, error: blocked };
        const { callConnector } = await import("@/lib/connectors.server");
        let parsed: unknown = undefined;
        if (body && body.trim()) {
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
        }
        return callConnector({
          projectId,
          connectorId,
          path,
          method,
          query: query ?? {},
          ...(parsed === undefined ? {} : { body: parsed }),
        });
      },
    }),
    http_request: tool({
      description:
        "نداء HTTP عام على أي واجهة برمجية عامة (بلا عناوين داخلية). استخدمه فقط عندما لا يوجد رابط جاهز في connector_list.",
      inputSchema: z.object({
        url: z.string().describe("رابط https كامل"),
        method: z.string().describe("GET أو POST أو PATCH أو DELETE"),
        headers: z.record(z.string(), z.string()).describe("ترويسات إضافية أو كائن فارغ"),
        body: z.string().describe("جسم الطلب كنص، أو نص فارغ"),
      }),
      execute: async ({ url, method, headers, body }) => {
        const { httpCall } = await import("@/lib/connectors.server");
        return httpCall({
          url,
          method,
          headers: headers ?? {},
          ...(body && body.trim() ? { body } : {}),
        });
      },
    }),
  };
}

/** مجموعة أدوات Weaver الكاملة — يشاركها مسار الدردشة والعامل الخلفي. */
export function buildWeaverToolset(
  auth: AuthedContext,
  projectId: string | null,
  origin: string,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
) {
  return hardenTools(
    {
      ...planningTools(auth, projectId),
      ...webTools(),
      ...intelTools(auth, projectId),
      ...workspaceTools(auth, projectId, origin),
      ...botTools(auth, projectId, origin),
      ...(projectId ? targetSupabaseTools(projectId) : {}),
      ...connectorTools(projectId, auth.userId),
      ...selfTools(),
      ...platformTools(auth),
    },

    onResult,
    onEvent,
    { userId: auth.userId, projectId },
  );
}

/** نص النظام الكامل — يشاركه مسار الدردشة والعامل الخلفي. */
export function buildWeaverSystem(activeSkills: string[], mode: string, customPrompt = "") {
  return (
    SYSTEM_PROMPT +
    MEMORY_RULE +
    DESIGN_KIT +
    DESIGN_LIBRARY +
    STACK_LIBRARY +
    skillPrompt(activeSkills) +
    customPrompt +
    modePrompt(mode)
  );
}

/** لقطة حالة المشروع الحقيقية تُحقن في كل جولة حتى لا يعيد النموذج عملاً منجزاً ولا يتوقف قبل الإغلاق. */
function statusPrompt(state: LifecycleState, buildIntent: boolean) {
  if (!buildIntent) return "";
  const next = nextBuildAction(state);
  const lines = [
    "",
    "=== حالة المشروع الحالية (من قاعدة البيانات، ليست تخميناً) ===",
    `ملفات مكتوبة: ${state.hasFiles ? "نعم" : "لا"}`,
    `آخر run_checks ناجح: ${state.checksPassed ? "نعم" : "لا"}`,
    `منشور: ${state.published ? "نعم" : "لا"}`,
  ];
  if (next) {
    lines.push(
      `الخطوة التالية الإلزامية في هذه الجولة: ${next}`,
      "ممنوع إنهاء الجولة بنص فقط أو بطلب مراجعة/موافقة قبل تنفيذ هذه الخطوة بأداة فعلية.",
    );
  } else {
    lines.push(
      "المشروع مكتمل ومنشور — لا تعِد البناء من الصفر، نفّذ فقط ما يطلبه المستخدم صراحةً.",
    );
  }
  return lines.join("\n") + "\n";
}

export { MAX_STEPS, TIME_BUDGET_MS, budgetReached, applyToolResult, statusPrompt };
export type { LifecycleState };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["OPENROUTER_API_KEY"];
        if (!key && !process.env["GEMINI_API_KEY"] && !process.env["GROQ_API_KEY"]) {
          return new Response("Missing model provider key", { status: 500 });
        }

        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const projectId = typeof body.projectId === "string" ? body.projectId : null;
        const origin = resolvePublicOrigin(new URL(request.url).origin);

        const requested =
          typeof body.model === "string" && /^[\w.-]+\/[\w.:-]+$/.test(body.model.trim())
            ? body.model.trim()
            : null;
        const modelId = requested ?? getOpenRouterModelId();
        const activeSkills = Array.isArray(body.skills)
          ? body.skills.filter((s): s is string => typeof s === "string").slice(0, 12)
          : [];
        const mode = typeof body.mode === "string" ? body.mode : "build";
        const buildIntent = mode === "build" && hasBuildIntent(messages as UIMessage[]);
        // اختيار الأدوات حسب الوضع والنيّة: إرسال كل الأدوات في كل خطوة كان
        // يضخّم الطلب ويبطّئ زمن أول توكن في كل دورة من دورات الوكيل.
        const needs = selectToolGroups(mode, messages as UIMessage[]);

        const lifecycle: LifecycleState = {
          hasTasks: false,
          hasFiles: false,
          checksPassed: false,
          published: false,
          acted: false,
        };
        if (projectId) {
          try {
            const [
              { count: taskCount },
              { count: fileCount },
              { data: project },
              { data: latestCheck },
            ] = await Promise.all([
              auth.supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId),
              auth.supabase
                .from("files")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId),
              auth.supabase.from("projects").select("published").eq("id", projectId).maybeSingle(),
              auth.supabase
                .from("runs")
                .select("status")
                .eq("project_id", projectId)
                .eq("kind", "check")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);
            lifecycle.hasTasks = (taskCount ?? 0) > 0;
            lifecycle.hasFiles = (fileCount ?? 0) > 0;
            lifecycle.checksPassed = latestCheck?.status === "passed";
            lifecycle.published = project?.published === true;
          } catch {
            /* حالة الاكتمال مساعدة؛ الأدوات نفسها تبقى مصدر الحقيقة. */
          }
        }

        // نقطة استرجاع تلقائية قبل كل رسالة — تُنفَّذ في الخلفية حتى لا تؤخّر بدء الردّ
        if (projectId) {
          const lastUser = [...(messages as UIMessage[])].reverse().find((m) => m.role === "user");
          const label =
            (lastUser?.parts ?? [])
              .map((p) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .trim()
              .slice(0, 120) || "قبل رسالة جديدة";
          void (async () => {
            try {
              const { data: current } = await auth.supabase
                .from("files")
                .select("path, content")
                .eq("project_id", projectId);
              if (current && current.length > 0) {
                await auth.supabase.from("checkpoints").insert({
                  project_id: projectId,
                  user_id: auth.userId,
                  label,
                  file_count: current.length,
                  files: current as unknown as Json,
                });
              }
            } catch {
              /* نقطة الاسترجاع اختيارية ولا تُفشل المحادثة */
            }
          })();
        }

        // كل قراءات التهيئة تتم على التوازي حتى لا تتراكم زمنياً قبل أول توكن
        const platformModule = await import("@/lib/platform.server");
        const [customRows, platform, platformPrompt] = await Promise.all([
          auth.supabase
            .from("custom_skills")
            .select("slug, name, prompt")
            .eq("enabled", true)
            .then((r) => r.data ?? [])
            .catch(() => []),
          platformModule.loadPlatformSettings(),
          platformModule.activePromptOverride(),
        ]);

        // المهارات المخصّصة التي أنشأها المالك (skill-creator)
        let customPrompt = "";
        const active = (customRows as any[]).filter((r: any) =>
          activeSkills.includes(`custom:${r.slug}`),
        );
        if (active.length > 0) {
          customPrompt = `\n\n=== مهارات مخصّصة مفعّلة (التزم بها حرفياً) ===\n${active
            .map((r: any) => `مهارة "${r.name}":\n${r.prompt}`)
            .join("\n\n")}`;
        }

        applyModelOverrides(platform);
        const effectiveModel = requested ?? platform.primaryModel ?? modelId;
        const routed = resolveBuildModel(effectiveModel, origin);

        let stepsUsed = 0;
        try {
          const result = streamText({
            model: routed.model,
            system:
              SYSTEM_PROMPT +
              MEMORY_RULE +
              DESIGN_KIT +
              DESIGN_LIBRARY +
              STACK_LIBRARY +
              skillPrompt(activeSkills) +
              customPrompt +
              (platformPrompt
                ? `\n\nتعليمات إضافية من مالك المنصة (إلزامية):\n${platformPrompt}\n`
                : "") +
              modePrompt(mode) +
              statusPrompt(lifecycle, buildIntent),

            messages: await convertToModelMessages(messages as UIMessage[]),
            tools: hardenTools(
              {
                ...planningTools(auth, projectId),

                ...webTools(),
                ...(needs.workspace ? workspaceTools(auth, projectId, origin) : {}),
                ...(needs.bot ? botTools(auth, projectId, origin) : {}),
                ...(needs.db && projectId ? targetSupabaseTools(projectId) : {}),
                ...intelTools(auth, projectId),
                ...(needs.connectors ? connectorTools(projectId, auth.userId) : {}),
                ...(needs.platform ? selfTools() : {}),
                ...(needs.platform ? platformTools(auth) : {}),
              },
              (name, value) => applyToolResult(lifecycle, name, value),
              undefined,
              {
                userId: auth.userId,
                projectId,
              },
            ),
            stopWhen: [stepCountIs(platform.maxSteps || MAX_STEPS), budgetReached(startedAt)],
            maxOutputTokens: resolveMaxOutputTokens(platform.maxTokens),

            // بلا تفكير موسّع: يقلّل زمن الصمت قبل أول توكن ويسرّع دورة الأدوات
            providerOptions: {
              openrouter: { reasoning: { enabled: false } },
            },

            onStepFinish: () => {
              stepsUsed += 1;
            },

            onFinish: async ({ totalUsage }) => {
              try {
                const inputTokens = totalUsage?.inputTokens ?? 0;
                const outputTokens = totalUsage?.outputTokens ?? 0;
                if (inputTokens || outputTokens) {
                  await auth.supabase.from("usage_events").insert({
                    project_id: projectId,
                    user_id: auth.userId,
                    model: modelId,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: totalUsage?.totalTokens ?? inputTokens + outputTokens,
                    cost_usd: estimateCostUsd(modelId, inputTokens, outputTokens),
                  });
                }
              } catch {
                // تسجيل الاستهلاك لا يجب أن يُفشل الردّ
              }
              if (projectId) {
                try {
                  await reconcileProjectState(projectId);
                  await saveBuildState(
                    projectId,
                    { phase: lifecyclePhase(lifecycle) },
                    lifecycleNextAction(lifecycle),
                    null,
                  );
                } catch {
                  // حالة البناء مساعدة؛ لا نُفشل الردّ
                }
              }
            },
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
            sendReasoning: true,
            headers: { "X-Weaver-Model": routed.modelId, "X-Weaver-Provider": routed.provider },
            // نُعلم الواجهة أن الجولة انتهت بسبب حد الخطوات/الوقت لا لأن العمل اكتمل،
            // فتستأنف تلقائياً بدل أن يتوقف البناء في المنتصف.
            messageMetadata: ({ part }) =>
              part.type === "finish"
                ? {
                    truncated:
                      stepsUsed >= (platform.maxSteps || MAX_STEPS) ||
                      Date.now() - startedAt > TIME_BUDGET_MS,
                    incomplete: isBuildIncomplete(lifecycle, buildIntent),
                    complete: isBuildComplete(lifecycle),
                    nextAction: nextBuildAction(lifecycle),
                    lifecycle,
                    steps: stepsUsed,
                  }
                : undefined,

            onError: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              console.error("[weaver:stream]", message);
              const learned = noteTokenBudgetError(error);
              const degraded = noteOpenRouterUnavailable(error);
              if (degraded) {
                return `رصيد OpenRouter غير كافٍ الآن — حوّلت البناء تلقائياً إلى Gemini/Groq. أعد الإرسال وسيكمل من آخر حالة محفوظة.`;
              }
              if (learned) {
                return `رصيد OpenRouter لا يسمح بحجم الرد المطلوب. خفّضت الحدّ تلقائياً إلى ${learned} توكن — أعد الإرسال وسيكمل البناء من آخر حالة محفوظة.`;
              }
              return `انقطعت هذه الجولة بسبب خطأ من المزوّد: ${message}\n\nسيستأنف Weaver التنفيذ تلقائياً من آخر حالة محفوظة.`;
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "OpenRouter error";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
