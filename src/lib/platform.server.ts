import { getSql } from "@/lib/db";
import { deployHookEndpoint, deployHookUrl } from "./deploy-hook.server";

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
    ALTER TABLE public.platform_deploys
      ADD COLUMN IF NOT EXISTS external_job_id TEXT;
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
  primaryModel: "deepseek/deepseek-chat-v3.1",
  fastModel: "google/gemini-flash-latest",
  reasoningModel: "deepseek/deepseek-chat-v3.1",
  visionModel: "google/gemini-pro-latest",

  maxSteps: 120,
  maxTokens: 16000,
  maxRetries: 3,
  brandName: "Weaver",
  brandTagline: "ENGINEERING AGENT",
  promptOverride: "",
};

export async function loadPlatformSettings(): Promise<PlatformSettings> {
  try {
    await ensurePlatformTables();
    const sql = getSql();
    const rows =
      await sql`SELECT value FROM public.platform_settings WHERE key = 'general' LIMIT 1`;
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

/** يحوّل صفحات أخطاء البوابة (nginx 502/504…) إلى رسالة مفهومة بدل إغراق المحادثة بـHTML. */
export function describeHookResponse(status: number, body: string): string {
  const text = (body ?? "").trim();
  const looksHtml = /^<(?:!doctype|html)/i.test(text) || /<\/html>/i.test(text);
  if (looksHtml || status === 502 || status === 503 || status === 504) {
    const reason =
      status === 504
        ? "انتهت مهلة البوابة أثناء انتظار خطّاف النشر"
        : status === 503
          ? "خطّاف النشر غير متاح مؤقتاً (الخدمة متوقفة أو قيد إعادة التشغيل)"
          : "لم تستطع البوابة (nginx) الوصول إلى خطّاف النشر";
    return [
      `فشل الاتصال بخطّاف النشر على الخادم (HTTP ${status}): ${reason}.`,
      "تحقّق على كونتابو: systemctl status weaver-deploy-hook ثم systemctl restart weaver-deploy-hook",
      "وتأكد أن nginx يمرّر المسار إلى 127.0.0.1:8790.",
    ].join("\n");
  }
  return text.slice(0, 20000);
}

export type DeployResult = {
  ok: boolean;
  log: string;
  status: number;
  pending?: boolean;
  jobId?: string;
};

/**
 * ينفّذ النشر على الخادم عبر خطّاف النشر (webhook) الذي يشغّل deploy/deploy.sh.
 * يُضبط برابط PLATFORM_DEPLOY_URL ورمز EXECUTOR_TOKEN على الـVPS.
 */
export async function runDeployHook(
  action: "deploy" | "rollback",
  ref?: string,
): Promise<DeployResult> {
  const url = deployHookUrl();
  const token = process.env["EXECUTOR_TOKEN"];
  if (!token) {
    return {
      ok: false,
      status: 0,
      log: "رمز الخطّاف غير مضبوط. أضف EXECUTOR_TOKEN (نفس الرمز الموجود في deploy/.env على الخادم) ثم أعد المحاولة.",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action, ref: ref ?? null }),
    });
    const response = await res.text();
    if (res.status === 202) {
      let jobId = "";
      try {
        const payload = JSON.parse(response) as { jobId?: unknown };
        jobId = typeof payload.jobId === "string" ? payload.jobId : "";
      } catch {
        // Keep the raw response below when an older hook returns non-JSON.
      }
      return {
        ok: true,
        status: res.status,
        pending: true,
        jobId,
        log: `تم قبول مهمة ${action === "rollback" ? "التراجع" : "النشر"} وستستمر في الخلفية${jobId ? ` (المهمة: ${jobId})` : ""}. سيُعاد تشغيل Weaver تلقائياً عند اكتمالها.`,
      };
    }
    if (res.status === 409) {
      let stuckJob = "";
      try {
        stuckJob = String((JSON.parse(response) as { jobId?: unknown }).jobId ?? "");
      } catch {
        /* رد غير JSON */
      }
      return {
        ok: false,
        status: 409,
        jobId: stuckJob,
        log: `هناك مهمة نشر عالقة على الخادم${stuckJob ? ` (${stuckJob})` : ""}. حرّرها عبر: curl -X POST -H "Authorization: Bearer $EXECUTOR_TOKEN" http://127.0.0.1:8790/cancel — أو أعد تشغيل الخدمة: systemctl restart weaver-deploy-hook`,
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        log: "رفض الخطّاف المصادقة: EXECUTOR_TOKEN في التطبيق لا يطابق الموجود في deploy/.env على الخادم.",
      };
    }
    return { ok: res.ok, status: res.status, log: describeHookResponse(res.status, response) };
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
  const status = result.pending ? "running" : result.ok ? "success" : "failed";
  const finishedAt = result.pending ? null : new Date();
  await sql`
    INSERT INTO public.platform_deploys
      (user_id, status, kind, log, change_id, finished_at, external_job_id)
    VALUES
      (${userId}, ${status}, ${kind}, ${result.log}, ${changeId ?? null}, ${finishedAt}, ${result.jobId ?? null})
  `;
}

/** يطابق المهام المقبولة مع نتيجتها الحقيقية بعد عودة التطبيق من إعادة التشغيل. */
export async function syncPendingDeploys(): Promise<void> {
  await ensurePlatformTables();
  const deployUrl = deployHookUrl();
  const token = process.env["EXECUTOR_TOKEN"];
  if (!token) return;

  const sql = getSql();
  const pending = await sql`
    SELECT id, external_job_id
    FROM public.platform_deploys
    WHERE status = 'running' AND external_job_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 10
  `;

  const statusBase = deployUrl.replace(/\/deploy\/?$/, "/status/");
  await Promise.all(
    pending.map(async (row) => {
      const jobId = String(row["external_job_id"] ?? "");
      if (!jobId) return;
      try {
        const response = await fetch(`${statusBase}${encodeURIComponent(jobId)}`, {
          signal: AbortSignal.timeout(5_000),
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;
        const state = (await response.json()) as {
          status?: unknown;
          log?: unknown;
          code?: unknown;
        };
        const status =
          state.status === "success" ? "success" : state.status === "failed" ? "failed" : "running";
        const log = typeof state.log === "string" ? state.log.slice(-20_000) : "";
        if (status === "running") {
          await sql`UPDATE public.platform_deploys SET log = ${log || "النشر قيد التنفيذ…"} WHERE id = ${row["id"]}`;
          return;
        }
        await sql`
        UPDATE public.platform_deploys
        SET status = ${status}, log = ${log}, finished_at = now()
        WHERE id = ${row["id"]}
      `;
      } catch {
        // قد يكون الخطاف غير متاح لثوانٍ أثناء استبدال الحاويات؛ تبقى المهمة قيد التنفيذ.
      }
    }),
  );
}

/** تحقق سريع من حالة خطّاف النشر على كونتابو. */
export async function pingDeployHook(): Promise<{
  configured: boolean;
  reachable: boolean;
  error?: string;
}> {
  const token = process.env["EXECUTOR_TOKEN"];
  if (!token) return { configured: false, reachable: false };
  try {
    const statusUrl = deployHookEndpoint("/status/ping");
    const res = await fetch(statusUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
      headers: { Authorization: `Bearer ${token}` },
    });
    // 404/405 يعنيان أن الخطّاف يعمل وقَبِل المصادقة (المهمة "ping" غير موجودة).
    return { configured: true, reachable: res.status !== 401 && res.status < 500 };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** يجلب آخر إصدار من GitHub لعرضه كمؤشر مزامنة. */
export async function getGithubHead(): Promise<{
  configured: boolean;
  sha?: string | undefined;
  message?: string | undefined;
  url?: string | undefined;
  error?: string | undefined;
}> {
  const repo = process.env["GITHUB_REPO_URL"];
  const token = process.env["GITHUB_TOKEN"];
  if (!repo || !token) return { configured: false };
  try {
    const { parseRepo } = await import("@/lib/github.server");
    const { gh } = await import("@/lib/github.server");
    const { owner, repo: name } = parseRepo(repo);
    const res = await gh(token, `/repos/${owner}/${name}/commits/${encodeURIComponent("HEAD")}`);
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const data = (await res.json()) as {
      sha?: string;
      commit?: { message?: string };
      html_url?: string;
    };
    return {
      configured: true,
      sha: data.sha?.slice(0, 7),
      message: data.commit?.message?.split("\n")[0],
      url: data.html_url,
    };
  } catch (error) {
    return {
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** فحص صحي للنسخة المنشورة بعد النشر (مع محاولات متكررة). */
export async function verifyDeployHealth(
  attempts = 10,
  delayMs = 6000,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const base = (process.env["PLATFORM_PUBLIC_URL"] ?? "").replace(/\/+$/, "");
  if (!base) return { ok: true, status: 0, detail: "PLATFORM_PUBLIC_URL غير مضبوط — تخطّي الفحص" };
  let last = { ok: false, status: 0, detail: "" };
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${base}/api/public/health`, {
        signal: AbortSignal.timeout(8000),
        headers: { "cache-control": "no-cache" },
      });
      const body = (await res.text()).slice(0, 1000);
      if (res.ok) return { ok: true, status: res.status, detail: body };
      last = { ok: false, status: res.status, detail: body };
    } catch (error) {
      last = {
        ok: false,
        status: 0,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

/** ينشر ثم يتحقق صحياً، ويتراجع تلقائياً عند فشل الفحص. */
export async function deployWithGuard(
  action: "deploy" | "rollback",
): Promise<
  DeployResult & { health?: { ok: boolean; status: number; detail: string }; rolledBack?: boolean }
> {
  const result = await runDeployHook(action);
  if (!result.ok || action === "rollback") return result;
  const health = await verifyDeployHealth();
  if (health.ok) return { ...result, health };
  const rollback = await runDeployHook("rollback");
  return {
    ...result,
    ok: false,
    health,
    rolledBack: rollback.ok,
    log: `${result.log}\n\nفشل الفحص الصحي بعد النشر (${health.status}): ${health.detail}\nتم التراجع تلقائياً: ${rollback.ok ? "نجح" : "فشل"}\n${rollback.log}`,
  };
}
