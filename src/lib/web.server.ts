/**
 * بحث وقراءة صفحات من الإنترنت بدون أي اشتراك مدفوع:
 * - البحث عبر DuckDuckGo HTML (مجاني، بلا مفتاح).
 * - قراءة الصفحات عبر r.jina.ai كـ Markdown، مع fallback إلى الجلب المباشر وتنظيف الوسوم.
 */

export type SearchResult = { title: string; url: string; snippet: string };

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function decodeEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** يفكّ روابط DuckDuckGo الوسيطة (/l/?uddg=...) إلى الرابط الحقيقي. */
function normalizeUrl(href: string) {
  const raw = decodeEntities(href);
  const match = raw.match(/[?&]uddg=([^&]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return raw;
    }
  }
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

/** محرك أساسي: Brave Search (HTML عام، بلا مفتاح). */
async function braveSearch(query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "ar,en;q=0.8" },
  });
  if (!response.ok) return [];
  const html = await response.text();
  const results: SearchResult[] = [];

  for (const block of html.split('data-type="web"').slice(1)) {
    const url = block.match(/<a href="(https?:\/\/[^"]+)"/)?.[1];
    if (!url) continue;
    const title = stripTags(
      block.match(/class="title[^"]*"[^>]*>([\s\S]{0,400}?)<\/div>/)?.[1] ?? "",
    );
    const snippet = stripTags(
      block.match(/class="snippet-description[^"]*"[^>]*>([\s\S]{0,800}?)<\/div>/)?.[1] ?? "",
    );
    results.push({
      title: title || normalizeUrl(url),
      url: normalizeUrl(url),
      snippet: snippet || stripTags(block).slice(0, 240),
    });
    if (results.length >= limit) break;
  }
  return results;
}

/** محرك احتياطي: DuckDuckGo HTML. */
async function ddgSearch(query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      "Accept-Language": "ar,en;q=0.8",
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!response.ok) return [];
  const html = await response.text();
  const results: SearchResult[] = [];

  for (const block of html.split('class="result__body"').slice(1)) {
    const link = block.match(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link?.[1]) continue;
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const url = normalizeUrl(link[1]);
    if (!/^https?:\/\//.test(url)) continue;
    results.push({ title: stripTags(link[2] ?? ""), url, snippet: stripTags(snippet?.[1] ?? "") });
    if (results.length >= limit) break;
  }
  return results;
}

export async function webSearch(query: string, limit = 6): Promise<SearchResult[]> {
  const max = Math.min(Math.max(limit || 6, 1), 10);
  for (const engine of [braveSearch, ddgSearch]) {
    try {
      const results = await engine(query, max);
      if (results.length > 0) return results;
    } catch {
      // نجرّب المحرك التالي
    }
  }
  return [];
}

export async function webFetch(url: string, maxChars = 12000) {
  if (!/^https?:\/\//i.test(url)) throw new Error("الرابط يجب أن يبدأ بـ http(s)://");

  // 1) قارئ jina المجاني يعيد Markdown نظيفاً
  try {
    const reader = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "User-Agent": UA, "X-Return-Format": "markdown" },
    });
    if (reader.ok) {
      const text = await reader.text();
      if (text.trim().length > 200) {
        return {
          url,
          format: "markdown",
          truncated: text.length > maxChars,
          content: text.slice(0, maxChars),
        };
      }
    }
  } catch {
    // نتابع إلى الجلب المباشر
  }

  // 2) جلب مباشر مع تنظيف الوسوم
  const direct = await fetch(url, { headers: { "User-Agent": UA } });
  if (!direct.ok) throw new Error(`تعذّر جلب الصفحة [${direct.status}]`);
  const html = await direct.text();
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = stripTags(body);
  return {
    url,
    format: "text",
    truncated: text.length > maxChars,
    content: text.slice(0, maxChars),
  };
}
