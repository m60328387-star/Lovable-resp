ALTER TABLE public.messages ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX messages_project_position_idx ON public.messages (project_id, position);