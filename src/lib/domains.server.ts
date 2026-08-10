import { getSql } from "@/lib/db";
import { deployHookEndpoint } from "./deploy-hook.server";

/**
 * ربط دومين مخصّص بموقع منشور من Weaver.
 * DNS: A record للجذر و www → عنوان السيرفر، ثم nginx + Let's Encrypt على الـVPS.
 * Server-only.
 */

export const SERVER_IP = process.env["WEAVER_SERVER_IP"] ?? "194.163.155.52";

let ensured = false;

export async function ensureDomainColumns(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql.unsafe(`
    ALTER TABLE public.projects
      ADD COLUMN IF NOT EXISTS custom_domain TEXT,
      ADD COLUMN IF NOT EXISTS domain_status TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS domain_error TEXT,
      ADD COLUMN IF NOT EXISTS domain_updated_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS projects_custom_domain_key
      ON public.projects (custom_domain) WHERE custom_domain IS NOT NULL;
  `);
  ensured = true;
}

export type DomainStatus = "none" | "pending_dns" | "configuring" | "live" | "failed";

export type DomainState = {
  domain: string | null;
  status: DomainStatus;
  error: string | null;
  slug: string | null;
  published: boolean;
  serverIp: string;
  dns: DnsCheck | null;
  url: string | null;
};

export type DnsCheck = {
  ok: boolean;
  root: string[];
  www: string[];
  detail: string;
};

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** يحوّل أي مدخل (رابط كامل، www، مسافات) إلى دومين جذر صالح. */
export function normalizeDomain(input: string): string {
  const clean = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (!DOMAIN_RE.test(clean) || clean.length > 190) {
    throw new Error(`دومين غير صالح: ${input}`);
  }
  return clean;
}

async function resolveA(name: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=A`,
      {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { Answer?: Array<{ type?: number; data?: string }> };
    return (body.Answer ?? [])
      .filter((a) => a.type === 1 && typeof a.data === "string")
      .map((a) => String(a.data));
  } catch {
    return [];
  }
}

/** يتحقّق أن سجلات DNS تشير فعلاً إلى سيرفر Weaver. */
export async function checkDomainDns(domain: string): Promise<DnsCheck> {
  const [root, www] = await Promise.all([resolveA(domain), resolveA(`www.${domain}`)]);
  const rootOk = root.includes(SERVER_IP);
  const wwwOk = www.length === 0 || www.includes(SERVER_IP);
  const ok = rootOk && wwwOk;
  const detail = ok
    ? `سجلات DNS صحيحة وتشير إلى ${SERVER_IP}`
    : !rootOk
      ? `سجل A للجذر (@) لا يشير إلى ${SERVER_IP}${root.length ? ` — الحالي: ${root.join(", ")}` : " — لا يوجد سجل A"}`
      : `سجل A لـ www لا يشير إلى ${SERVER_IP} — الحالي: ${www.join(", ")}`;
  return { ok, root, www, detail };
}

/** تعليمات DNS المعروضة للمستخدم/العميل. */
export function dnsInstructions(domain: string): string {
  return [
    `أضف هذه السجلات عند مزوّد الدومين (${domain}):`,
    `A    @      ${SERVER_IP}`,
    `A    www    ${SERVER_IP}`,
    "TTL: تلقائي. قد يستغرق الانتشار من دقائق إلى 24 ساعة.",
  ].join("\n");
}

/** يطلب من الـVPS تهيئة nginx وإصدار شهادة SSL للدومين. */
export async function requestDomainSetup(
  domain: string,
  slug: string,
  email: string,
): Promise<{ ok: boolean; jobId: string; log: string }> {
  const token = process.env["EXECUTOR_TOKEN"];
  if (!token) {
    return {
      ok: false,
      jobId: "",
      log: "رمز الخطّاف غير مضبوط (EXECUTOR_TOKEN) — لا يمكن تهيئة الدومين تلقائياً.",
    };
  }
  const endpoint = deployHookEndpoint("/domain");
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ domain, slug, email }),
    });
    const text = await res.text();
    let jobId = "";
    try {
      jobId = String((JSON.parse(text) as { jobId?: unknown }).jobId ?? "");
    } catch {
      /* رد غير JSON من نسخة خطّاف قديمة */
    }
    return { ok: res.ok, jobId, log: text.slice(0, 5000) };
  } catch (error) {
    return { ok: false, jobId: "", log: error instanceof Error ? error.message : String(error) };
  }
}

/** حالة مهمة تهيئة الدومين على الـVPS. */
export async function domainJobStatus(
  jobId: string,
): Promise<{ status: "running" | "success" | "failed" | "unknown"; log: string }> {
  const token = process.env["EXECUTOR_TOKEN"];
  if (!jobId) return { status: "unknown", log: "" };
  try {
    const res = await fetch(`${deployHookEndpoint("/status/")}${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(8000),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { status: "unknown", log: "" };
    const body = (await res.json()) as { status?: unknown; log?: unknown };
    const status =
      body.status === "success" ? "success" : body.status === "failed" ? "failed" : "running";
    return { status, log: typeof body.log === "string" ? body.log.slice(-8000) : "" };
  } catch {
    return { status: "unknown", log: "" };
  }
}

export async function readDomainState(projectId: string): Promise<DomainState> {
  await ensureDomainColumns();
  const sql = getSql();
  const [row] = await sql`
    SELECT slug, published, custom_domain, domain_status, domain_error
    FROM public.projects WHERE id = ${projectId}
  `;
  if (!row) throw new Error("المشروع غير موجود");
  const domain = (row["custom_domain"] as string | null) ?? null;
  const status = ((row["domain_status"] as string | null) ?? "none") as DomainStatus;
  return {
    domain,
    status,
    error: (row["domain_error"] as string | null) ?? null,
    slug: (row["slug"] as string | null) ?? null,
    published: Boolean(row["published"]),
    serverIp: SERVER_IP,
    dns: null,
    url: domain ? `${status === "live" ? "https" : "http"}://${domain}` : null,
  };
}

export async function saveDomainState(
  projectId: string,
  domain: string | null,
  status: DomainStatus,
  error: string | null,
): Promise<void> {
  await ensureDomainColumns();
  const sql = getSql();
  await sql`
    UPDATE public.projects
    SET custom_domain = ${domain},
        domain_status = ${status},
        domain_error = ${error},
        domain_updated_at = now(),
        deployed_url = COALESCE(${domain ? `https://${domain}` : null}, deployed_url)
    WHERE id = ${projectId}
  `;
}
