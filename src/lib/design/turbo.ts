/**
 * Turbo Build — تركيب موقع كامل عالي الجودة في خطوة واحدة حتمية.
 *
 * الفكرة: بدل عشرات الجولات (قصاصة → صفحة → تدقيق → صفحة…) يرسل الوكيل
 * النصوص فقط، والخادم يركّب كل الصفحات من قصاصات Weaver UI المعتمدة.
 * النتيجة: سرعة قصوى مع نفس سقف الجودة (نفس الأطقم والاتجاهات والتوكنات).
 */
import { getStarterKit, type StarterKit } from "./starter-kits";
import { UI_SNIPPETS } from "./ui-library";

export interface TurboBrand {
  name: string;
  tagline: string;
  email: string;
  phone: string;
}

export interface TurboCopyEntry {
  page: string;
  section: string;
  values: Record<string, string>;
}

/** المفاتيح التي يملأها الخادم تلقائياً — لا يرسلها الوكيل. */
const AUTO_KEYS = new Set(["BRAND", "YEAR", "EMAIL", "PHONE", "TAGLINE", "ACTION"]);

function placeholdersOf(html: string): string[] {
  return [...new Set([...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1] as string))];
}

/** عقد المحتوى: كل صفحة، كل قسم، والمفاتيح المطلوبة نصّاً من الوكيل. */
export function contentContract(kitId: string): {
  kit: StarterKit;
  pages: {
    path: string;
    title: string;
    sections: { section: string; use: string; keys: string[] }[];
  }[];
} | null {
  const kit = getStarterKit(kitId);
  if (!kit) return null;
  const pages = kit.pages.map((p) => ({
    path: p.path,
    title: p.title,
    sections: [
      { section: "meta", use: "عنوان الصفحة ووصفها لمحركات البحث", keys: ["TITLE", "DESCRIPTION"] },
      ...p.sections
        .map((id) => {
          const snip = UI_SNIPPETS[id];
          if (!snip) return null;
          const keys = placeholdersOf(snip.html).filter((k) => !AUTO_KEYS.has(k));
          return { section: id, use: kit.copyContract[id] ?? snip.use, keys };
        })
        .filter((s): s is { section: string; use: string; keys: string[] } => Boolean(s))
        .filter((s) => s.keys.length > 0),
    ],
  }));
  return { kit, pages };
}

function navHtml(kit: StarterKit, current: string): string {
  const links = kit.pages
    .map(
      (p) =>
        `      <a href="${p.path}"${p.path === current ? ' aria-current="page"' : ""}>${p.title}</a>`,
    )
    .join("\n");
  const cta = kit.pages.find((p) => /contact/.test(p.path));
  const ctaLink = cta
    ? `\n      <a class="u-btn u-btn--primary u-btn--sm" href="${cta.path}">تواصل معنا</a>`
    : "";
  return `${links}${ctaLink}`;
}

export interface TurboResult {
  files: { path: string; content: string }[];
  missing: { page: string; section: string; keys: string[] }[];
}

/** يركّب كل صفحات الموقع من الطقم + النصوص المرسلة. */
export function composeSite(input: {
  kitId: string;
  brand: TurboBrand;
  copy: TurboCopyEntry[];
}): TurboResult | null {
  const kit = getStarterKit(input.kitId);
  if (!kit) return null;

  const shell = UI_SNIPPETS["page_shell"]?.html ?? "";
  const year = String(new Date().getFullYear());
  const auto: Record<string, string> = {
    BRAND: input.brand.name,
    YEAR: year,
    EMAIL: input.brand.email,
    PHONE: input.brand.phone,
    TAGLINE: input.brand.tagline,
    ACTION: "#",
  };

  const lookup = new Map<string, Record<string, string>>();
  for (const entry of input.copy) {
    const key = `${entry.page.replace(/^\.?\//, "")}::${entry.section}`;
    lookup.set(key, { ...(lookup.get(key) ?? {}), ...entry.values });
  }

  const missing: TurboResult["missing"] = [];
  const files: TurboResult["files"] = [];

  for (const page of kit.pages) {
    const meta = lookup.get(`${page.path}::meta`) ?? {};
    const metaMissing = ["TITLE", "DESCRIPTION"].filter((k) => !meta[k]?.trim());
    if (metaMissing.length) missing.push({ page: page.path, section: "meta", keys: metaMissing });

    const parts: string[] = [];
    let headerHtml = "";
    let footerHtml = "";

    for (const id of page.sections) {
      const snip = UI_SNIPPETS[id];
      if (!snip) continue;
      const values = { ...auto, ...(lookup.get(`${page.path}::${id}`) ?? {}) };
      const gaps = placeholdersOf(snip.html).filter((k) => !values[k]?.trim());
      if (gaps.length) missing.push({ page: page.path, section: id, keys: gaps });

      let html = snip.html.replace(
        /\{\{([A-Z0-9_]+)\}\}/g,
        (m, k: string) => values[k]?.trim() || m,
      );
      if (id === "header") {
        html = html.replace(
          /(<nav class="u-nav"[^>]*>)[\s\S]*?(<\/nav>)/,
          (_m, open: string, close: string) => `${open}\n${navHtml(kit, page.path)}\n    ${close}`,
        );
        headerHtml = html;
        continue;
      }
      if (id === "footer") {
        footerHtml = html;
        continue;
      }
      parts.push(html);
    }

    const content = shell
      .replace("{{TITLE}}", meta["TITLE"]?.trim() || `${page.title} | ${input.brand.name}`)
      .replace("{{DESCRIPTION}}", meta["DESCRIPTION"]?.trim() || input.brand.tagline)
      .replace("<!-- header -->", headerHtml)
      .replace("  <!-- sections -->", parts.map((p) => `    ${p}`).join("\n\n"))
      .replace("<!-- footer -->", footerHtml);

    files.push({ path: page.path, content });
  }

  files.push({
    path: "styles.css",
    content: `/* فروق هذا المشروع فقط — المكوّنات في brand/ui.css والتوكنات في brand/tokens.css. */
:root { color-scheme: light; }
.u-hero__lede { max-width: 56ch; }
`,
  });

  return { files, missing };
}
