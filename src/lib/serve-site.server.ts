import { getSql } from "@/lib/db";
import { makeLocalSupabase } from "@/lib/local-supabase";

/** يقدّم ملفات مساحة عمل مشروع منشور كموقع عام. Server-only. */

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  webmanifest: "application/manifest+json",
};

function contentType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "text/plain; charset=utf-8";
}

function notFoundResponse() {
  return new Response(
    `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>غير موجود</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>404</h1><p>هذه الصفحة غير منشورة.</p></div></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** يفكّ ملفًا مخزّنًا كـ data URL (صور مولّدة) إلى استجابة ثنائية. */
function decodeDataUrl(content: string): Response | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(content.trim());
  if (!match) return null;
  const binary = atob((match[2] ?? "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "Content-Type": match[1] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** رسالة خطأ خدمة مؤقتة بدل انفجار 500 عند تعذّر الوصول لقاعدة البيانات. */
function unavailableResponse() {
  return new Response(
    `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>غير متاح مؤقتًا</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>503</h1><p>الخدمة غير متاحة مؤقتًا. حاول بعد قليل.</p></div></body></html>`,
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "30" },
    },
  );
}

export async function serveSite(splat: string, request?: Request): Promise<Response> {
  try {
    return await serveSiteInner(splat, request);
  } catch (error) {
    console.error("[serve-site] failed", error);
    return unavailableResponse();
  }
}

async function serveSiteInner(splat: string, request?: Request): Promise<Response> {
  const parts = splat.split("/").filter(Boolean);
  const slug = parts.shift();
  if (!slug) return notFoundResponse();
  let path = parts.join("/");
  if (!path) path = "index.html";

  const sql = getSql();
  const supabase = makeLocalSupabase(sql, "anonymous");

  const { data: project } = await supabase
    .from("projects")
    .select("id, published")
    .eq("slug", slug)
    .maybeSingle();
  if (!project || !project.published) return notFoundResponse();

  // لا نُرجع الصفحة الرئيسية بدل ملف أصول مفقود (يخفي الروابط المكسورة).
  const isAsset = /\.[a-z0-9]{2,5}$/i.test(path) && !/\.html?$/i.test(path);
  const candidates = Array.from(
    new Set(
      [path, path.replace(/^\/+/, ""), `${path}/index.html`, isAsset ? null : "index.html"].filter(
        (c): c is string => Boolean(c),
      ),
    ),
  );
  const { data: files } = await supabase
    .from("files")
    .select("path, content")
    .eq("project_id", project.id)
    .in("path", candidates);

  const byPath = new Map(
    ((files as Array<{ path: string; content: string }>) ?? []).map((f) => [f.path, f.content]),
  );
  const hit = candidates.find((c) => byPath.has(c));
  if (!hit) return notFoundResponse();

  const content = byPath.get(hit) ?? "";

  if (/\.html?$/i.test(hit)) {
    try {
      await supabase.from("site_views").insert({
        project_id: project.id,
        path: `/${path}`,
        referrer: request?.headers.get("referer") ?? null,
        country: request?.headers.get("cf-ipcountry") ?? null,
      });
    } catch {
      // التحليلات لا يجب أن تُعطّل تقديم الصفحة
    }
  }

  const binary = decodeDataUrl(content);
  if (binary) return binary;

  return new Response(content, {
    headers: { "Content-Type": contentType(hit), "Cache-Control": "public, max-age=60" },
  });
}
