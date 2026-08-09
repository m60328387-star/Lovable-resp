/**
 * تنفيذ نداءات الروابط (Connectors) ونداءات HTTP العامة بأمان.
 * المفاتيح تُقرأ من مفاتيح المشروع ولا تُعاد أبداً في المخرجات.
 */
import { CONNECTORS, findConnector, type Connector } from "@/lib/connectors";

const MAX_BODY_CHARS = 20000;

function redact(text: string, secrets: string[]) {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join("••••");
  }
  return out;
}

/** يمنع الوصول إلى الشبكة الداخلية (SSRF). */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("رابط غير صالح");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("البروتوكول غير مسموح");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]";
  if (blocked) throw new Error("العناوين الداخلية ممنوعة");
  return url;
}

async function readSecret(projectId: string, name: string): Promise<string | null> {
  const { getSql } = await import("@/lib/db");
  const sql = getSql();
  const rows = await sql`
    SELECT value FROM public.project_secrets
    WHERE project_id = ${projectId} AND name = ${name}
    LIMIT 1
  `;
  const value = (rows[0] as { value?: string } | undefined)?.value;
  return value ?? process.env[name] ?? null;
}

export type HttpCallInput = {
  url: string;
  method?: string | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
};

export async function httpCall(input: HttpCallInput, secrets: string[] = []) {
  const url = assertPublicUrl(input.url);
  const method = (input.method ?? "GET").toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: "application/json, text/*;q=0.8", ...(input.headers ?? {}) },
      ...(method === "GET" || method === "HEAD" || !input.body ? {} : { body: input.body }),
      signal: controller.signal,
      redirect: "follow",
    });
    const text = (await response.text()).slice(0, MAX_BODY_CHARS);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* نص عادي */
    }
    return {
      ok: response.ok,
      status: response.status,
      url: url.toString(),
      json: parsed,
      text: parsed ? undefined : redact(text, secrets),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, url: url.toString(), error: redact(message, secrets) };
  } finally {
    clearTimeout(timer);
  }
}

function applyAuth(
  connector: Connector,
  key: string | null,
  target: URL,
  headers: Record<string, string>,
) {
  switch (connector.auth.kind) {
    case "bearer":
      if (key) headers["authorization"] = `Bearer ${key}`;
      break;
    case "header":
      if (key) {
        headers[connector.auth.header.toLowerCase()] =
          connector.id === "unsplash" ? `Client-ID ${key}` : key;
      }
      break;
    case "query":
      if (key) target.searchParams.set(connector.auth.param, key);
      break;
    default:
      break;
  }
}

/** يسرد الروابط المتاحة مع حالة المفتاح لكل مشروع. */
export async function listConnectorStatus(projectId: string | null) {
  const names = new Set<string>();
  if (projectId) {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    const rows = await sql`
      SELECT name FROM public.project_secrets WHERE project_id = ${projectId}
    `;
    for (const row of rows as unknown as { name: string }[]) names.add(row.name);
  }
  return CONNECTORS.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    free: c.free,
    docs: c.docs,
    examples: c.examples,
    secret: c.secret,
    ready: c.secret === null || names.has(c.secret) || Boolean(process.env[c.secret]),
  }));
}

export type ConnectorCallInput = {
  projectId: string | null;
  connectorId: string;
  path: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
};

export async function callConnector(input: ConnectorCallInput) {
  const connector = findConnector(input.connectorId);
  if (!connector) {
    return { ok: false, error: `رابط غير معروف: ${input.connectorId}` };
  }

  let key: string | null = null;
  if (connector.secret) {
    key = input.projectId ? await readSecret(input.projectId, connector.secret) : (process.env[connector.secret] ?? null);
    if (!key) {
      return {
        ok: false,
        error: `المفتاح ${connector.secret} غير مضبوط. أضفه من تبويب «المفاتيح» في لوحة المشروع.`,
      };
    }
  }

  // قواعد خاصة: مسار المفتاح داخل الرابط، أو قاعدة عنوان من مفتاح آخر.
  let base = connector.baseUrl;
  if (base.includes("{key}") && key) base = base.replace("{key}", key);
  const baseVar = base.match(/^\{([A-Z_]+)\}/);
  if (baseVar?.[1]) {
    const resolved = input.projectId
      ? await readSecret(input.projectId, baseVar[1])
      : (process.env[baseVar[1]] ?? null);
    if (!resolved) return { ok: false, error: `المتغيّر ${baseVar[1]} غير مضبوط للمشروع.` };
    base = base.replace(`{${baseVar[1]}}`, resolved.replace(/\/+$/, ""));
  }

  let path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  if (connector.secret && key) path = path.split(`{${connector.secret}}`).join(key);

  const target = assertPublicUrl(`${base}${path}`);
  for (const [k, v] of Object.entries(input.query ?? {})) target.searchParams.set(k, v);

  const headers: Record<string, string> = { ...(connector.extraHeaders ?? {}) };
  applyAuth(connector, key, target, headers);

  const method = (input.method ?? "GET").toUpperCase();
  let payload: string | undefined;
  if (input.body !== undefined && method !== "GET" && method !== "HEAD") {
    payload = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    headers["content-type"] = headers["content-type"] ?? "application/json";
  }

  const result = await httpCall(
    { url: target.toString(), method, headers, ...(payload ? { body: payload } : {}) },
    key ? [key] : [],
  );
  return { connector: connector.id, ...result, url: redact(result.url, key ? [key] : []) };
}
