CREATE TABLE IF NOT EXISTS public.message_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','completed','failed','maintenance')),
  message_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_sync_events_project_created_idx ON public.message_sync_events(project_id,created_at DESC);

DELETE FROM public.messages older USING public.messages newer
WHERE older.project_id=newer.project_id AND NULLIF(older.parts->>'id','') IS NOT NULL
  AND older.parts->>'id'=newer.parts->>'id' AND (older.created_at,older.id)<(newer.created_at,newer.id);
CREATE UNIQUE INDEX IF NOT EXISTS messages_project_message_id_unique
  ON public.messages(project_id,(parts->>'id')) WHERE NULLIF(parts->>'id','') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_conversation_atomic(p_project_id uuid,p_user_id uuid,p_messages jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item jsonb; idx integer; incoming_count integer; existing_count integer;
BEGIN
  IF jsonb_typeof(p_messages)<>'array' THEN RAISE EXCEPTION 'messages_payload_must_be_array'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=p_user_id FOR UPDATE) THEN RAISE EXCEPTION 'project_not_found_or_forbidden'; END IF;
  SELECT count(*) INTO incoming_count FROM jsonb_array_elements(p_messages);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_messages) value WHERE NULLIF(value->>'id','') IS NOT NULL GROUP BY value->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_message_id_in_payload'; END IF;
  SELECT count(DISTINCT position) INTO existing_count FROM public.messages WHERE project_id=p_project_id;
  IF existing_count>incoming_count THEN RETURN jsonb_build_object('ok',true,'skipped',true,'reason','newer_history_exists'); END IF;
  FOR item,idx IN SELECT value,(ordinality-1)::integer FROM jsonb_array_elements(p_messages) WITH ORDINALITY LOOP
    INSERT INTO public.messages(project_id,user_id,role,parts,position) VALUES(p_project_id,p_user_id,COALESCE(item->>'role','assistant'),item,idx)
    ON CONFLICT(project_id,position) DO UPDATE SET user_id=EXCLUDED.user_id,role=EXCLUDED.role,parts=EXCLUDED.parts;
  END LOOP;
  DELETE FROM public.messages WHERE project_id=p_project_id AND position>=incoming_count;
  UPDATE public.projects SET updated_at=now() WHERE id=p_project_id AND user_id=p_user_id;
  RETURN jsonb_build_object('ok',true,'count',incoming_count,'duplicates',0);
END; $$;

CREATE OR REPLACE FUNCTION public.append_message_atomic(p_project_id uuid,p_user_id uuid,p_message jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE next_position integer; message_id text:=NULLIF(p_message->>'id','');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text,0));
  IF message_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.messages WHERE project_id=p_project_id AND parts->>'id'=message_id) THEN RETURN jsonb_build_object('ok',true,'skipped',true); END IF;
  SELECT COALESCE(MAX(position),-1)+1 INTO next_position FROM public.messages WHERE project_id=p_project_id;
  INSERT INTO public.messages(project_id,user_id,role,parts,position) VALUES(p_project_id,p_user_id,COALESCE(p_message->>'role','assistant'),p_message,next_position);
  RETURN jsonb_build_object('ok',true,'position',next_position);
END; $$;