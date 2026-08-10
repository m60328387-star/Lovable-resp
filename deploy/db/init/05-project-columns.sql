-- ترقية جدول المشاريع: أعمدة حالة البناء (idempotent)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_state JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deployed_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_check JSONB;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
