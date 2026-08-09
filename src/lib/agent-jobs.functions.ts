import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";
import { ensureAgentJobs, enqueueAgentJobRow } from "@/lib/agent-jobs.server";

export type AgentJobView = {
  id: string;
  projectId: string | null;
  status: string;
  phase: string;
  steps: number;
  attempts: number;
  maxAttempts: number;
  model: string | null;
  error: string | null;
  resultText: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

const mapJob = (r: Record<string, unknown>): AgentJobView => ({
  id: String(r["id"]),
  projectId: (r["project_id"] as string | null) ?? null,
  status: String(r["status"]),
  phase: String(r["phase"] ?? ""),
  steps: Number(r["steps"] ?? 0),
  attempts: Number(r["attempts"] ?? 0),
  maxAttempts: Number(r["max_attempts"] ?? 0),
  model: (r["model"] as string | null) ?? null,
  error: (r["error"] as string | null) ?? null,
  resultText: (r["result_text"] as string | null) ?? null,
  createdAt: String(r["created_at"]),
  updatedAt: String(r["updated_at"]),
  finishedAt: r["finished_at"] ? String(r["finished_at"]) : null,
});

/** يضع مهمة بناء في الطابور لينفّذها العامل الخلفي على الخادم. */
export const enqueueAgentJob = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid().nullable().optional(),
        messages: z.array(z.object({ role: z.string() }).passthrough()),
        model: z.string().nullable().optional(),
        mode: z.string().default("build"),
        skills: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const id = await enqueueAgentJobRow({
      userId: context.userId,
      projectId: data.projectId ?? null,
      messages: data.messages,
      model: data.model ?? null,
      mode: data.mode,
      skills: data.skills,
    });
    return { ok: true, jobId: id };
  });

/** مهام مشروع واحد — للاستطلاع اللحظي (polling) في الواجهة. */
export const listProjectJobs = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureAgentJobs();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM public.agent_jobs
      WHERE project_id = ${data.projectId} AND user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const active = (rows as unknown as Record<string, unknown>[]).filter((r) =>
      ["queued", "running"].includes(String(r["status"])),
    );
    let events: Array<{
      kind: string;
      label: string;
      ok: boolean | null;
      at: string;
      durationMs: number | null;
      attempt: number;
    }> = [];
    const current = active[0] ?? (rows as unknown as Record<string, unknown>[])[0];
    if (current) {
      const evRows = await sql`
        SELECT kind, label, ok, duration_ms, attempt, created_at
        FROM public.agent_job_events
        WHERE job_id = ${String(current["id"])}
        ORDER BY created_at DESC
        LIMIT 40
      `;
      events = (evRows as unknown as Record<string, unknown>[]).map((e) => ({
        kind: String(e["kind"]),
        label: String(e["label"]),
        ok: (e["ok"] as boolean | null) ?? null,
        at: String(e["created_at"]),
        durationMs: (e["duration_ms"] as number | null) ?? null,
        attempt: Number(e["attempt"] ?? 1),
      }));
    }
    return {
      jobs: (rows as unknown as Record<string, unknown>[]).map(mapJob),
      events,
    };
  });

export const cancelAgentJob = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sql = getSql();
    await sql`
      UPDATE public.agent_jobs
      SET status = 'canceled', phase = 'أُلغيت', locked_at = NULL,
          finished_at = now(), updated_at = now()
      WHERE id = ${data.jobId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });

/** مؤشّرات مراقبة العامل: الحالة، زمن الخطوة، المحاولات، معدل الفشل. */
export const getWorkerMetrics = createServerFn({ method: "GET" })
  .middleware([requireWeaverAuth])
  .handler(async ({ context }) => {
    await ensureAgentJobs();
    const sql = getSql();
    const [statusRows, toolRows, recentRows, failRows] = await Promise.all([
      sql`
        SELECT status, count(*)::int AS count
        FROM public.agent_jobs WHERE user_id = ${context.userId}
        GROUP BY status
      `,
      sql`
        SELECT e.label,
               count(*)::int AS calls,
               round(avg(e.duration_ms))::int AS avg_ms,
               sum(CASE WHEN e.ok THEN 0 ELSE 1 END)::int AS failures,
               max(e.attempt)::int AS max_attempt
        FROM public.agent_job_events e
        JOIN public.agent_jobs j ON j.id = e.job_id
        WHERE j.user_id = ${context.userId} AND e.kind = 'tool'
          AND e.created_at > now() - interval '7 days'
        GROUP BY e.label
        ORDER BY calls DESC
        LIMIT 20
      `,
      sql`
        SELECT * FROM public.agent_jobs
        WHERE user_id = ${context.userId}
        ORDER BY created_at DESC LIMIT 20
      `,
      sql`
        SELECT e.label, e.detail, e.created_at, e.attempt
        FROM public.agent_job_events e
        JOIN public.agent_jobs j ON j.id = e.job_id
        WHERE j.user_id = ${context.userId} AND e.ok = false
        ORDER BY e.created_at DESC LIMIT 20
      `,
    ]);

    const counts: Record<string, number> = {};
    for (const r of statusRows as unknown as Record<string, unknown>[]) {
      counts[String(r["status"])] = Number(r["count"]);
    }
    return {
      counts,
      tools: (toolRows as unknown as Record<string, unknown>[]).map((r) => ({
        name: String(r["label"]),
        calls: Number(r["calls"]),
        avgMs: Number(r["avg_ms"] ?? 0),
        failures: Number(r["failures"] ?? 0),
        maxAttempt: Number(r["max_attempt"] ?? 1),
      })),
      recent: (recentRows as unknown as Record<string, unknown>[]).map(mapJob),
      failures: (failRows as unknown as Record<string, unknown>[]).map((r) => ({
        label: String(r["label"]),
        detail: (r["detail"] as string | null) ?? null,
        at: String(r["created_at"]),
        attempt: Number(r["attempt"] ?? 1),
      })),
    };
  });
