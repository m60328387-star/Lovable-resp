/**
 * عميل بيئة التنفيذ (Weaver Runtime).
 * يتحدث مع حاوية `runtime` التي تملك مساحة عمل حقيقية على القرص لكل مشروع:
 * تثبيت الحزم، تشغيل خادم تطوير، قراءة سجلّ الأخطاء، ومعاينة حيّة.
 */

const DEFAULT_URL = "http://127.0.0.1:4100";

export function runtimeUrl() {
  return (process.env["RUNTIME_URL"] || DEFAULT_URL).replace(/\/+$/, "");
}

export function runtimeToken() {
  return process.env["EXECUTOR_TOKEN"] ?? "";
}

export function runtimeConfigured() {
  return Boolean(runtimeToken() && runtimeToken().length >= 16);
}

async function callOnce<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${runtimeUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-weaver-token": runtimeToken() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const looksHtml = /^\s*<(?:!doctype|html)/i.test(text);
    if (looksHtml || (!res.ok && res.status >= 502 && res.status <= 504)) {
      throw new Error(
        `بيئة التنفيذ غير متاحة حالياً (HTTP ${res.status}): البوابة (nginx) لم تصل إلى خدمة التنفيذ. أعد تشغيلها على الخادم: docker compose restart runtime`,
      );
    }
    let json: T;
    try {
      json = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      throw new Error(`ردّ غير متوقّع من بيئة التنفيذ (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    if (!res.ok) {
      const detail = (json as { error?: string })?.error ?? res.statusText;
      throw new Error(`بيئة التنفيذ ردّت ${res.status}: ${detail}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** أخطاء عابرة تستحق إعادة محاولة: إعادة تشغيل الحاوية، انقطاع شبكي، بوابة غير جاهزة. */
function transient(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /غير متاحة حالياً|ECONNREFUSED|ECONNRESET|fetch failed|socket|network|HTTP 50[234]/i.test(
    message,
  );
}

/**
 * نداء بيئة التنفيذ مع إعادة محاولة قصيرة.
 * حاوية التنفيذ نقطة فشل وحيدة: أي إعادة تشغيل لحظية كانت تُسقط كل أدوات البناء
 * (shell، dev_server، browser_check) في تلك الجولة. محاولتان إضافيتان تمتصان ذلك.
 */
async function call<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 320_000,
): Promise<T> {
  if (!runtimeConfigured()) {
    throw new Error("بيئة التنفيذ غير مهيّأة على هذا الخادم (EXECUTOR_TOKEN مفقود).");
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callOnce<T>(path, body, timeoutMs);
    } catch (error) {
      lastError = error;
      // لا نعيد تنفيذ أمر قد يكون نُفّذ فعلاً إلا إذا كان الفشل شبكياً واضحاً.
      if (!transient(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

export type RuntimeFile = { path: string; content: string };

export type ExecResult = {
  ok: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
};

export type DevStatus = {
  running: boolean;
  ready?: boolean;
  mode?: string;
  port?: number;
  command?: string;
  uptimeMs?: number;
  exitCode?: number | null;
  previewPath?: string;
};

export const runtimeSync = (projectId: string, files: RuntimeFile[], clean = false) =>
  call<{ ok: boolean; written: number }>("/sync", { projectId, files, clean }, 120_000);

/**
 * سقف صلب لأي أمر تنفيذ واحد.
 * ميزانية جولة الوكيل 240 ثانية (WEAVER_TIME_BUDGET_MS)، فإذا سُمح لأمر واحد بـ 300 ثانية
 * فإنه يبتلع الجولة كلها ويُقطع في منتصفه — وهذا ما كان يظهر للمستخدم كـ"توقّف البناء فجأة".
 * الآن أي أمر يُقصّ قبل نهاية الجولة، فيعود خطأ مفهوماً ويستأنف الوكيل بدل أن ينقطع.
 */
const MAX_EXEC_MS = Number(process.env["WEAVER_MAX_EXEC_MS"] ?? 170_000);

export const runtimeExec = (projectId: string, command: string, timeoutMs = 150_000) => {
  const bounded = Math.min(Math.max(timeoutMs, 5_000), MAX_EXEC_MS);
  return call<ExecResult>("/exec", { projectId, command, timeoutMs: bounded }, bounded + 15_000);
};

export const runtimeDevStart = (projectId: string, command?: string) =>
  call<{
    ok: boolean;
    mode: string;
    port: number;
    previewPath: string;
    ready: boolean;
    logs?: string[];
  }>("/dev/start", { projectId, command }, 360_000);

export const runtimeDevStop = (projectId: string) =>
  call<{ ok: boolean; stopped: boolean }>("/dev/stop", { projectId }, 30_000);

export const runtimeDevStatus = (projectId: string) =>
  call<DevStatus>("/dev/status", { projectId }, 20_000);

export const runtimeDevLogs = (projectId: string, limit = 200) =>
  call<{ logs: string[]; errors: string[]; status: DevStatus }>(
    "/dev/logs",
    { projectId, limit },
    20_000,
  );

export const runtimeList = (projectId: string, limit = 500) =>
  call<{ files: Array<{ path: string; bytes: number }> }>(
    "/files/list",
    { projectId, limit },
    30_000,
  );

export const runtimeRead = (projectId: string, path: string) =>
  call<{ content: string | null }>("/files/read", { projectId, path }, 30_000);

import type { RawDesignMetrics } from "@/lib/design/metrics";

export type BrowserDeviceResult = {
  device: string;
  url: string;
  status: number;
  navError: string | null;
  title: string;
  lang: string;
  issues: Array<{ level: "error" | "warn"; message: string }>;
  metrics?: RawDesignMetrics | null;
  consoleErrors: string[];
  networkErrors: string[];
  screenshot: string | null;
};

export type BrowserCheckResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  results: BrowserDeviceResult[];
};

/** فحص متصفح حقيقي (Chromium) داخل حاوية التنفيذ على المعاينة الحيّة. */
export const runtimeBrowserCheck = (
  projectId: string,
  options: { path?: string; devices?: string[]; screenshots?: boolean; waitMs?: number } = {},
) => call<BrowserCheckResult>("/browser/check", { projectId, ...options }, 180_000);

export const runtimeReset = (projectId: string) =>
  call<{ ok: boolean }>("/workspace/reset", { projectId }, 60_000);

// ------------------------------------------------------ جلسة متصفح دائمة (Computer Use)

export type BrowserSessionState = {
  ok: boolean;
  url: string;
  allowlist: string[];
  startedAt: number;
  log: Array<{ at: number; action: string; actor?: string; detail?: string; url?: string }>;
};

export type BrowserElement = {
  i: number;
  tag: string;
  type: string;
  label: string;
  value: string;
  x: number;
  y: number;
};

export type BrowserPageRead = {
  ok: boolean;
  title: string;
  url: string;
  text: string;
  elements: BrowserElement[];
};

export type BrowserFrame = {
  ok: boolean;
  url: string;
  title: string;
  width: number;
  height: number;
  image: string;
};

export type BrowserAction = Record<string, unknown> & { kind: string };

export const browserOpen = (
  projectId: string,
  options: { url?: string; allowlist?: string[]; locale?: string; timezone?: string } = {},
) => call<BrowserSessionState>("/browser/session/open", { projectId, ...options }, 90_000);

export const browserAct = (projectId: string, action: BrowserAction) =>
  call<{ ok: boolean; url: string; title: string }>(
    "/browser/session/act",
    { projectId, action },
    90_000,
  );

export const browserRead = (projectId: string) =>
  call<BrowserPageRead>("/browser/session/read", { projectId }, 60_000);

export const browserFrame = (projectId: string, quality = 55) =>
  call<BrowserFrame>("/browser/session/frame", { projectId, quality }, 60_000);

export const browserClose = (projectId: string) =>
  call<{ ok: boolean; closed: boolean }>("/browser/session/close", { projectId }, 30_000);

/** فحص سريع لتوفّر بيئة التنفيذ (يُستعمل في الصحة والواجهة). */
export async function runtimeHealthy() {
  if (!runtimeConfigured()) return false;
  try {
    const res = await fetch(`${runtimeUrl()}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}
