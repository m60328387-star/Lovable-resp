import type { Sql } from "postgres";

export type LocalSupabaseClient = {
  from: (table: string) => LocalChain;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

type WhereOp = { col: string; op: string; val: unknown };

/** Loose row shape: behaves like an array of rows and like a single row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyData = any[] & Record<string, any>;

type ChainResponse = { data: AnyData; count?: number; error: Error | null };

type ChainState = {
  table: string;
  method?: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  values?: Record<string, unknown>[];
  updateValues?: Record<string, unknown>;
  onConflict?: string;
  where: WhereOp[];
  order: { col: string; ascending: boolean }[];
  limit?: number;
  offset?: number;
  single?: boolean;
  maybeSingle?: boolean;
  returning?: boolean;
  returningColumns?: string;
  count?: "exact" | "estimated" | "planned";
  head?: boolean;
};

export function makeLocalSupabase(sql: Sql, userId: string): LocalSupabaseClient {
  const chain = (state: ChainState) => new LocalChain(sql, state);

  return {
    from(table: string) {
      return chain({ table, method: "select", where: [], order: [] });
    },
    async rpc(fn, args = {}) {
      try {
        const queryParams: unknown[] = [];
        const keys = Object.keys(args);
        const argList = keys
          .map((k) => `${qid(k)} => ${litParam(args[k], queryParams)}`)
          .join(", ");
        const query = `SELECT public.${qid(fn)}(${argList}) as result`;
        const rows = (await sql.unsafe(query, queryParams as never)) as { result: unknown }[];
        return { data: rows[0]?.result ?? null, error: null };
      } catch (err) {
        return { data: null as unknown as AnyData, error: err as Error };
      }
    },
  };
}

class LocalChain implements PromiseLike<ChainResponse> {
  constructor(
    private sql: Sql,
    private state: ChainState,
  ) {}

  private clone(patch: Partial<ChainState>): LocalChain {
    return new LocalChain(this.sql, { ...this.state, ...patch });
  }

  /* ================= Methods ================= */
  select(columns = "*", options?: { count?: "exact" | "estimated" | "planned"; head?: boolean }) {
    if (this.state.method && this.state.method !== "select") {
      return this.clone({ returning: true, returningColumns: columns });
    }
    const patch: Partial<ChainState> = { method: "select", columns };
    if (options?.count) {
      patch.count = options.count;
      patch.head = options.head ?? true;
    }
    return this.clone(patch);
  }
  insert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ) {
    const arr = Array.isArray(rows) ? rows : [rows];
    const patch: Partial<ChainState> = { method: "insert", values: arr };
    if (options?.onConflict) patch.onConflict = options.onConflict;
    return this.clone(patch);
  }
  update(values: Record<string, unknown>) {
    return this.clone({ method: "update", updateValues: values });
  }
  delete() {
    return this.clone({ method: "delete" });
  }
  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict: string },
  ) {
    return this.clone({
      method: "upsert",
      values: Array.isArray(rows) ? rows : [rows],
      onConflict: options.onConflict,
    });
  }

  /* ================= Filters ================= */
  eq(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: "=", val }] });
  }
  neq(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: "!=", val }] });
  }
  gt(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: ">", val }] });
  }
  gte(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: ">=", val }] });
  }
  lt(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: "<", val }] });
  }
  lte(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: "<=", val }] });
  }
  is(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: "is", val }] });
  }
  in(col: string, vals: unknown[]) {
    return this.clone({ where: [...this.state.where, { col, op: "in", val: vals }] });
  }
  match(filters: Record<string, unknown>) {
    const extra = Object.entries(filters).map(([col, val]) => ({ col, op: "=", val }));
    return this.clone({ where: [...this.state.where, ...extra] });
  }
  like(col: string, pattern: string) {
    return this.clone({ where: [...this.state.where, { col, op: "like", val: pattern }] });
  }
  ilike(col: string, pattern: string) {
    return this.clone({ where: [...this.state.where, { col, op: "ilike", val: pattern }] });
  }
  textSearch(col: string, query: string) {
    return this.clone({ where: [...this.state.where, { col, op: "text_search", val: query }] });
  }
  contains(col: string, val: unknown) {
    return this.clone({ where: [...this.state.where, { col, op: "contains", val }] });
  }

  /* ================= Modifiers ================= */
  order(col: string, { ascending = true }: { ascending?: boolean }) {
    return this.clone({ order: [...this.state.order, { col, ascending }] });
  }
  limit(n: number) {
    return this.clone({ limit: n });
  }
  range(from: number, to: number) {
    return this.clone({ offset: from, limit: to - from + 1 });
  }
  single() {
    return this.clone({ single: true, limit: 1 });
  }
  maybeSingle() {
    return this.clone({ maybeSingle: true, limit: 1 });
  }
  count(mode: "exact" | "estimated" | "planned") {
    return this.clone({ count: mode, head: true });
  }

  /* ================= Promise-like ================= */
  then<TResult1 = ChainResponse, TResult2 = never>(
    onFulfilled?: ((value: ChainResponse) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onRejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onFulfilled, onRejected);
  }
  catch(onRejected?: (reason: Error) => unknown) {
    return this.execute().catch(onRejected);
  }
  finally(onFinally?: () => void) {
    return this.execute().finally(onFinally);
  }

  private async execute(): Promise<ChainResponse> {
    try {
      const data = (await this.run()) as AnyData;
      return { data, error: null };
    } catch (err) {
      return { data: null as unknown as AnyData, error: err as Error };
    }
  }

  private async run() {
    const s = this.state;
    const table = qid(s.table);
    const params: unknown[] = [];
    const where = buildWhere(s.where, params);
    const order = buildOrder(s.order);
    const limit = s.limit ? `LIMIT ${Math.max(1, Math.round(s.limit))}` : "";
    const offset = s.offset ? `OFFSET ${Math.max(0, Math.round(s.offset))}` : "";

    if (s.count === "exact" && s.head) {
      const query = `SELECT COUNT(*)::int as count FROM ${table} ${where}`;
      const rows = (await this.sql.unsafe(query, params as never)) as { count: number }[];
      return rows[0]?.count ?? 0;
    }

    if (s.method === "select") {
      const cols = s.columns === "*" || !s.columns ? "*" : parseColumns(s.columns);
      const query = `SELECT ${cols} FROM ${table} ${where} ${order} ${limit} ${offset}`.trim();
      const rows = await this.sql.unsafe(query, params as never);
      if (s.single) return rows[0] ?? null;
      if (s.maybeSingle) return rows[0] ?? null;
      return rows;
    }

    if (s.method === "insert" && s.values) {
      return await insertInto(
        this.sql,
        s.table,
        s.values,
        s.onConflict,
        s.returning,
        s.returningColumns,
      );
    }

    if (s.method === "update" && s.updateValues) {
      return await updateTable(
        this.sql,
        s.table,
        s.updateValues,
        s.where,
        s.returning,
        s.returningColumns,
      );
    }

    if (s.method === "delete") {
      const whereClause = buildWhere(s.where, params);
      const query = `DELETE FROM ${table} ${whereClause} RETURNING *`;
      return await this.sql.unsafe(query, params as never);
    }

    if (s.method === "upsert" && s.values && s.onConflict) {
      return await upsertInto(
        this.sql,
        s.table,
        s.values,
        s.onConflict,
        s.returning,
        s.returningColumns,
      );
    }

    return null;
  }
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

function parseColumns(raw: string): string {
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (m) return `${qid(m[1]!)} AS ${qid(m[2]!)}`;
      return qid(p);
    })
    .join(", ");
}

function buildWhere(ops: WhereOp[], params: unknown[]): string {
  if (ops.length === 0) return "";
  const clauses = ops.map((op) => {
    const col = qid(op.col);
    switch (op.op) {
      case "=":
        return `${col} = ${litParam(op.val, params)}`;
      case "!=":
        return `${col} != ${litParam(op.val, params)}`;
      case ">":
        return `${col} > ${litParam(op.val, params)}`;
      case ">=":
        return `${col} >= ${litParam(op.val, params)}`;
      case "<":
        return `${col} < ${litParam(op.val, params)}`;
      case "<=":
        return `${col} <= ${litParam(op.val, params)}`;
      case "is":
        return op.val === null ? `${col} IS NULL` : `${col} IS ${litParam(op.val, params)}`;
      case "in":
        return `${col} = ANY(${litParam(op.val, params)})`;
      case "like":
        return `${col} LIKE ${litParam(op.val, params)}`;
      case "ilike":
        return `${col} ILIKE ${litParam(op.val, params)}`;
      case "text_search":
        return `to_tsvector('arabic', ${col}) @@ plainto_tsquery('arabic', ${litParam(op.val, params)})`;
      case "contains":
        return `${col} @> ${litParam(op.val, params)}`;
      default:
        return `${col} = ${litParam(op.val, params)}`;
    }
  });
  return `WHERE ${clauses.join(" AND ")}`;
}

function buildOrder(order: { col: string; ascending: boolean }[]): string {
  if (order.length === 0) return "";
  return "ORDER BY " + order.map((o) => `${qid(o.col)} ${o.ascending ? "ASC" : "DESC"}`).join(", ");
}

function returningClause(returning: boolean, columns?: string): string {
  if (!returning) return "";
  return `RETURNING ${columns ? parseColumns(columns) : "*"}`;
}

async function insertInto(
  sql: Sql,
  table: string,
  rows: Record<string, unknown>[],
  onConflict?: string,
  returning?: boolean,
  returningColumns?: string,
) {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]!).filter((k) => /^[a-zA-Z0-9_]+$/.test(k));
  const params: unknown[] = [];
  const values = rows
    .map((row) => `(${cols.map((c) => litParam(row[c], params)).join(", ")})`)
    .join(", ");
  const colsFrag = cols.map(qid).join(", ");
  let query = `INSERT INTO ${qid(table)} (${colsFrag}) VALUES ${values}`;
  if (onConflict) {
    const conflictCols = onConflict
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const setCols = cols.filter((c) => !conflictCols.includes(c));
    if (setCols.length > 0) {
      const setFrag = setCols.map((c) => `${qid(c)} = EXCLUDED.${qid(c)}`).join(", ");
      query += ` ON CONFLICT (${conflictCols.map(qid).join(", ")}) DO UPDATE SET ${setFrag}`;
    } else {
      query += ` ON CONFLICT (${conflictCols.map(qid).join(", ")}) DO NOTHING`;
    }
  }
  query += ` ${returningClause(returning ?? true, returningColumns)}`;
  return await sql.unsafe(query, params as never);
}

async function updateTable(
  sql: Sql,
  table: string,
  values: Record<string, unknown>,
  whereOps: WhereOp[],
  returning?: boolean,
  returningColumns?: string,
) {
  const cols = Object.keys(values).filter((k) => /^[a-zA-Z0-9_]+$/.test(k));
  if (cols.length === 0) return [];
  const params: unknown[] = [];
  const setFrag = cols.map((c) => `${qid(c)} = ${litParam(values[c], params)}`).join(", ");
  const where = buildWhere(whereOps, params);
  const query = `UPDATE ${qid(table)} SET ${setFrag} ${where} ${returningClause(returning ?? true, returningColumns)}`;
  return await sql.unsafe(query, params as never);
}

async function upsertInto(
  sql: Sql,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  returning?: boolean,
  returningColumns?: string,
) {
  return insertInto(sql, table, rows, onConflict, returning, returningColumns);
}
