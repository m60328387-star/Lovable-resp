CREATE TABLE public.bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'telegram',
  token TEXT NOT NULL,
  username TEXT,
  persona TEXT NOT NULL DEFAULT '',
  model TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their bots" ON public.bots FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bots_updated_at BEFORE UPDATE ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bot_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  update_id BIGINT,
  chat_id BIGINT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  text TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bot_id, update_id)
);

CREATE INDEX idx_bot_messages_chat ON public.bot_messages (bot_id, chat_id, created_at DESC);

GRANT SELECT, DELETE ON public.bot_messages TO authenticated;
GRANT ALL ON public.bot_messages TO service_role;
ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their bot messages" ON public.bot_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_messages.bot_id AND b.user_id = auth.uid()));
CREATE POLICY "Owners delete their bot messages" ON public.bot_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bots b WHERE b.id = bot_messages.bot_id AND b.user_id = auth.uid()));