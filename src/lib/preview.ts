export type PreviewFile = { path: string; content: string };

function normalize(path: string) {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function resolvePath(from: string, ref: string) {
  const clean = ref.split("?")[0]?.split("#")[0] ?? ref;
  if (clean.startsWith("/")) return normalize(clean.slice(1));
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  return normalize(dir + clean);
}

const isExternal = (ref: string) => /^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(ref);

/** يدمج @import و url() المحلية داخل ملف CSS حتى تظهر الخطوط والصور في المعاينة. */
function inlineCss(css: string, from: string, byPath: Map<string, string>, depth = 0): string {
  if (depth > 4) return css;
  let out = css.replace(/@import\s+(?:url\()?["']([^"')]+)["']\)?\s*;/gi, (tag, ref: string) => {
    if (isExternal(ref)) return tag;
    const nested = byPath.get(resolvePath(from, ref));
    return nested ? inlineCss(nested, resolvePath(from, ref), byPath, depth + 1) : tag;
  });
  out = out.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (tag, ref: string) => {
    if (isExternal(ref)) return tag;
    const asset = byPath.get(resolvePath(from, ref));
    return asset && asset.startsWith("data:") ? `url("${asset}")` : tag;
  });
  return out;
}

/** يحوّل استيرادات ES المحلية إلى وحدات blob حتى تعمل ملفات JS المقسّمة داخل iframe. */
function inlineModules(js: string, from: string, byPath: Map<string, string>, depth = 0): string {
  if (depth > 6) return js;
  const pattern = /(\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  return js.replace(pattern, (tag, prefix: string, ref: string) => {
    if (isExternal(ref) || !/^[./]/.test(ref)) return tag;
    const target = resolvePath(from, ref);
    const source =
      byPath.get(target) ??
      byPath.get(`${target}.js`) ??
      byPath.get(`${target}/index.js`) ??
      byPath.get(`${target}.mjs`);
    if (source === undefined) return tag;
    const resolved = byPath.has(target)
      ? target
      : byPath.has(`${target}.js`)
        ? `${target}.js`
        : `${target}/index.js`;
    const inlined = inlineModules(source, resolved, byPath, depth + 1);
    const url = `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(inlined)))}`;
    return `${prefix}"${url}"`;
  });
}

function buildDocument(entry: PreviewFile, byPath: Map<string, string>): string {
  let html = entry.content;

  html = html.replace(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
    if (!/stylesheet/i.test(tag) || isExternal(href)) return tag;
    const css = byPath.get(resolvePath(entry.path, href));
    return css
      ? `<style>\n${inlineCss(css, resolvePath(entry.path, href), byPath)}\n</style>`
      : tag;
  });

  html = html.replace(
    /<script\b([^>]*)\ssrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (tag, before: string, src: string, after: string) => {
      if (isExternal(src)) return tag;
      const path = resolvePath(entry.path, src);
      const js = byPath.get(path);
      if (js === undefined) return tag;
      const isModule = /type\s*=\s*["']module["']/i.test(before + after);
      const body = isModule ? inlineModules(js, path, byPath) : js;
      return `<script${isModule ? ' type="module"' : ""}>\n${body}\n</script>`;
    },
  );

  html = html.replace(
    /(<(?:img|source|video|audio)\b[^>]*\ssrc\s*=\s*)["']([^"']+)["']/gi,
    (tag, prefix: string, src: string) => {
      if (isExternal(src)) return tag;
      const asset = byPath.get(resolvePath(entry.path, src));
      return asset && asset.startsWith("data:") ? `${prefix}"${asset}"` : tag;
    },
  );

  html = html.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_tag, attrs: string, css: string) =>
      `<style${attrs}>${inlineCss(css, entry.path, byPath)}</style>`,
  );

  return html;
}

/** سكربت تنقّل داخلي: يجعل الروابط بين صفحات المشروع تعمل داخل المعاينة ويبقى فعّالاً بعد كل انتقال. */
const NAV_BOOTSTRAP = `(function(current){
  var pages = JSON.parse(document.getElementById("__wv_pages").textContent);
  
  function resolve(ref){
    if(/^(https?:|data:|blob:|mailto:|tel:|#|\\/\\/)/i.test(ref)) return null;
    var clean = ref.split("?")[0].split("#")[0];
    if(!clean) return null;
    var base = clean.charAt(0) === "/" ? "" : current.indexOf("/") >= 0 ? current.slice(0, current.lastIndexOf("/") + 1) : "";
    var parts = [];
    (base + clean.replace(/^\\//, "")).split("/").forEach(function(s){
      if(!s || s === ".") return;
      if(s === "..") parts.pop(); else parts.push(s);
    });
    var p = parts.join("/");
    if(pages[p]) return p;
    if(pages[p + "/index.html"]) return p + "/index.html";
    return null;
  }
  document.addEventListener("click", function(e){
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if(!a) return;
    var target = resolve(a.getAttribute("href") || "");
    if(!target) return;
    e.preventDefault();
    var doc = pages[target];
    var shell = document.getElementById("__wv_shell");
    shell.setAttribute("data-current", target);
    var markup = shell.outerHTML;
    document.open();
    document.write(doc.indexOf("</body>") >= 0 ? doc.replace(/<\\/body>/i, markup + "</body>") : doc + markup);
    document.close();
  }, true);
})(document.getElementById("__wv_shell").getAttribute("data-current"));`;

function navShell(pages: Record<string, string>, current: string) {
  const safe = (value: string) => value.replace(/<\//g, "<\\/");
  return (
    `<span id="__wv_shell" hidden data-current="${current}">` +
    `<script type="application/json" id="__wv_pages">${safe(JSON.stringify(pages))}</script>` +
    `<script type="text/plain" id="__wv_nav">${safe(NAV_BOOTSTRAP)}</script>` +
    `<script>eval(document.getElementById("__wv_nav").textContent)</script>` +
    `</span>`
  );
}

/**
 * يجمع ملفات مساحة العمل في مستند HTML واحد قابل للعرض داخل iframe:
 * يدمج CSS/JS/الصور المحلية، ويحلّ استيرادات ES، ويشغّل التنقل بين الصفحات.
 */
export function buildPreviewDocument(files: PreviewFile[]): string | null {
  const clean = (p: string) => p.replace(/^\.?\//, "");
  const score = (p: string) => {
    const path = clean(p).toLowerCase();
    if (path === "index.html") return 0;
    if (path === "dist/index.html" || path === "build/index.html") return 1;
    if (path === "public/index.html" || path === "src/index.html") return 2;
    if (/(^|\/)index\.html$/.test(path)) return 3;
    if (path.endsWith(".html")) return 4;
    return 99;
  };

  const normalized = files.map((f) => ({ path: clean(f.path), content: f.content }));
  const entry = normalized
    .filter((f) => score(f.path) < 99)
    .sort((a, b) => score(a.path) - score(b.path) || a.path.length - b.path.length)[0];
  if (!entry) return null;

  const byPath = new Map(normalized.map((f) => [f.path, f.content]));

  const pages: Record<string, string> = {};
  for (const file of normalized) {
    if (!file.path.toLowerCase().endsWith(".html")) continue;
    pages[file.path] = buildDocument(file, byPath);
  }

  const doc = pages[entry.path] ?? buildDocument(entry, byPath);
  if (Object.keys(pages).length <= 1) return doc;

  const nav = navShell(pages, entry.path);
  return doc.includes("</body>") ? doc.replace(/<\/body>/i, `${nav}</body>`) : doc + nav;
}
