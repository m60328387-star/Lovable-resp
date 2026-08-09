ALTER TABLE public.executors
  ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS workdir text NOT NULL DEFAULT '/opt/weaver/work',
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS executors_token_key ON public.executors(token);

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS executor_id uuid REFERENCES public.executors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE INDEX IF NOT EXISTS runs_queue_idx ON public.runs(status, created_at);