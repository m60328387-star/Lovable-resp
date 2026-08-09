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

function checkJs(file: WorkspaceFile): Issue[] {
  const opts = { ecmaVersion: 2023 as const, locations: true };
  try {
    acornParse(file.content, { ...opts, sourceType: "module" });
    return [];
  } catch {
    try {
      acornParse(file.content, { ...opts, sourceType: "script" });
      return [];
    } catch (error) {
      const err = error as { message?: string; loc?: { line?: number } };
      return [
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

  const known = new Set(all.map((f) => f.path.replace(/^\.?\//, "")));
  const refRe = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let ref: RegExpExecArray | null;
  while ((ref = refRe.exec(html)) !== null) {
    const value = ref[1] ?? "";
    if (/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(value)) continue;
    const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
    const resolved = value.startsWith("/")
      ? value.slice(1)
      : normalize(dir + value.replace(/^\.\//, ""));
    if (!known.has(resolved)) {
      issues.push({
        path: file.path,
        severity: "error",
        message: `مرجع مفقود في مساحة العمل: ${value}`,
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
