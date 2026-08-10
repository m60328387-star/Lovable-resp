import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

/**
 * فحص صحة عام للحاويات ولخطوة التحقق بعد النشر:
 * يتحقق من قاعدة البيانات ومن وجود متغيّرات البيئة الحرجة.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // التفاصيل التشغيلية (المتغيرات الناقصة، المزوّدون، القدرات) استطلاع مفيد
        // لمهاجم — تُعرض فقط لحاملي توكن العامل؛ العامة يرون ok/db فقط.
        const authz = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const workerSecret = (process.env["WEAVER_WORKER_TOKEN"] ?? "").trim();
        const detailed = Boolean(workerSecret) && authz === workerSecret;
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

        // حالة النسخ الاحتياطي (تحذيرية فقط — لا تُفشل فحص الصحة)
        let backupAgeHours: number | null = null;
        let backupAt: string | null = null;
        try {
          const { readFile } = await import("node:fs/promises");
          const raw = (await readFile("/backups/last-success.txt", "utf8")).trim();
          const ts = Date.parse(raw);
          if (!Number.isNaN(ts)) {
            backupAt = new Date(ts).toISOString();
            backupAgeHours = Math.round(((Date.now() - ts) / 3_600_000) * 10) / 10;
          }
        } catch {
          /* لا توجد نسخة بعد */
        }

        const providers = {
          openrouter: Boolean((process.env["OPENROUTER_API_KEY"] ?? "").trim()),
          gemini: Boolean((process.env["GEMINI_API_KEY"] ?? "").trim()),
          groq: Boolean((process.env["GROQ_API_KEY"] ?? "").trim()),
        };
        const noProvider = !providers.openrouter && !providers.gemini && !providers.groq;
        if (noProvider) missing.push("MODEL_PROVIDER(none_configured)");

        // قدرات اختيارية: أدوات تعمل فقط عند توفّر مفاتيحها (تظهر هنا بدل أن تفشل صامتة).
        const capabilities = {
          executor: Boolean((process.env["EXECUTOR_TOKEN"] ?? "").trim()),
          runtime: Boolean((process.env["RUNTIME_URL"] ?? "").trim()),
          selfRepo: Boolean(
            (process.env["GITHUB_TOKEN"] ?? "").trim() &&
            (process.env["GITHUB_REPO_URL"] ?? "").trim(),
          ),
          deployHook: Boolean((process.env["PLATFORM_DEPLOY_URL"] ?? "").trim()),
          imageGen: Boolean((process.env["GEMINI_API_KEY"] ?? "").trim()),
          webSearch: Boolean((process.env["BRAVE_API_KEY"] ?? "").trim()),
        };
        const disabledTools = Object.entries(capabilities)
          .filter(([, on]) => !on)
          .map(([name]) => name);

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
        if (!detailed) {
          return Response.json({ ok, db, at: new Date().toISOString() }, { status: ok ? 200 : 503 });
        }

        return Response.json(
          {
            ok,
            db,
            dbError,
            missingEnv: missing,
            providers,
            capabilities,
            disabledTools,
            backup: {
              at: backupAt,
              ageHours: backupAgeHours,
              stale: backupAgeHours === null || backupAgeHours > 48,
            },
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
