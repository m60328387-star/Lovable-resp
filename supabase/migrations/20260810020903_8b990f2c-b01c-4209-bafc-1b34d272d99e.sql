ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_state JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deployed_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_check JSONB;

COMMENT ON COLUMN public.projects.build_state IS 'Persistent state of the build loop: phase, completed steps, and current task.';
COMMENT ON COLUMN public.projects.next_action IS 'Next action the agent should take when it resumes.';
COMMENT ON COLUMN public.projects.deployed_url IS 'Public URL of the deployed project.';
COMMENT ON COLUMN public.projects.last_error IS 'Last recorded error or block reason.';
COMMENT ON COLUMN public.projects.build_progress IS 'Progress percentage 0-100.';
COMMENT ON COLUMN public.projects.last_check IS 'Result of the last run_checks.';