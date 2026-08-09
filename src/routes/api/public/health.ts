import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

/**
 * فحص صحة عام للحاويات ولخطوة التحقق بعد النشر:
 * يتحقق من قاعدة البيانات ومن وجود متغيّرات البيئة الحرجة.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const required = [
          "DATABASE_URL",
          "SESSION_SECRET",
          // مفاتيح النماذج تُفحص عبر providers أدناه (يكفي أي مزوّد واحد)
          "WEAVER_WORKER_TOKEN",
          "WEAVER_PASSCODE",
          "WEAVER_OWNER_EMAIL",
          "SUPABASE_URL",
          "SUPABASE_PUBLISHABLE_KEY",
        ];
        const missing = required.filter((name) => !(process.env[name] ?? "").trim());
        const workerToken = (process.env["WEAVER_WORKER_TOKEN"] ?? "").trim();
        if (workerToken && workerToken.length < 16) missing.push("WEAVER_WORKER_TOKEN(too_short)");

        let db = false;
        let dbError: string | null = null;
        try {
          await Promise.race([
            Promise.resolve(getSql()`SELECT 1`),
            new Promise((_, reject) => setTimeout(() => reject(new Error("db timeout")), 6000)),
          ]);
          db = true;
        } catch (error) {
          dbError = error instanceof Error ? error.message : String(error);
        }

        const providers = {
          openrouter: Boolean((process.env["OPENROUTER_API_KEY"] ?? "").trim()),
          gemini: Boolean((process.env["GEMINI_API_KEY"] ?? "").trim()),
          groq: Boolean((process.env["GROQ_API_KEY"] ?? "").trim()),
        };
        const noProvider = !providers.openrouter && !providers.gemini && !providers.groq;
        if (noProvider) missing.push("MODEL_PROVIDER(none_configured)");

        const ok = db && missing.length === 0;
        if (!ok) {
          try {
            const { alertOnCriticalEnv } = await import("@/lib/alerts.server");
            await alertOnCriticalEnv(
              db ? [] : [`تعذّر الاتصال بقاعدة البيانات: ${dbError ?? "غير معروف"}`],
            );
          } catch {
            /* التنبيه لا يُفشل فحص الصحة */
          }
        }
        return Response.json(
          {
            ok,
            db,
            dbError,
            missingEnv: missing,
            providers,
            model: process.env["OPENROUTER_MODEL"] ?? null,
            uptimeSec: Math.round(process.uptime?.() ?? 0),
            at: new Date().toISOString(),
          },
          { status: ok ? 200 : 503 },
        );
      },
    },
  },
});
