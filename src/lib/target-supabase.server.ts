import { getSql } from "@/lib/db";

/**
 * Weaver project databases — local Postgres mode.
 *
 * Each built project gets an isolated schema (`wv_<project id>`) inside the
 * same local Postgres instance. Server-only.
 */

export type TargetConfig = {
  url: string;
  serviceKey: string;
};

/** الإعدادات المحلية دائماً متاحة عندما يكون DATABASE_URL مضبوطاً. */
export function getTargetConfig(): TargetConfig | null {
  const url = process.env["DATABASE_URL"] ?? process.env["WEAVER_DB_URL"];
  if (!url) return null;
  return { url: "local", serviceKey: "local" };
}

/** اسم المخطط المخصص لمشروع معيّن. */
export function projectSchema(projectId: string): string {
  const clean = projectId.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length < 4) throw new Error("معرّف مشروع غير صالح");
  return `wv_${clean}`;
}

function qid(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`معرّف غير صالح: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function litParam(value: unknown, params: unknown[]): string {
  params.push(value);
  return `$${params.length}`;
}

async function localRpc(fn: string, args: Record<string, unknown>) {
  const sql = getSql();
  const keys = Object.keys(args);
  const queryParams: unknown[] = [];
  const argList = keys.map((k) => `${qid(k)} => ${litParam(args[k], queryParams)}`).join(", ");
  const query = `SELECT public.${qid(fn)}(${argList}) as result`;
  const rows = (await sql.unsafe(query, queryParams as any)) as { result: any }[];
  return rows[0]?.result ?? null;
}

/** ينفّذ SQL (DDL/DML) داخل مخطط المشروع. */
export async function targetRunSql(_cfg: TargetConfig, schema: string, sql: string) {
  return localRpc("weaver_exec_sql", { p_schema: schema, p_sql: sql });
}

/** يقرأ صفوفاً عبر استعلام SELECT داخل مخطط المشروع. */
export async function targetSelect(
  _cfg: TargetConfig,
  schema: string,
  table: string,
  where: string,
  limit: number,
) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeTable) throw new Error("اسم جدول غير صالح");
  const n = Math.min(Math.max(Math.round(limit) || 50, 1), 200);
  const clause = where.trim() ? `where ${where}` : "";
  const sql = `select * from "${safeTable}" ${clause} limit ${n}`;
  return (await localRpc("weaver_query", { p_schema: schema, p_sql: sql })) as unknown[];
}

/** يدرج صفوفاً في جدول داخل مخطط المشروع. */
export async function targetInsert(
  _cfg: TargetConfig,
  schema: string,
  table: string,
  rows: Record<string, unknown>[],
) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeTable) throw new Error("اسم جدول غير صالح");
  if (!rows.length) return [];
  const cols = Object.keys(rows[0] ?? {}).filter((c) => /^[a-zA-Z0-9_]+$/.test(c));
  if (!cols.length) throw new Error("لا توجد أعمدة صالحة");
  const lit = (v: unknown) => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return `'${s.replace(/'/g, "''")}'`;
  };
  const values = rows
    .map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`)
    .join(", ");
  const sql = `insert into "${safeTable}" (${cols.map((c) => `"${c}"`).join(", ")}) values ${values} returning *`;
  return (await localRpc("weaver_query", { p_schema: schema, p_sql: sql })) as unknown[];
}

/** يعرض جداول وأعمدة مخطط المشروع. */
export async function targetSchema(_cfg: TargetConfig, schema: string) {
  return localRpc("weaver_schema_info", { p_schema: schema });
}
