import { createFileRoute } from "@tanstack/react-router";

/**
 * فحص حياة بسيط للحاويات (liveness): يعيد 200 طالما أن الخادم يستجيب.
 * جاهزية الإعدادات وقاعدة البيانات تُفحص في /api/public/health بعد النشر.
 */
export const Route = createFileRoute("/api/public/live")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, at: new Date().toISOString() }, { status: 200 }),
    },
  },
});
