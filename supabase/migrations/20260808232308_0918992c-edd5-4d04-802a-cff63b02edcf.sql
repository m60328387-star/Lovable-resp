CREATE OR REPLACE FUNCTION public.weaver_query(p_schema text, p_sql text)
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
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema);
  EXECUTE format('SET LOCAL search_path = %I, public', p_schema);
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) t', p_sql) INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.weaver_query(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weaver_query(text, text) TO service_role;