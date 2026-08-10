import postgres from "postgres";

/**
 * Local Postgres client for the independent Weaver deployment.
 * Falls back to Lovable Cloud Supabase if DATABASE_URL is not set
 * (keeps development previews working until the migration is complete).
 */
export function getPostgresUrl(): string | undefined {
  const local = process.env["DATABASE_URL"] ?? process.env["WEAVER_DB_URL"];
  if (local) return local;
  // في الإنتاج (كونتابو) قاعدة البيانات المحلية هي المصدر الوحيد:
  // ممنوع الرجوع الصامت إلى قاعدة Lovable Cloud حتى لا تنقسم البيانات.
  if (process.env["NODE_ENV"] === "production") return undefined;
  return process.env["SUPABASE_DB_URL"];
}

let sqlInstance: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  const url = getPostgresUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured. Set it in deploy/.env on the VPS.");
  }
  if (!sqlInstance) {
    sqlInstance = postgres(url, {
      transform: {
        undefined: null,
      },
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sqlInstance;
}

export async function closeSql(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end();
    sqlInstance = null;
  }
}
