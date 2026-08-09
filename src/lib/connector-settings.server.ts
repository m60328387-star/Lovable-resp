/**
 * إعدادات الروابط الخارجية لكل مستخدم: تفعيل/تعطيل، أولوية، وحفظ تجارب الاختبار.
 */

export type ConnectorSetting = {
  connector_id: string;
  enabled: boolean;
  priority: number;
  tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_ms: number | null;
};

export async function readConnectorSettings(userId: string): Promise<Record<string, ConnectorSetting>> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    const rows = await sql`
      SELECT connector_id, enabled, priority, tested_at, last_test_ok, last_test_ms
      FROM public.connector_settings WHERE user_id = ${userId}
    `;
    const out: Record<string, ConnectorSetting> = {};
    for (const row of rows as unknown as ConnectorSetting[]) {
      out[row.connector_id] = {
        ...row,
        tested_at: row.tested_at ? new Date(row.tested_at).toISOString() : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeConnectorSetting(
  userId: string,
  connectorId: string,
  patch: { enabled?: boolean; priority?: number },
): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = getSql();
  await sql`
    INSERT INTO public.connector_settings (user_id, connector_id, enabled, priority, updated_at)
    VALUES (${userId}, ${connectorId}, ${patch.enabled ?? false}, ${patch.priority ?? 100}, now())
    ON CONFLICT (user_id, connector_id) DO UPDATE SET
      enabled = COALESCE(${patch.enabled ?? null}::boolean, public.connector_settings.enabled),
      priority = COALESCE(${patch.priority ?? null}::integer, public.connector_settings.priority),
      updated_at = now()
  `;
}

export async function recordConnectorTest(
  userId: string,
  connectorId: string,
  ok: boolean,
  durationMs: number,
): Promise<void> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    await sql`
      INSERT INTO public.connector_settings (user_id, connector_id, tested_at, last_test_ok, last_test_ms, updated_at)
      VALUES (${userId}, ${connectorId}, now(), ${ok}, ${Math.round(durationMs)}, now())
      ON CONFLICT (user_id, connector_id) DO UPDATE SET
        tested_at = now(), last_test_ok = ${ok}, last_test_ms = ${Math.round(durationMs)}, updated_at = now()
    `;
  } catch {
    /* تجاهل */
  }
}

/** الروابط المسموح للوكيل باستعمالها (المفعّلة فقط) مرتّبة بالأولوية. */
export async function enabledConnectorIds(userId: string | null): Promise<string[] | null> {
  if (!userId) return null;
  const settings = await readConnectorSettings(userId);
  const entries = Object.values(settings).filter((s) => s.enabled);
  if (entries.length === 0) return null; // لا إعدادات محفوظة: لا نقيّد الوكيل
  return entries.sort((a, b) => a.priority - b.priority).map((s) => s.connector_id);
}
