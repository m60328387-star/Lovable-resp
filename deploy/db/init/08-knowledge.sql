-- ذاكرة معرفية قابلة لإعادة الاستخدام عبر كل المشاريع:
-- كل ملف/إصلاح/قرار ناجح يُخزَّن هنا ليُستفاد منه في أي طلب لاحق.
CREATE TABLE IF NOT EXISTS public.knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  kind text NOT NULL DEFAULT 'file',
  title text NOT NULL,
  path text,
  language text,
  tags text[] NOT NULL DEFAULT '{}',
  summary text,
  content text NOT NULL,
  content_hash text NOT NULL,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entries_dedupe
  ON public.knowledge_entries(user_id, kind, content_hash);
CREATE INDEX IF NOT EXISTS knowledge_entries_user_recent
  ON public.knowledge_entries(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_entries_tags
  ON public.knowledge_entries USING gin(tags);
CREATE INDEX IF NOT EXISTS knowledge_entries_title_trgm
  ON public.knowledge_entries(lower(title));
