/**
 * سجل التدقيق (Audit Log): كل تنفيذ أداة أو نداء رابط خارجي يُسجَّل هنا.
 * الكتابة "أفضل جهد" ولا تُفشل التنفيذ أبداً، والقراءة تدعم البحث بالوقت والنتيجة.
 */

export type AuditEntry = {
  userId?: string | null;
  projectId?: string | null;
  kind: "tool" | "connector" | "http" | "test" | "alert";
  name: string;
  target?: string | null;
  ok: boolean;
  status?: number | null;
  durationMs: number;
  attempt?: number;
  detail?: string | null;
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** يكتب سطر تدقيق واحد. لا يرمي استثناءً مهما حدث. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    await sql`
      INSERT INTO public.tool_audit
        (user_id, project_id, kind, name, target, ok, status, duration_ms, attempt, detail)
      VALUES (
        ${isUuid(entry.userId) ? entry.userId : null},
        ${isUuid(entry.projectId) ? entry.projectId : null},
        ${entry.kind},
        ${entry.name.slice(0, 120)},
        ${entry.target ? entry.target.slice(0, 400) : null},
        ${entry.ok},
        ${entry.status ?? null},
        ${Math.max(0, Math.round(entry.durationMs))},
        ${entry.attempt ?? 1},
        ${entry.detail ? entry.detail.slice(0, 2000) : null}
      )
    `;
  } catch {
    /* التدقيق لا يجب أن يُعطّل التنفيذ */
  }
}

export type AuditQuery = {
  search?: string;
  result?: "all" | "ok" | "fail";
  kind?: string;
  from?: string | null;
  to?: string | null;
  limit?: number;
};

export type AuditRow = {
  id: string;
  kind: string;
  name: string;
  target: string | null;
  ok: boolean;
  status: number | null;
  duration_ms: number;
  attempt: number;
  detail: string | null;
  created_at: string;
};

/** قراءة السجل مع بحث نصّي وفلترة بالوقت والنتيجة. */
export async function queryAudit(input: AuditQuery = {}): Promise<AuditRow[]> {
  const { getSql } = await import("@/lib/db");
  const sql = getSql();
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
  const search = (input.search ?? "").trim();
  const like = search ? `%${search}%` : null;
  const result = input.result ?? "all";
  const kind = input.kind && input.kind !== "all" ? input.kind : null;
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;

  const rows = await sql`
    SELECT id::text, kind, name, target, ok, status, duration_ms, attempt, detail, created_at
    FROM public.tool_audit
    WHERE (${like}::text IS NULL OR name ILIKE ${like} OR target ILIKE ${like} OR detail ILIKE ${like})
      AND (${kind}::text IS NULL OR kind = ${kind})
      AND (${result === "all"} OR ok = ${result === "ok"})
      AND (${from}::timestamptz IS NULL OR created_at >= ${from})
      AND (${to}::timestamptz IS NULL OR created_at <= ${to})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return (rows as unknown as AuditRow[]).map((row) => ({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
  }));
}

/** ملخّص سريع: عدد النجاح/الفشل ومتوسط الزمن خلال آخر 24 ساعة. */
export async function auditSummary() {
  const { getSql } = await import("@/lib/db");
  const sql = getSql();
  const rows = await sql`
    SELECT kind,
           count(*)::int AS total,
           count(*) FILTER (WHERE NOT ok)::int AS failed,
           COALESCE(round(avg(duration_ms))::int, 0) AS avg_ms
    FROM public.tool_audit
    WHERE created_at > now() - interval '24 hours'
    GROUP BY kind
    ORDER BY total DESC
  `;
  return rows as unknown as { kind: string; total: number; failed: number; avg_ms: number }[];
}
