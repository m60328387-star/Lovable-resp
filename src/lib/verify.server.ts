import { parse as acornParse } from "acorn";

export type WorkspaceFile = { path: string; content: string };

export type Issue = {
  path: string;
  severity: "error" | "warning";
  message: string;
  line?: number;
};

export type CheckReport = {
  ok: boolean;
  filesChecked: number;
  errors: number;
  warnings: number;
  issues: Issue[];
  summary: string;
};

function ext(path: string) {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

/** يرصد حقن CSS ديناميكياً من JavaScript — ممنوع في معايير الأداء. */
function checkStyleInjection(file: WorkspaceFile, source: string): Issue[] {
  const issues: Issue[] = [];
  if (/createElement\s*\(\s*["'`]style["'`]\s*\)/i.test(source)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "حقن CSS ديناميكي: createElement(\"style\") — انقل الأنماط إلى ملف .css ثابت",
    });
  }
  if (/\.(insertRule|addRule)\s*\(/.test(source)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "حقن CSS ديناميكي عبر insertRule — استخدم أصنافاً في ملف .css بدلاً منه",
    });
  }
  if (/(innerHTML|insertAdjacentHTML|document\.write)\s*[(=][^;]{0,200}<style/i.test(source)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "كتابة وسم <style> من JavaScript — انقل الأنماط إلى ملف .css ثابت",
    });
  }
  const inlineStyleWrites = source.match(/\.style\.(?!setProperty|removeProperty)[A-Za-z]/g) ?? [];
  if (inlineStyleWrites.length > 8) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: `${inlineStyleWrites.length} تعديل أنماط مباشر من JS — استخدم classList أو style.setProperty لمتغيّرات CSS`,
    });
  }
  return issues;
}

function checkJs(file: WorkspaceFile): Issue[] {
  const styleIssues = checkStyleInjection(file, file.content);

  const opts = { ecmaVersion: 2023 as const, locations: true };
  try {
    acornParse(file.content, { ...opts, sourceType: "module" });
    return styleIssues;
  } catch {
    try {
      acornParse(file.content, { ...opts, sourceType: "script" });
      return styleIssues;
    } catch (error) {
      const err = error as { message?: string; loc?: { line?: number } };
      return [
        ...styleIssues,
        {
          path: file.path,
          severity: "error",
          message: `خطأ نحوي في JavaScript: ${err.message ?? "غير معروف"}`,
          ...(err.loc?.line ? { line: err.loc.line } : {}),
        },
      ];
    }
  }
}

function checkJson(file: WorkspaceFile): Issue[] {
  try {
    JSON.parse(file.content);
    return [];
  } catch (error) {
    return [
      {
        path: file.path,
        severity: "error",
        message: `JSON غير صالح: ${(error as Error).message}`,
      },
    ];
  }
}

function checkCss(file: WorkspaceFile): Issue[] {
  const issues: Issue[] = [];
  const open = (file.content.match(/\{/g) ?? []).length;
  const close = (file.content.match(/\}/g) ?? []).length;
  if (open !== close) {
    issues.push({
      path: file.path,
      severity: "error",
      message: `أقواس CSS غير متوازنة: ${open} مفتوحة مقابل ${close} مغلقة`,
    });
  }
  if (file.content.trim().length < 400) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "ملف الأنماط شبه فارغ — التصميم لن يظهر بشكل احترافي",
    });
  }
  if (!/@media\b/.test(file.content)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا توجد استعلامات @media — تحقّق من التجاوب على الجوال",
    });
  }
  if (!/:focus-visible/.test(file.content)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا توجد حالة :focus-visible — التنقّل بلوحة المفاتيح غير واضح",
    });
  }
  if (!/prefers-reduced-motion/.test(file.content) && /animation|transition/.test(file.content)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "حركات بلا احترام prefers-reduced-motion",
    });
  }
  if (/left\s*:|right\s*:|margin-left|margin-right|padding-left|padding-right/.test(file.content)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "خصائص left/right ثابتة — استخدم inset-inline و margin-inline لدعم RTL",
    });
  }
  return issues;
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function checkHtml(file: WorkspaceFile, all: WorkspaceFile[]): Issue[] {
  const issues: Issue[] = [];
  const html = file.content;

  // لغة المحتوى: أي حروف صينية/يابانية/كورية تعني أن النموذج خرج عن لغة الطلب.
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(html)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "المحتوى يحتوي نصوصاً بلغة غير مطلوبة (صينية/يابانية/كورية) — أعد كتابته بالعربية",
    });
  }

  // حجم الصفحة: صفحة ضخمة تعني تكراراً يجب نقله إلى CSS/JS أو صفحات مستقلة.
  const lineCount = html.split("\n").length;
  if (html.length > 60000 || lineCount > 800) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: `الصفحة ضخمة (${lineCount} سطراً) — انقل الأنماط إلى styles.css والعناصر المتكررة إلى قالب في script.js أو صفحات مستقلة`,
    });
  }

  const inlineStyle = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce(
    (sum, m) => sum + (m[1]?.length ?? 0),
    0,
  );
  if (inlineStyle > 4000) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "كتلة <style> داخلية ضخمة — انقلها إلى styles.css",
    });
  }

  const stack: string[] = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(stripped)) !== null) {
    const raw = match[0];
    const name = (match[1] ?? "").toLowerCase();
    if (VOID_TAGS.has(name) || match[2] === "/" || name === "!doctype") continue;
    if (raw.startsWith("</")) {
      const idx = stack.lastIndexOf(name);
      if (idx === -1) {
        issues.push({
          path: file.path,
          severity: "warning",
          message: `وسم إغلاق زائد: </${name}>`,
        });
      } else {
        stack.splice(idx);
      }
    } else {
      stack.push(name);
    }
  }
  for (const name of stack.slice(0, 5)) {
    issues.push({ path: file.path, severity: "warning", message: `وسم غير مغلق: <${name}>` });
  }

  if (!/<html[\s>]/i.test(html)) {
    issues.push({ path: file.path, severity: "warning", message: "لا يوجد وسم <html> في الصفحة" });
  }
  if (!/<title[\s>]/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا يوجد <title> — مهم لتحسين الظهور",
    });
  }
  if (!/name\s*=\s*["']viewport["']/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "لا يوجد meta viewport — الصفحة لن تكون متجاوبة على الجوال",
    });
  }
  if (!/<html[^>]*\sdir\s*=\s*["']rtl["']/i.test(html) && /[\u0600-\u06FF]/.test(html)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: 'محتوى عربي بلا dir="rtl" على وسم <html>',
    });
  }
  if (!/name\s*=\s*["']description["']/i.test(html)) {
    issues.push({ path: file.path, severity: "warning", message: "لا يوجد meta description" });
  }
  const hasExternalCss = /<link\b[^>]*stylesheet[^>]*>/i.test(html);
  const hasInlineCss = /<style\b[^>]*>[\s\S]{200,}<\/style>/i.test(html);
  if (!hasExternalCss && !hasInlineCss) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "الصفحة بلا أنماط — يجب ربط styles.css",
    });
  }
  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  if (h1Count === 0) {
    issues.push({ path: file.path, severity: "warning", message: "لا يوجد عنوان <h1> في الصفحة" });
  } else if (h1Count > 1) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: `أكثر من <h1> واحد (${h1Count})`,
    });
  }
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((tag) => !/\salt\s*=/i.test(tag)).length;
  if (missingAlt > 0) {
    issues.push({
      path: file.path,
      severity: "error",
      message: `${missingAlt} صورة بلا نص بديل alt`,
    });
  }
  const placeholder = /placeholder\.(com|co)|via\.placeholder|lorem\s?picsum|dummyimage/i.exec(
    html,
  );
  if (placeholder) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "صور placeholder خارجية — استبدلها بصور مولّدة في assets/",
    });
  }

  if (!/property\s*=\s*["']og:(title|image)["']/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا توجد وسوم Open Graph (og:title / og:image) لمشاركة الرابط",
    });
  }
  if (!/<html[^>]*\slang\s*=/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا توجد سمة lang على وسم <html>",
    });
  }
  if (/lorem\s+ipsum|نص\s*تجريبي|محتوى\s*تجريبي/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "نص تعبئة (Lorem ipsum) — استبدله بمحتوى حقيقي",
    });
  }
  if (!/<(header|nav|main|footer|section)\b/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا توجد وسوم دلالية (header/nav/main/section/footer)",
    });
  }

  // ===== ميزانية الأداء =====
  const inlineScripts = html.match(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of inlineScripts) {
    issues.push(...checkStyleInjection(file, block));
  }

  const externalScripts = [
    ...html.matchAll(/<script\b[^>]*\ssrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi),
  ].map((m) => m[1] ?? "");
  const externalStyles = [
    ...html.matchAll(/<link\b[^>]*\shref\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi),
  ]
    .filter((m) => /stylesheet/i.test(m[0]))
    .map((m) => m[1] ?? "")
    .filter((href) => !/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(href));
  const externalDeps = [...externalScripts, ...externalStyles];
  if (externalDeps.length > 3) {
    issues.push({
      path: file.path,
      severity: "error",
      message: `${externalDeps.length} اعتماديات خارجية — الحد الأقصى 3، واستبدل الباقي ببدائل أصلية (IntersectionObserver / CSS animation / scroll-snap / <dialog>)`,
    });
  } else if (externalDeps.length > 1) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: `${externalDeps.length} اعتماديات خارجية — الموقع التعريفي يجب أن يبقى عند واحدة أو صفر`,
    });
  }

  if (/cdn\.tailwindcss\.com/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "error",
      message: "cdn.tailwindcss.com مُصرّف وقت تشغيل يبطئ الرسم الأول — استبدله بـ CSS مخصص بالمتغيرات",
    });
  }

  const blockingScripts = [...html.matchAll(/<script\b[^>]*\ssrc\s*=[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => !/\s(defer|async)\b/i.test(tag) && !/type\s*=\s*["']module["']/i.test(tag));
  if (blockingScripts.length > 0) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: `${blockingScripts.length} سكربت يحجب الرسم — أضف defer أو type="module"`,
    });
  }

  const sizedImgs = imgs.filter((tag) => /\swidth\s*=/i.test(tag) && /\sheight\s*=/i.test(tag));
  if (imgs.length > 0 && sizedImgs.length < imgs.length) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: `${imgs.length - sizedImgs.length} صورة بلا width/height صريحين — يسبب قفزاً تخطيطياً (CLS)`,
    });
  }

  if (externalDeps.length > 0 && !/rel\s*=\s*["']preconnect["']/i.test(html)) {
    issues.push({
      path: file.path,
      severity: "warning",
      message: "لا يوجد preconnect للنطاقات الخارجية المستخدمة",
    });
  }



  const known = new Set(all.map((f) => f.path.replace(/^\.?\//, "")));
  const refRe = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let ref: RegExpExecArray | null;
  while ((ref = refRe.exec(html)) !== null) {
    const raw = ref[1] ?? "";
    if (/^(https?:|data:|mailto:|tel:|#|\/\/|javascript:|blob:)/i.test(raw)) continue;
    // تجريد المرساة والاستعلام قبل المقارنة: "index.html#about" و"a.css?v=2" ملفان صالحان.
    const value = raw.split("#")[0]?.split("?")[0] ?? "";
    if (!value) continue; // مرساة داخلية فقط
    const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
    let resolved = value.startsWith("/")
      ? value.slice(1)
      : normalize(dir + value.replace(/^\.\//, ""));
    // الجذر "/" أو مسار مجلد ينتهي بشرطة يقابل index.html
    if (resolved === "" || value.endsWith("/"))
      resolved = `${resolved}${resolved ? "/" : ""}index.html`;
    if (!known.has(resolved) && !known.has(`${resolved}/index.html`)) {
      issues.push({
        path: file.path,
        severity: "error",
        message: `مرجع مفقود في مساحة العمل: ${raw}`,
      });
    }
  }

  return issues;
}

function normalize(path: string) {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

export function runChecks(files: WorkspaceFile[]): CheckReport {
  const issues: Issue[] = [];

  if (files.length === 0) {
    return {
      ok: false,
      filesChecked: 0,
      errors: 1,
      warnings: 0,
      issues: [{ path: "-", severity: "error", message: "مساحة العمل فارغة — لا يوجد شيء لفحصه" }],
      summary: "مساحة العمل فارغة",
    };
  }

  for (const file of files) {
    switch (ext(file.path)) {
      case "js":
      case "mjs":
      case "cjs":
      case "jsx":
        issues.push(...checkJs(file));
        break;
      case "json":
        issues.push(...checkJson(file));
        break;
      case "css":
        issues.push(...checkCss(file));
        break;
      case "html":
      case "htm":
        issues.push(...checkHtml(file, files));
        break;
      default:
        break;
    }
  }

  const cssFiles = files.filter((f) => ext(f.path) === "css");
  if (cssFiles.length > 0 && !cssFiles.some((f) => /@media[^{]*\(/i.test(f.content))) {
    issues.push({
      path: cssFiles[0]!.path,
      severity: "warning",
      message: "لا توجد نقاط توقّف @media — التصميم قد لا يتجاوب مع الجوال",
    });
  }
  if (cssFiles.length > 0 && !cssFiles.some((f) => /:root\s*\{[^}]*--/.test(f.content))) {
    issues.push({
      path: cssFiles[0]!.path,
      severity: "warning",
      message: "لا توجد متغيّرات CSS في :root — نظام التصميم غير موحّد",
    });
  }

  const htmlFiles = files.filter((f) => ext(f.path) === "html" || ext(f.path) === "htm");
  for (const file of htmlFiles) {
    const deadLinks = (file.content.match(/href\s*=\s*["']#["']/gi) ?? []).length;
    if (deadLinks > 2) {
      issues.push({
        path: file.path,
        severity: "warning",
        message: `${deadLinks} رابط فارغ href="#" — اربطها بوجهات حقيقية`,
      });
    }
    if (!/rel\s*=\s*["'][^"']*icon/i.test(file.content)) {
      issues.push({ path: file.path, severity: "warning", message: "لا توجد أيقونة favicon" });
    }
  }
  if (htmlFiles.length === 1 && !files.some((f) => /robots\.txt$/i.test(f.path))) {
    issues.push({
      path: "-",
      severity: "warning",
      message: "لا يوجد robots.txt — أضفه قبل النشر لتحسين الأرشفة",
    });
  }

  const hasEntry = files.some((f) => /(^|\/)index\.html$/i.test(f.path));
  if (!hasEntry) {
    issues.push({
      path: "-",
      severity: "error",
      message: "لا يوجد index.html — المعاينة الحية تحتاج صفحة دخول",
    });
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;

  return {
    ok: errors === 0,
    filesChecked: files.length,
    errors,
    warnings,
    issues: issues.slice(0, 40),
    summary:
      errors === 0
        ? `نجح الفحص: ${files.length} ملف، 0 أخطاء، ${warnings} تحذير`
        : `فشل الفحص: ${errors} خطأ و ${warnings} تحذير في ${files.length} ملف`,
  };
}
