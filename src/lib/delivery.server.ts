import { gh, toBase64, type GhFile } from "@/lib/github.server";
import { getSql } from "@/lib/db";
import { projectSchema } from "@/lib/target-supabase.server";

/** ينشئ مستودعاً جديداً على حساب المالك للتوكن ثم يرفع ملفات المشروع إليه. */
export async function createRepoAndPush(
  token: string,
  name: string,
  isPrivate: boolean,
  files: GhFile[],
  description?: string,
): Promise<{ repo: string; url: string; branch: string; count: number }> {
  const safeName = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  if (!safeName) throw new Error("اسم المستودع غير صالح");

  const created = await gh(token, "/user/repos", {
    method: "POST",
    body: {
      name: safeName,
      private: isPrivate,
      auto_init: true,
      ...(description ? { description: description.slice(0, 300) } : {}),
    },
  });
  if (!created.ok) {
    throw new Error(`تعذّر إنشاء المستودع [${created.status}]: ${await created.text()}`);
  }
  const info = (await created.json()) as {
    full_name: string;
    html_url: string;
    default_branch?: string;
    owner: { login: string };
    name: string;
  };
  const branch = info.default_branch || "main";
  const owner = info.owner.login;
  const repo = info.name;

  let count = 0;
  for (const file of files) {
    const encoded = file.path.split("/").map(encodeURIComponent).join("/");
    const existing = await gh(
      token,
      `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
    );
    const sha = existing.ok ? ((await existing.json()) as { sha?: string }).sha : undefined;
    const res = await gh(token, `/repos/${owner}/${repo}/contents/${encoded}`, {
      method: "PUT",
      body: {
        message: `Weaver: ${file.path}`,
        content: toBase64(file.content),
        branch,
        ...(sha ? { sha } : {}),
      },
    });
    if (!res.ok) throw new Error(`فشل رفع ${file.path} [${res.status}]: ${await res.text()}`);
    count += 1;
  }

  return { repo: info.full_name, url: info.html_url, branch, count };
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function qid(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** يولّد ملف SQL كامل (بنية + بيانات) لمخطط قاعدة بيانات المشروع. */
export async function dumpProjectDatabase(
  projectId: string,
): Promise<{ schema: string; sql: string; tables: number; rows: number }> {
  const schema = projectSchema(projectId);
  const sql = getSql();

  const columns = (await sql`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = ${schema}
    order by table_name, ordinal_position
  `) as unknown as {
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }[];

  if (columns.length === 0) {
    return {
      schema,
      sql: `-- لا توجد جداول في مخطط ${schema} بعد.\n`,
      tables: 0,
      rows: 0,
    };
  }

  const byTable = new Map<string, typeof columns>();
  for (const col of columns) {
    const list = byTable.get(col.table_name) ?? [];
    list.push(col);
    byTable.set(col.table_name, list as typeof columns);
  }

  const parts: string[] = [
    `-- Weaver database export`,
    `-- schema: ${schema}`,
    `-- generated: ${new Date().toISOString()}`,
    ``,
    `CREATE SCHEMA IF NOT EXISTS ${qid(schema)};`,
    `SET search_path = ${qid(schema)};`,
    ``,
  ];

  let rowTotal = 0;
  for (const [table, cols] of byTable) {
    const defs = cols.map((c) => {
      const nullable = c.is_nullable === "NO" ? " NOT NULL" : "";
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
      return `  ${qid(c.column_name)} ${c.data_type}${def}${nullable}`;
    });
    parts.push(`CREATE TABLE IF NOT EXISTS ${qid(table)} (\n${defs.join(",\n")}\n);`, ``);

    const rows = (await sql.unsafe(
      `select * from ${qid(schema)}.${qid(table)} limit 5000`,
    )) as unknown as Record<string, unknown>[];
    rowTotal += rows.length;
    if (rows.length) {
      const names = cols.map((c) => c.column_name);
      const columnList = names.map(qid).join(", ");
      for (const row of rows) {
        const values = names.map((n) => sqlLiteral(row[n])).join(", ");
        parts.push(`INSERT INTO ${qid(table)} (${columnList}) VALUES (${values});`);
      }
      parts.push(``);
    }
  }

  return { schema, sql: parts.join("\n"), tables: byTable.size, rows: rowTotal };
}
