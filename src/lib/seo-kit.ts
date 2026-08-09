/** مولّد طبقة SEO والأصول القياسية لأي موقع ينتجه Weaver — بلا اعتماديات. */

export interface SeoKitInput {
  siteName: string;
  description: string;
  baseUrl: string;
  pages: string[];
  themeColor?: string;
  locale?: string;
  organizationType?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

const clean = (value: string) => value.replace(/["<>]/g, "").trim();

function normalizePages(pages: string[]): string[] {
  const list = pages.length ? pages : ["index.html"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const page of list) {
    const rel = page.replace(/^\/+/, "");
    if (!/\.html?$/i.test(rel)) continue;
    const url = rel === "index.html" ? "/" : `/${rel}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.length ? out : ["/"];
}

export function buildSeoKit(input: SeoKitInput): {
  files: GeneratedFile[];
  headSnippet: string;
} {
  const base = input.baseUrl.replace(/\/+$/, "");
  const name = clean(input.siteName) || "Website";
  const description = clean(input.description).slice(0, 155);
  const theme = input.themeColor ?? "#0f766e";
  const locale = input.locale ?? "ar";
  const urls = normalizePages(input.pages);

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        `  <url>\n    <loc>${base}${url}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${url === "/" ? "1.0" : "0.7"}</priority>\n  </url>`,
    ),
    "</urlset>",
    "",
  ].join("\n");

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;

  const manifest = JSON.stringify(
    {
      name,
      short_name: name.slice(0, 12),
      description,
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: theme,
      lang: locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      icons: [
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
      ],
    },
    null,
    2,
  );

  const initial = name.trim().charAt(0).toUpperCase() || "W";
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${name}">
  <rect width="64" height="64" rx="14" fill="${theme}"/>
  <text x="32" y="43" font-family="system-ui, sans-serif" font-size="34" font-weight="700"
        text-anchor="middle" fill="#ffffff">${initial}</text>
</svg>
`;

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": input.organizationType ?? "Organization",
      name,
      description,
      url: `${base}/`,
      logo: `${base}/favicon.svg`,
    },
    null,
    2,
  );

  const headSnippet = `<!-- SEO: انسخ هذه الكتلة داخل <head> في كل صفحة وعدّل العنوان والوصف لكل صفحة -->
<title>${name}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${base}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${name}">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${base}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${theme}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">
${jsonLd}
</script>`;

  return {
    files: [
      { path: "sitemap.xml", content: sitemap },
      { path: "robots.txt", content: robots },
      { path: "site.webmanifest", content: manifest },
      { path: "favicon.svg", content: favicon },
      { path: "seo-head.html", content: headSnippet + "\n" },
    ],
    headSnippet,
  };
}
