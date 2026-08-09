import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";
import { routerStatus } from "@/lib/model-router.server";

export type EnvItem = { name: string; present: boolean; critical: boolean; hint: string };
export type MonitorEvent = {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  ok: boolean | null;
  created_at: string;
  source: "worker" | "app";
};
export type MonitorSnapshot = {
  modelRouter: ReturnType<typeof routerStatus>;
  ok: boolean;
  db: boolean;
  dbError: string | null;
  env: EnvItem[];
  alerts: string[];
  events: MonitorEvent[];
  jobs: { status: string; count: number }[];
  workerLastSeen: string | null;
  at: string;
};

const CRITICAL: { name: string; hint: string }[] = [
  { name: "DATABASE_URL", hint: "اتصال قاعدة البيانات — بدونه لا يعمل أي شيء" },
  { name: "SESSION_SECRET", hint: "توقيع جلسة الدخول" },
  { name: "WEAVER_PASSCODE", hint: "الرمز السري للدخول" },
  { name: "WEAVER_WORKER_TOKEN", hint: "مصادقة العامل الخلفي مع التطبيق" },
  { name: "OPENROUTER_API_KEY", hint: "مفتاح النموذج" },
  { name: "SUPABASE_URL", hint: "يُحقن في الواجهة وقت البناء كـ VITE_SUPABASE_URL" },
  { name: "SUPABASE_PUBLISHABLE_KEY", hint: "يُحقن كـ VITE_SUPABASE_PUBLISHABLE_KEY" },
];

const OPTIONAL: { name: string; hint: string }[] = [
  { name: "WEAVER_SCHEDULER_SECRET", hint: "المهام المجدولة" },
  { name: "EXECUTOR_TOKEN", hint: "منفّذ الأوامر على الخادم" },
  { name: "GITHUB_TOKEN", hint: "الرفع إلى GitHub والتطوير الذاتي" },
  { name: "GITHUB_REPO_URL", hint: "مستودع Weaver نفسه" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", hint: "عمليات مميّزة" },
];

/** لقطة مراقبة: صحة، متغيّرات بيئة، سجلات العامل، وتنبيهات. */
export const getMonitorSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<MonitorSnapshot> => {
    const withTimeout = <T,>(work: Promise<T>, ms = 6000): Promise<T> =>
      Promise.race([
        work,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("انتهت مهلة الاتصال بقاعدة البيانات")), ms),
        ),
      ]);

    const env: EnvItem[] = [
      ...CRITICAL.map((item) => ({
        name: item.name,
        hint: item.hint,
        critical: true,
        present: Boolean((process.env[item.name] ?? "").trim()),
      })),
      ...OPTIONAL.map((item) => ({
        name: item.name,
        hint: item.hint,
        critical: false,
        present: Boolean((process.env[item.name] ?? "").trim()),
      })),
    ];

    const alerts: string[] = [];
    for (const item of env) {
      if (item.critical && !item.present) alerts.push(`متغيّر حرج مفقود: ${item.name} — ${item.hint}`);
    }
    const workerToken = (process.env["WEAVER_WORKER_TOKEN"] ?? "").trim();
    if (workerToken && workerToken.length < 16) {
      alerts.push("WEAVER_WORKER_TOKEN قصير جداً (أقل من 16 محرفاً) — العامل الخلفي سيرفض العمل.");
    }
    if (!(process.env["SUPABASE_URL"] ?? "").trim() || !(process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "").trim()) {
      alerts.push(
        "متغيّرات VITE_SUPABASE_* لن تُحقن وقت البناء — ستظهر لافتة «Missing Supabase environment variable(s)» في الواجهة.",
      );
    }

    let db = true;
    let dbError: string | null = null;
    let events: MonitorEvent[] = [];
    let jobs: { status: string; count: number }[] = [];
    let workerLastSeen: string | null = null;

    try {
      const sql = getSql();
      await withTimeout(Promise.resolve(sql`SELECT 1`));
      const eventRows = await withTimeout(Promise.resolve(sql`
        SELECT id::text, kind, label, detail, ok, created_at
        FROM public.agent_job_events
        ORDER BY created_at DESC
        LIMIT 80
      `));
      events = (eventRows as unknown as Array<Record<string, unknown>>).map((row) => ({
        id: String(row["id"]),
        kind: String(row["kind"]),
        label: String(row["label"] ?? ""),
        detail: (row["detail"] as string | null) ?? null,
        ok: (row["ok"] as boolean | null) ?? null,
        created_at: new Date(row["created_at"] as string).toISOString(),
        source: "worker" as const,
      }));
      workerLastSeen = events[0]?.created_at ?? null;

      const jobRows = await withTimeout(Promise.resolve(sql`
        SELECT status, count(*)::int AS count FROM public.agent_jobs GROUP BY status
      `));
      jobs = (jobRows as unknown as Array<{ status: string; count: number }>).map((row) => ({
        status: row.status,
        count: Number(row.count),
      }));
    } catch (error) {
      db = false;
      dbError = error instanceof Error ? error.message : String(error);
      alerts.push(`تعذّر الاتصال بقاعدة البيانات: ${dbError}`);
    }

    for (const event of events.slice(0, 20)) {
      const text = `${event.label} ${event.detail ?? ""}`;
      if (/VITE_SUPABASE|WEAVER_WORKER_TOKEN|unauthorized|worker_token_missing/i.test(text)) {
        alerts.push(`سجلّ العامل: ${text.slice(0, 180)}`);
      }
    }

    return {
      modelRouter: routerStatus(),
      ok: db && alerts.length === 0,
      db,
      dbError,
      env,
      alerts: Array.from(new Set(alerts)),
      events,
      jobs,
      workerLastSeen,
      at: new Date().toISOString(),
    };
  });

export type AuditFilters = {
  search?: string;
  result?: "all" | "ok" | "fail";
  kind?: string;
  from?: string | null;
  to?: string | null;
};

/** سجل التدقيق: كل تنفيذ أداة أو نداء رابط مع بحث بالوقت والنتيجة + حالة الـ sandbox. */
export const getAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AuditFilters) => input ?? {})
  .handler(async ({ data }) => {
    const { queryAudit, auditSummary } = await import("@/lib/audit.server");
    const { sandboxStatus } = await import("@/lib/sandbox.server");
    try {
      const [rows, summary] = await Promise.all([queryAudit(data), auditSummary()]);
      return { ok: true, error: null as string | null, rows, summary, sandbox: sandboxStatus() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        rows: [],
        summary: [],
        sandbox: sandboxStatus(),
      };
    }
  });

/** إرسال تنبيه تجريبي للتحقق من قنوات Telegram/البريد. */
export const sendTestAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sendAlert } = await import("@/lib/alerts.server");
    return sendAlert(`manual_test_${Date.now()}`, "اختبار قنوات التنبيه", [
      "هذه رسالة تجريبية من لوحة المراقبة.",
    ]);
  });
