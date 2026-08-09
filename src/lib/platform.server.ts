import { getSql } from "@/lib/db";

/**
 * طبقة «تطوير المنصة»: تخزين التغييرات المقترحة على كود Weaver نفسه،
 * الإعدادات بلا كود، إصدارات تعليمات الوكيل، وسجل النشر والتراجع.
 */

let ensured = false;

export async function ensurePlatformTables(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.platform_changes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      files JSONB NOT NULL DEFAULT '[]'::jsonb,
      commits JSONB NOT NULL DEFAULT '[]'::jsonb,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS platform_changes_status_idx
      ON public.platform_changes (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS public.platform_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.prompt_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.platform_deploys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      status TEXT NOT NULL DEFAULT 'running',
      kind TEXT NOT NULL DEFAULT 'deploy',
      log TEXT NOT NULL DEFAULT '',
      change_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    );
  `);
  ensured = true;
}

/** مسارات تتطلب تأكيداً مزدوجاً (تمسّ الدخول أو قاعدة البيانات أو النشر). */
export const SENSITIVE_PATHS = [
  /(^|\/)src\/lib\/(auth|weaver-auth|chat-auth|db)\b/i,
  /(^|\/)src\/routes\/auth\.tsx$/i,
  /(^|\/)src\/routes\/_authenticated\/route\.tsx$/i,
  /(^|\/)deploy\//i,
  /(^|\/)src\/lib\/self-repo\.server\.ts$/i,
  /(^|\/)src\/lib\/platform\./i,
];

export function isSensitivePath(path: string): boolean {
  const clean = path.replace(/^\/+/, "");
  return SENSITIVE_PATHS.some((re) => re.test(clean));
}

// ============ الإعدادات بلا كود ============

export type PlatformSettings = {
  primaryModel: string;
  fastModel: string;
  reasoningModel: string;
  visionModel: string;
  maxSteps: number;
  maxTokens: number;
  maxRetries: number;
  brandName: string;
  brandTagline: string;
  promptOverride: string;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  primaryModel: "anthropic/claude-sonnet-4.6",
  fastModel: "google/gemini-2.5-flash",
  reasoningModel: "anthropic/claude-sonnet-4.6",
  visionModel: "google/gemini-2.5-pro",
  maxSteps: 120,
  maxTokens: 64000,
  maxRetries: 3,
  brandName: "Weaver",
  brandTagline: "ENGINEERING AGENT",
  promptOverride: "",
};

export async function loadPlatformSettings(): Promise<PlatformSettings> {
  try {
    await ensurePlatformTables();
    const sql = getSql();
    const rows = await sql`SELECT value FROM public.platform_settings WHERE key = 'general' LIMIT 1`;
    const stored = (rows[0]?.["value"] ?? {}) as Partial<PlatformSettings>;
    return { ...DEFAULT_PLATFORM_SETTINGS, ...stored };
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
}

export async function savePlatformSettingsRow(next: PlatformSettings): Promise<PlatformSettings> {
  await ensurePlatformTables();
  const sql = getSql();
  await sql`
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES ('general', ${JSON.stringify(next)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return next;
}

/** تعليمات الوكيل الفعّالة (نسخة مفعّلة من prompt_versions أو تجاوز مباشر). */
export async function activePromptOverride(): Promise<string> {
  try {
    await ensurePlatformTables();
    const sql = getSql();
    const rows = await sql`
      SELECT content FROM public.prompt_versions WHERE active = true ORDER BY created_at DESC LIMIT 1
    `;
    const fromVersion = rows[0]?.["content"] ? String(rows[0]["content"]) : "";
    if (fromVersion.trim()) return fromVersion;
    const settings = await loadPlatformSettings();
    return settings.promptOverride ?? "";
  } catch {
    return "";
  }
}

// ============ النشر والتراجع ============

export type DeployResult = { ok: boolean; log: string; status: number };

/**
 * ينفّذ النشر على الخادم عبر خطّاف النشر (webhook) الذي يشغّل deploy/deploy.sh.
 * يُضبط برابط PLATFORM_DEPLOY_URL ورمز EXECUTOR_TOKEN على الـVPS.
 */
export async function runDeployHook(action: "deploy" | "rollback", ref?: string): Promise<DeployResult> {
  const url = process.env["PLATFORM_DEPLOY_URL"];
  const token = process.env["EXECUTOR_TOKEN"];
  if (!url) {
    return {
      ok: false,
      status: 0,
      log: "خطّاف النشر غير مضبوط. أضف PLATFORM_DEPLOY_URL (و EXECUTOR_TOKEN) في deploy/.env على الخادم، وشغّل deploy/deploy-hook.mjs.",
    };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action, ref: ref ?? null }),
    });
    const log = await res.text();
    return { ok: res.ok, status: res.status, log: log.slice(0, 20000) };
  } catch (error) {
    return { ok: false, status: 0, log: error instanceof Error ? error.message : String(error) };
  }
}

export async function recordDeploy(
  userId: string,
  kind: "deploy" | "rollback",
  result: DeployResult,
  changeId?: string | null,
): Promise<void> {
  await ensurePlatformTables();
  const sql = getSql();
  await sql`
    INSERT INTO public.platform_deploys (user_id, status, kind, log, change_id, finished_at)
    VALUES (${userId}, ${result.ok ? "success" : "failed"}, ${kind}, ${result.log}, ${changeId ?? null}, now())
  `;
}
