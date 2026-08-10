import { deployHookEndpoint } from "./deploy-hook.server";
import { describeHookResponse } from "./platform.server";
import { runtimeConfigured, runtimeUrl } from "./runtime.server";

/**
 * مراقبة البنية التحتية على كونتابو: خطّاف النشر، حاويات docker (nginx/runtime/app/worker)،
 * آخر نشر مع آخر 200 سطر من السجل، وتقرير أعطال جاهز للنسخ أو الطباعة كـPDF.
 */

export type ProbeState = { ok: boolean; label: string; detail: string };

export type DeployJobInfo = {
  id: string | null;
  action: string | null;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  log: string;
  failures: string[];
};

export type InfraSnapshot = {
  at: string;
  ok: boolean;
  configured: boolean;
  probes: ProbeState[];
  hookError: string | null;
  disk: string | null;
  activeJob: string | null;
  lastDeploy: DeployJobInfo | null;
  incident: { reasons: string[]; steps: string[] } | null;
  report: string;
};

type HookDiag = {
  hook?: { activeJob?: string | null; uptime?: string };
  containers?: Record<string, { ok?: boolean; detail?: string }>;
  disk?: string;
  lastDeploy?: {
    id?: string;
    action?: string;
    status?: string;
    startedAt?: string;
    finishedAt?: string;
    log?: string;
    failures?: string[];
  } | null;
};

const CONTAINER_LABELS: Record<string, string> = {
  nginx: "بوابة Nginx",
  runtime: "بيئة التنفيذ (runtime)",
  app: "تطبيق Weaver",
  worker: "العامل الخلفي",
};

async function probeRuntime(): Promise<ProbeState> {
  if (!runtimeConfigured())
    return { ok: false, label: "بيئة التنفيذ (فحص مباشر)", detail: "RUNTIME_URL غير مضبوط" };
  try {
    const res = await fetch(`${runtimeUrl()}/health`, { signal: AbortSignal.timeout(5000) });
    return {
      ok: res.ok,
      label: "بيئة التنفيذ (فحص مباشر)",
      detail: res.ok ? "HTTP 200" : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      label: "بيئة التنفيذ (فحص مباشر)",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** يقرأ التشخيص من خطّاف النشر على الخادم. */
async function fetchDiag(): Promise<{ diag: HookDiag | null; error: string | null }> {
  const token = process.env["EXECUTOR_TOKEN"];
  if (!token) return { diag: null, error: "EXECUTOR_TOKEN غير مضبوط — لا يمكن الاتصال بالخطّاف" };
  try {
    const res = await fetch(deployHookEndpoint("/diag"), {
      signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    if (!res.ok) return { diag: null, error: describeHookResponse(res.status, text) };
    try {
      return { diag: JSON.parse(text) as HookDiag, error: null };
    } catch {
      return { diag: null, error: describeHookResponse(res.status, text) };
    }
  } catch (error) {
    return { diag: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function buildIncident(probes: ProbeState[], lastDeploy: DeployJobInfo | null, hookError: string | null) {
  const reasons: string[] = [];
  const steps: string[] = [];

  if (hookError) {
    reasons.push(`خطّاف النشر غير متاح: ${hookError.split("\n")[0]}`);
    steps.push("اضغط «إعادة تشغيل خطّاف النشر» أو نفّذ: systemctl restart weaver-deploy-hook");
  }
  for (const probe of probes) {
    if (probe.ok) continue;
    reasons.push(`${probe.label}: ${probe.detail}`);
    if (probe.label.includes("Nginx")) steps.push("أعد تشغيل البوابة: docker restart weaver-nginx");
    if (probe.label.includes("runtime") || probe.label.includes("التنفيذ"))
      steps.push("أعد تشغيل بيئة التنفيذ: docker restart weaver-runtime");
    if (probe.label.includes("تطبيق")) steps.push("أعد تشغيل التطبيق: docker restart weaver-app");
    if (probe.label.includes("العامل")) steps.push("أعد تشغيل العامل: docker restart weaver-worker");
  }
  if (lastDeploy?.status === "failed") {
    reasons.push(`فشل آخر نشر (${lastDeploy.id ?? "—"})`);
    for (const line of lastDeploy.failures.slice(-5)) reasons.push(`سطر فشل: ${line.slice(0, 200)}`);
    steps.push("راجع آخر 200 سطر أدناه، أصلح السبب، ثم أعد النشر — أو تراجع للإصدار السابق.");
  }
  if (!reasons.length) return null;
  return { reasons, steps: Array.from(new Set(steps)) };
}

function buildReport(snapshot: Omit<InfraSnapshot, "report">): string {
  const lines: string[] = [];
  lines.push("تقرير أعطال Weaver");
  lines.push(`التاريخ: ${new Date(snapshot.at).toLocaleString("ar")}`);
  lines.push(`الحالة العامة: ${snapshot.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("— حالة الخدمات —");
  for (const probe of snapshot.probes)
    lines.push(`${probe.ok ? "PASS" : "FAIL"} | ${probe.label} | ${probe.detail}`);
  if (snapshot.disk) {
    lines.push("");
    lines.push("— القرص —");
    lines.push(snapshot.disk);
  }
  if (snapshot.lastDeploy) {
    lines.push("");
    lines.push("— آخر نشر —");
    lines.push(
      `المعرّف: ${snapshot.lastDeploy.id ?? "—"} | النوع: ${snapshot.lastDeploy.action ?? "—"} | الحالة: ${snapshot.lastDeploy.status ?? "—"}`,
    );
    lines.push(`البدء: ${snapshot.lastDeploy.startedAt ?? "—"} | الانتهاء: ${snapshot.lastDeploy.finishedAt ?? "—"}`);
  }
  if (snapshot.incident) {
    lines.push("");
    lines.push("— أسباب الفشل —");
    snapshot.incident.reasons.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push("");
    lines.push("— الخطوات المقترحة —");
    snapshot.incident.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  if (snapshot.lastDeploy?.log) {
    lines.push("");
    lines.push("— آخر 200 سطر من سجل النشر —");
    lines.push(snapshot.lastDeploy.log);
  }
  return lines.join("\n");
}

/** لقطة كاملة لحالة البنية التحتية مع تقرير جاهز. */
export async function infraSnapshot(): Promise<InfraSnapshot> {
  const [{ diag, error }, runtimeProbe] = await Promise.all([fetchDiag(), probeRuntime()]);
  const probes: ProbeState[] = [
    {
      ok: !error,
      label: "خطّاف النشر (deploy-hook)",
      detail: error ? error.split("\n")[0]! : `يعمل${diag?.hook?.uptime ? ` — ${diag.hook.uptime}` : ""}`,
    },
  ];
  for (const [key, label] of Object.entries(CONTAINER_LABELS)) {
    const state = diag?.containers?.[key];
    probes.push({
      ok: Boolean(state?.ok),
      label,
      detail: state?.detail ?? (error ? "غير معروف — الخطّاف غير متاح" : "غير متاح"),
    });
  }
  probes.push(runtimeProbe);

  const raw = diag?.lastDeploy ?? null;
  const lastDeploy: DeployJobInfo | null = raw
    ? {
        id: raw.id ?? null,
        action: raw.action ?? null,
        status: raw.status ?? null,
        startedAt: raw.startedAt ?? null,
        finishedAt: raw.finishedAt ?? null,
        log: raw.log ?? "",
        failures: raw.failures ?? [],
      }
    : null;

  const incident = buildIncident(probes, lastDeploy, error);
  const base: Omit<InfraSnapshot, "report"> = {
    at: new Date().toISOString(),
    ok: probes.every((p) => p.ok) && lastDeploy?.status !== "failed",
    configured: Boolean(process.env["EXECUTOR_TOKEN"]),
    probes,
    hookError: error,
    disk: diag?.disk ?? null,
    activeJob: diag?.hook?.activeJob ?? null,
    lastDeploy,
    incident,
  };
  return { ...base, report: buildReport(base) };
}

export type RestartTarget = "deploy-hook" | "nginx" | "runtime" | "app" | "worker";

/** يعيد تشغيل خدمة على الخادم عبر الخطّاف. */
export async function restartInfra(service: RestartTarget) {
  const token = process.env["EXECUTOR_TOKEN"];
  if (!token) return { ok: false, detail: "EXECUTOR_TOKEN غير مضبوط على التطبيق." };
  try {
    const res = await fetch(deployHookEndpoint("/restart"), {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ service }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: describeHookResponse(res.status, text) };
    try {
      const parsed = JSON.parse(text) as { ok?: boolean; detail?: string };
      return { ok: parsed.ok !== false, detail: parsed.detail ?? "تمت إعادة التشغيل." };
    } catch {
      return { ok: true, detail: text.slice(0, 500) || "تمت إعادة التشغيل." };
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
