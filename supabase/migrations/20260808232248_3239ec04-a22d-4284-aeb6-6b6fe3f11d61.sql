CREATE OR REPLACE FUNCTION public.weaver_exec_sql(p_schema text, p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema text;
BEGIN
  IF p_schema !~ '^wv_[a-z0-9_]{4,60}$' THEN
    RAISE EXCEPTION 'invalid schema name: %', p_schema;
  END IF;
  v_schema := p_schema;
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', v_schema);
  EXECUTE format('SET LOCAL search_path = %I, public', v_schema);
  EXECUTE p_sql;
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO service_role', v_schema);
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO service_role', v_schema);
  RETURN jsonb_build_object('ok', true, 'schema', v_schema);
END;
$$;

REVOKE ALL ON FUNCTION public.weaver_exec_sql(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weaver_exec_sql(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.weaver_schema_info(p_schema text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_schema !~ '^wv_[a-z0-9_]{4,60}$' THEN
    RAISE EXCEPTION 'invalid schema name: %', p_schema;
  END IF;
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v
  FROM (
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = p_schema
    ORDER BY table_name, ordinal_position
  ) t;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.weaver_schema_info(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weaver_schema_info(text) TO service_role;