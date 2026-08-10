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

async function call<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 320_000,
): Promise<T> {
  if (!runtimeConfigured()) {
    throw new Error("بيئة التنفيذ غير مهيّأة على هذا الخادم (EXECUTOR_TOKEN مفقود).");
  }
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
    const json = text ? (JSON.parse(text) as T) : ({} as T);
    if (!res.ok) {
      const detail = (json as { error?: string })?.error ?? res.statusText;
      throw new Error(`بيئة التنفيذ ردّت ${res.status}: ${detail}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
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

export const runtimeExec = (projectId: string, command: string, timeoutMs = 300_000) =>
  call<ExecResult>("/exec", { projectId, command, timeoutMs }, timeoutMs + 20_000);

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

export type BrowserDeviceResult = {
  device: string;
  url: string;
  status: number;
  navError: string | null;
  title: string;
  lang: string;
  issues: Array<{ level: "error" | "warn"; message: string }>;
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
