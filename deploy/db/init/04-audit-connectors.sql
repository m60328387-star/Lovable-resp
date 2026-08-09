-- سجل تدقيق موحّد لكل تنفيذ أداة أو نداء رابط خارجي + إعدادات الروابط + منع تكرار التنبيهات.

CREATE TABLE IF NOT EXISTS public.tool_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID,
  kind TEXT NOT NULL DEFAULT 'tool',          -- tool | connector | http | test | alert
  name TEXT NOT NULL,                          -- اسم الأداة أو معرّف الرابط
  target TEXT,                                 -- المسار/العنوان المستهدف
  ok BOOLEAN NOT NULL DEFAULT true,
  status INTEGER,                              -- كود HTTP إن وُجد
  duration_ms INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 1,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_audit_time_idx ON public.tool_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS tool_audit_name_idx ON public.tool_audit(name, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_audit_ok_idx ON public.tool_audit(ok, created_at DESC);

CREATE TABLE IF NOT EXISTS public.connector_settings (
  user_id UUID NOT NULL,
  connector_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, connector_id)
);

CREATE TABLE IF NOT EXISTS public.alert_state (
  key TEXT PRIMARY KEY,
  digest TEXT NOT NULL DEFAULT '',
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 0
);
