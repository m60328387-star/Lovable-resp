-- طابور مهام الوكيل الخلفي (Background Agent Jobs)
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
CREATE INDEX IF NOT EXISTS agent_jobs_queue_idx ON public.agent_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS agent_jobs_project_idx ON public.agent_jobs(project_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS agent_job_events_job_idx ON public.agent_job_events(job_id, created_at);
