import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { routerStatus } from "@/lib/model-router.server";

const ONLINE_WINDOW_MS = 90_000;

/** لوحة صحة النظام: المنفّذات، الطابور، الأخطاء، الاستهلاك، المواقع المنشورة. */
export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sinceDay = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sinceMonth = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [projects, executors, runs, usage, jobs] = await Promise.all([
      context.supabase
        .from("projects")
        .select("id, title, status, slug, published, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
      context.supabase.from("executors").select("id, name, status, last_seen_at, base_url"),
      context.supabase
        .from("runs")
        .select("id, project_id, kind, status, exit_code, input, created_at")
        .gte("created_at", sinceDay)
        .order("created_at", { ascending: false })
        .limit(300),
      context.supabase
        .from("usage_events")
        .select("total_tokens, cost_usd, created_at, model")
        .gte("created_at", sinceMonth)
        .limit(5000),
      context.supabase
        .from("scheduled_jobs")
        .select("id, name, enabled, next_run_at, last_status")
        .order("next_run_at", { ascending: true })
        .limit(50),
    ]);

    const now = Date.now();
    const executorRows = (executors.data ?? []).map((row) => {
      const seen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
      return {
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        online: now - seen < ONLINE_WINDOW_MS,
        lastSeenAt: row.last_seen_at,
      };
    });

    const runRows = runs.data ?? [];
    const byStatus: Record<string, number> = {};
    for (const run of runRows) byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;

    const failures = runRows
      .filter((run) => run.status === "failed" || (run.exit_code ?? 0) > 0)
      .slice(0, 8)
      .map((run) => ({
        id: run.id,
        projectId: run.project_id,
        command: ((run.input ?? {}) as { command?: string }).command ?? run.kind,
        exitCode: run.exit_code,
        createdAt: run.created_at,
      }));

    const usageRows = usage.data ?? [];
    const tokens = usageRows.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0);
    const cost = usageRows.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);

    const projectRows = projects.data ?? [];

    return {
      modelRouter: routerStatus(),
      executors: executorRows,
      executorsOnline: executorRows.filter((e) => e.online).length,
      queue: {
        queued: byStatus["queued"] ?? 0,
        running: byStatus["running"] ?? 0,
        success: byStatus["success"] ?? 0,
        failed: byStatus["failed"] ?? 0,
        noExecutor: byStatus["no_executor"] ?? 0,
        total: runRows.length,
      },
      failures,
      usage: { tokens, cost, requests: usageRows.length },
      projects: {
        total: projectRows.length,
        published: projectRows.filter((p) => p.published).length,
        recent: projectRows.slice(0, 6).map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          slug: p.slug,
          published: p.published,
          updatedAt: p.updated_at,
        })),
      },
      jobs: (jobs.data ?? []).map((job) => ({
        id: job.id,
        name: job.name,
        enabled: job.enabled,
        nextRunAt: job.next_run_at,
        lastStatus: job.last_status,
      })),
    };
  });
