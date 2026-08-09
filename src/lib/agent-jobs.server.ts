import { getSql } from "@/lib/db";

/**
 * طابور مهام الوكيل (Agent Jobs Queue).
 * يسمح بتشغيل حلقة البناء داخل عامل خلفي دائم على الخادم،
 * فيكمل البناء حتى لو أُغلق المتصفح.
 */

export type AgentJobStatus = "queued" | "running" | "done" | "error" | "canceled";

export type AgentJobRow = {
  id: string;
  project_id: string | null;
  user_id: string;
  status: AgentJobStatus;
  phase: string;
  model: string | null;
  mode: string;
  skills: unknown;
  messages: unknown;
  progress: unknown;
  steps: number;
  attempts: number;
  max_attempts: number;
  result_text: string | null;
  error: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

let ensured = false;

/** ينشئ جدول الطابور عند أول استخدام (يعمل على أي نشر قائم دون ترحيل يدوي). */
export async function ensureAgentJobs(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.agent_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID,
      user_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      phase TEXT NOT NULL DEFAULT 'في الطابور',
      model TEXT,
      mode TEXT NOT NULL DEFAULT 'build',
      skills JSONB NOT NULL DEFAULT '[]'::jsonb,
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      progress JSONB NOT NULL DEFAULT '[]'::jsonb,
      steps INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 20,
      result_text TEXT,
      error TEXT,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS agent_jobs_queue_idx
      ON public.agent_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS agent_jobs_project_idx
      ON public.agent_jobs(project_id, created_at DESC);
    ALTER TABLE public.agent_jobs ALTER COLUMN max_attempts SET DEFAULT 20;

    CREATE TABLE IF NOT EXISTS public.agent_job_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL,
      project_id UUID,
      kind TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      detail TEXT,
      ok BOOLEAN,
      duration_ms INTEGER,
      attempt INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS agent_job_events_job_idx
      ON public.agent_job_events(job_id, created_at);
  `);
  ensured = true;
}

export async function enqueueAgentJobRow(input: {
  userId: string;
  projectId: string | null;
  messages: unknown;
  model: string | null;
  mode: string;
  skills: string[];
}): Promise<string> {
  await ensureAgentJobs();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO public.agent_jobs (project_id, user_id, messages, model, mode, skills)
    VALUES (
      ${input.projectId},
      ${input.userId},
      ${sql.json(input.messages as never)},
      ${input.model},
      ${input.mode},
      ${sql.json(input.skills as never)}
    )
    RETURNING id
  `;
  return (rows[0] as unknown as { id: string }).id;
}

/** يسحب مهمة واحدة بشكل ذرّي (SKIP LOCKED) — آمن مع أكثر من عامل. */
export async function claimNextJob(staleMinutes = 20): Promise<AgentJobRow | null> {
  await ensureAgentJobs();
  const sql = getSql();
  const rows = await sql`
    UPDATE public.agent_jobs AS j
    SET status = 'running',
        attempts = j.attempts + 1,
        locked_at = now(),
        started_at = COALESCE(j.started_at, now()),
        phase = 'بدء التنفيذ',
        updated_at = now()
    WHERE j.id = (
      SELECT c.id FROM public.agent_jobs c
      WHERE c.status = 'queued'
         OR (c.status = 'running' AND c.locked_at < now() - (${staleMinutes} || ' minutes')::interval)
      ORDER BY c.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return (rows[0] as unknown as AgentJobRow) ?? null;
}

export async function logJobEvent(input: {
  jobId: string;
  projectId: string | null;
  kind: string;
  label: string;
  detail?: string | null;
  ok?: boolean | null;
  durationMs?: number | null;
  attempt?: number;
}): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      INSERT INTO public.agent_job_events
        (job_id, project_id, kind, label, detail, ok, duration_ms, attempt)
      VALUES (
        ${input.jobId}, ${input.projectId}, ${input.kind}, ${input.label},
        ${input.detail ?? null}, ${input.ok ?? null},
        ${input.durationMs ?? null}, ${input.attempt ?? 1}
      )
    `;
  } catch {
    /* السجل مساعد ولا يجب أن يُفشل المهمة */
  }
}

export async function setJobPhase(jobId: string, phase: string, steps?: number): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE public.agent_jobs
      SET phase = ${phase},
          steps = COALESCE(${steps ?? null}, steps),
          locked_at = now(),
          updated_at = now()
      WHERE id = ${jobId}
    `;
  } catch {
    /* تحديث الحالة مساعد */
  }
}

export async function finishJob(input: {
  jobId: string;
  status: Extract<AgentJobStatus, "done" | "error" | "queued">;
  phase: string;
  resultText?: string | null;
  error?: string | null;
  steps?: number;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.agent_jobs
    SET status = ${input.status},
        phase = ${input.phase},
        result_text = COALESCE(${input.resultText ?? null}, result_text),
        error = ${input.error ?? null},
        steps = COALESCE(${input.steps ?? null}, steps),
        locked_at = NULL,
        updated_at = now(),
        finished_at = ${input.status === "queued" ? null : new Date()}
    WHERE id = ${input.jobId}
  `;
}

/** يضيف رسالة "أكمل" ويعيد المهمة للطابور لمتابعة البناء تلقائياً. */
export async function requeueForContinuation(
  job: AgentJobRow,
  assistantText: string,
  instruction = "أكمل البناء من حيث توقّفت حتى ينجح run_checks ثم انشر. لا تطلب مراجعة ولا تتوقف عند الشرح.",
  phase = "إعادة جدولة للمتابعة",
): Promise<void> {
  const sql = getSql();
  const history = Array.isArray(job.messages) ? (job.messages as unknown[]) : [];
  const next = [
    ...history,
    {
      id: `bg-assistant-${Date.now()}`,
      role: "assistant",
      parts: [{ type: "text", text: assistantText || "(تابعت العمل)" }],
    },
    {
      id: `bg-continue-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: instruction }],
    },
  ];
  await sql`
    UPDATE public.agent_jobs
    SET messages = ${sql.json(next as never)},
        status = 'queued',
        phase = ${phase},
        error = NULL,
        finished_at = NULL,
        locked_at = NULL,
        updated_at = now()
    WHERE id = ${job.id}
  `;
}
