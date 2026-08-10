import { createFileRoute } from "@tanstack/react-router";
import { runtimeConfigured, runtimeToken, runtimeUrl } from "@/lib/runtime.server";

/**
 * بروكسي المعاينة الحيّة: /api/public/rt/<projectId>/<path>
 * على خادم Contabo يعترض nginx هذا المسار ويمرّره مباشرة إلى حاوية runtime
 * (لدعم WebSocket/HMR). هذا المسار هو الاحتياط عند غياب nginx.
 */
async function proxy({ request, params }: { request: Request; params: { _splat?: string } }) {
  if (!runtimeConfigured()) {
    return new Response("<h1>بيئة التنفيذ غير مفعّلة على هذه النسخة</h1>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const splat = params._splat ?? "";
  const url = new URL(request.url);
  const target = `${runtimeUrl()}/p/${splat}${url.search}`;

  // لا ننسخ ترويسات الطلب كما هي: ترويسات النقل (connection/upgrade/host/
  // content-length/transfer-encoding) تجعل undici يرمي "fetch failed" داخل الحاوية.
  const HOP = new Set([
    "host",
    "connection",
    "keep-alive",
    "upgrade",
    "proxy-connection",
    "transfer-encoding",
    "content-length",
    "te",
    "trailer",
    "expect",
  ]);
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP.has(name.toLowerCase())) headers.set(name, value);
  });
  headers.set("x-weaver-token", runtimeToken());

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? null
          : new Uint8Array(await request.arrayBuffer()),
      redirect: "manual",
    });
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    out.set("cache-control", "no-store");
    return new Response(res.body, { status: res.status, headers: out });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    return new Response(
      `تعذّر الوصول إلى بيئة التنفيذ (${runtimeUrl()}): ${String(err)}${cause ? ` — ${String(cause)}` : ""}`,
      {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }
}

export const Route = createFileRoute("/api/public/rt/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      DELETE: proxy,
      PATCH: proxy,
      HEAD: proxy,
    },
  },
});
