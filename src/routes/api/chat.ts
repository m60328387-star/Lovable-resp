import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { getOpenRouterModelId } from "@/lib/openrouter.server";
import { resolveBuildModel, noteOpenRouterUnavailable } from "@/lib/build-provider.server";
import { authenticateRequest, type AuthedContext } from "@/lib/chat-auth.server";
import type { Json } from "@/integrations/supabase/types";
import {
  reconcileProjectState,
  saveBuildState,
  type BuildPhase,
  type NextAction,
} from "@/lib/build-state.server";

import { estimateCostUsd } from "@/lib/pricing";
import { DESIGN_KIT } from "@/lib/design-kit";
import { DESIGN_LIBRARY } from "@/lib/design-library";
import { buildProjectExecutionContext } from "@/lib/project-execution.server";
import { STACK_LIBRARY } from "@/lib/stack-library";
import { skillPrompt } from "@/lib/skills";
import { modePrompt } from "@/lib/modes";
import { runtimeConfigured } from "@/lib/runtime.server";
import { applyModelOverrides } from "@/lib/intel.server";

import { compactMessages } from "@/lib/context-compaction";
import { resolveMaxOutputTokens, noteTokenBudgetError } from "@/lib/token-budget.server";
import { MEMORY_RULE, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import {
  platformTools,
  selfTools,
  intelTools,
  webTools,
  botTools,
  targetSupabaseTools,
  resolvePublicOrigin,
} from "@/lib/agent/tools/integrations";

export { resolvePublicOrigin };

import { planningTools, workspaceTools } from "@/lib/agent/tools/workspace";

/** أدوات التطوير الذاتي: تعديل كود منصة Weaver نفسها عبر مستودعها. */
/** أدوات التعديل الذاتي بمراجعة: تقترح تغييراً على كود المنصة بدل كتابته مباشرة. */

type ChatRequestBody = {
  messages?: unknown;
  projectId?: unknown;
  model?: unknown;
  skills?: unknown;
  mode?: unknown;
};

/** حد الخطوات لكل رسالة، وحد زمني يمنع قطع الاتصال في منتصف البناء. */
const MAX_STEPS = Number(process.env["WEAVER_MAX_STEPS"] ?? 160);
const TIME_BUDGET_MS = Number(process.env["WEAVER_TIME_BUDGET_MS"] ?? 240_000);

/** إعداد التفكير الموسّع: أقصى ذكاء افتراضياً مع إمكانية التخفيف عبر متغيّر بيئة. */
function reasoningConfig(): { enabled: boolean; effort?: "high" | "medium" | "low" } {
  const raw = (process.env["WEAVER_REASONING_EFFORT"] ?? "high").toLowerCase();
  if (raw === "off" || raw === "false" || raw === "none") return { enabled: false };
  const effort = raw === "low" || raw === "medium" ? raw : "high";
  return { enabled: true, effort };
}

function budgetReached(startedAt: number) {
  return () => Date.now() - startedAt > TIME_BUDGET_MS;
}

type AnyTool = { execute?: (...args: never[]) => unknown };

type LifecycleState = {
  hasDesignBlueprint: boolean;
  hasTasks: boolean;
  allTasksDone: boolean;
  hasFiles: boolean;
  checksPassed: boolean;
  /** آخر design_review على النسخة الحالية انتهى بـ pass — بوابة إلزامية قبل النشر. */
  designPassed: boolean;
  published: boolean;
  acted: boolean;
};

const BUILD_INTENT_PATTERN =
  /(?:ابن|بناء|أنش|انش|صمّم|صمم|طوّر|طور|أضف|اضف|عدّل|عدل|أصلح|اصلح|نفّذ|نفذ|انشر|موقع|تطبيق|مشروع|ميزة|كود|صفحة|أكمل|اكمل|تابع|build|create|implement|develop|fix|continue|deploy)/i;

/** يميّز طلب التنفيذ عن السؤال العام حتى لا تدخل المحادثات العادية في حلقة بناء. */
export function hasBuildIntent(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = (lastUser?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  return BUILD_INTENT_PATTERN.test(text);
}

/** آخر نصّ كتبه المستخدم — يُستخدم لاختيار الأدوات المرسلة للنموذج. */
function lastUserText(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return (lastUser?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .toLowerCase();
}

/**
 * يحدّد مجموعات الأدوات المرسلة في هذه الجولة.
 * إرسال كل الأدوات دائماً كان يضيف آلاف التوكينات إلى كل خطوة من خطوات الوكيل،
 * وهو أحد أكبر أسباب البطء وطول الصمت مقارنة بالمنصات الكبرى.
 */
export function selectToolGroups(mode: string, messages: UIMessage[]) {
  const text = lastUserText(messages);
  const mentions = (pattern: RegExp) => pattern.test(text);
  if (mode === "platform") {
    return { workspace: false, bot: false, db: false, connectors: false, platform: true };
  }
  return {
    workspace: mode === "build",
    bot: mode === "bot" || mentions(/telegram|تيليغرام|بوت|bot/),
    db:
      mode === "build" &&
      mentions(/قاعدة|جدول|sql|database|supabase|بيانات|تسجيل|حساب|auth|مستخدم/),
    connectors: mentions(
      /connector|رابط خارجي|api|notion|airtable|slack|github|resend|unsplash|بريد|webhook/,
    ),
    platform: mentions(/weaver نفس|المنصة نفسها|عدّل المنصة|طوّر المنصة|self_/),
  };
}

/** البناء مكتمل فعلياً حين توجد ملفات + نجح الفحص + تم النشر — حالة محفوظة في قاعدة البيانات. */
export function isBuildComplete(state: LifecycleState) {
  return (
    state.hasDesignBlueprint &&
    state.hasTasks &&
    state.allTasksDone &&
    state.hasFiles &&
    state.checksPassed &&
    state.designPassed &&
    state.published
  );
}

export function isBuildIncomplete(state: LifecycleState, buildIntent: boolean) {
  if (!buildIntent) return false;
  // إن كان المشروع مكتملاً بالفعل فلا نطلب استئنافاً حتى لو كانت الجولة نصّية فقط.
  return !isBuildComplete(state);
}

/** الخطوة التالية الوحيدة المطلوبة لإغلاق البناء — تُرسَل للواجهة وتُحقن في التعليمات. */
export function nextBuildAction(state: LifecycleState): string | null {
  if (!state.hasFiles && !state.hasDesignBlueprint)
    return "أغلق عقد التصميم أولاً: starter_kit(id) ← design_directions + ask_user ← design_directions(chosen) ← design_blueprint ← brand_kit. كتابة html/css محجوبة قبل ذلك.";
  if (!state.hasFiles)
    return "اكتب ملفات المشروع الفعلية عبر write_files (index.html + styles.css معاً) من قصاصات ui_snippet.";

  if (!state.hasTasks || !state.allTasksDone)
    return "نفّذ حزمة المهمة الجاهزة من دفتر التنفيذ، ثم أغلقها عبر update_task مع دليل قبول؛ لا تنتقل للفحص النهائي قبل انتهاء الرسم.";
  if (!state.checksPassed)
    return "شغّل run_checks وأصلح كل خطأ عبر fix_errors/write_file حتى ينجح الفحص.";
  if (!state.designPassed)
    return "نفّذ browser_check ثم design_review على النسخة الحالية وأصلح كل ملاحظة حتى passed=true (النشر محجوب قبلها).";
  if (!state.published) return "انشر المشروع عبر publish_site واذكر الرابط /s/<slug>.";
  return null;
}

function isSuccessfulResult(value: unknown) {
  if (!value || typeof value !== "object") return true;
  const result = value as { ok?: unknown; error?: unknown };
  return result.ok !== false && !result.error;
}

function applyToolResult(state: LifecycleState, name: string, value: unknown) {
  if (!isSuccessfulResult(value)) return;
  if (
    [
      "write_file",
      "write_files",
      "append_file",
      "edit_file",
      "delete_file",
      "promote_build",
      "run_checks",
      "fix_errors",
      "run_command",
      "shell",
      "publish_site",
    ].includes(name)
  ) {
    state.acted = true;
  }
  if (name === "build_task_graph") state.hasTasks = true;
  if (name === "design_blueprint") state.hasDesignBlueprint = true;
  if (name === "update_task") {
    const result = value as { status?: string; allTasksDone?: boolean };
    state.allTasksDone = result.allTasksDone === true;
  }
  if (
    [
      "write_file",
      "write_files",
      "append_file",
      "edit_file",
      "delete_file",
      "promote_build",
    ].includes(name)
  ) {
    state.hasFiles = true;
    state.checksPassed = false;
    // أي تعديل على الملفات يُبطل المراجعة البصرية السابقة — يجب إعادتها قبل النشر.
    state.designPassed = false;
    state.published = false;
  }
  if (name === "run_checks" || name === "fix_errors") {
    const result = value as { ok?: boolean };
    state.checksPassed = result.ok === true;
  }
  if (name === "design_review") {
    const result = value as { passed?: boolean };
    state.designPassed = result.passed === true;
  }
  if (name === "publish_site") state.published = true;
}

function lifecyclePhase(state: LifecycleState): BuildPhase {
  if (state.published) return "done";
  if (state.checksPassed) return "verify";
  if (state.hasFiles) return "execute";
  if (state.hasTasks) return "graph";
  return "intake";
}

function lifecycleNextAction(state: LifecycleState): NextAction | undefined {
  if (state.published) return "done";
  if (!state.hasFiles) return "execute_next_task";
  if (!state.checksPassed) return "run_checks";
  return "deploy";
}

const RETRYABLE_TOOLS = new Set([
  "write_file",
  "write_files",
  "append_file",
  "edit_file",
  "delete_file",
  "run_checks",
  "fix_errors",
  "publish_site",
  "run_command",
  "shell",
  "dev_server",
  "browser_check",
  "browser_open",
  "browser_read",
  "browser_act",
  "browser_close",

  "auto_repair",
  "promote_build",
  "generate_image",
  "visual_audit",
  "web_search",
  "web_fetch",
  "research",
  "analyze_content",
  "deep_think",
  "analyze_image",
  "semantic_index",
]);

const RETRY_DELAYS_MS = [400, 1200];

/**
 * نتائج الأدوات المنظّمة ({ ok:false }) نتيجة حتمية وليست عطلاً عابراً:
 * إعادة محاولتها كانت تضيف ثوانيَ صمت لكل خطوة (وتعيد فحصاً فاشلاً بلا داعٍ).
 * لا نعيد المحاولة إلا على الأعطال العابرة فعلاً (شبكة/مهلة/5xx/حدّ معدّل).
 */
const TRANSIENT_ERROR =
  /(fetch failed|network|timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|socket|rate limit|429|50[0-4]\b|temporarily|overloaded)/i;

function isTransientError(message: string) {
  return TRANSIENT_ERROR.test(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ToolEvent = {
  name: string;
  ok: boolean;
  attempt: number;
  durationMs: number;
  detail?: string | undefined;
};

/**
 * يمنع خطأ أداة واحدة من إسقاط البثّ كاملاً، ويعيد المحاولة تلقائياً
 * مع تأخير تصاعدي (backoff) للأدوات الحسّاسة مثل write_file و run_checks.
 */
export function hardenTools<T extends Record<string, unknown>>(
  tools: T,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
  audit?: { userId?: string | null; projectId?: string | null },
): T {
  const logAudit = (
    name: string,
    ok: boolean,
    durationMs: number,
    attempt: number,
    detail?: string | undefined,
  ) => {
    void import("@/lib/audit.server")
      .then(({ recordAudit }) =>
        recordAudit({
          userId: audit?.userId ?? null,
          projectId: audit?.projectId ?? null,
          kind: name.startsWith("connector") || name === "http_request" ? "connector" : "tool",
          name,
          ok,
          durationMs,
          attempt,
          detail: detail ?? null,
        }),
      )
      .catch(() => undefined);
  };
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(tools)) {
    const t = value as AnyTool;
    if (typeof t?.execute !== "function") {
      out[name] = value;
      continue;
    }
    const original = t.execute.bind(t);
    const maxAttempts = RETRYABLE_TOOLS.has(name) ? RETRY_DELAYS_MS.length + 1 : 1;
    out[name] = {
      ...(value as object),
      execute: async (...args: never[]) => {
        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const startedAt = Date.now();
          try {
            const { runInSandbox } = await import("@/lib/sandbox.server");
            const result = await runInSandbox(name, async () => original(...args));
            const ok = isSuccessfulResult(result);
            const okDetail = ok ? undefined : JSON.stringify(result).slice(0, 400);
            onEvent?.({ name, ok, attempt, durationMs: Date.now() - startedAt, detail: okDetail });
            logAudit(name, ok, Date.now() - startedAt, attempt, okDetail);
            // النتيجة المنظّمة تُعاد فوراً — نجحت أو فشلت — بلا إعادة محاولة
            onResult?.(name, result);
            return result;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            console.error(`[weaver:tool:${name}] attempt ${attempt}`, lastError);
            onEvent?.({
              name,
              ok: false,
              attempt,
              durationMs: Date.now() - startedAt,
              detail: lastError,
            });
            logAudit(name, false, Date.now() - startedAt, attempt, lastError);
            if (attempt === maxAttempts || !isTransientError(lastError)) {
              return { ok: false, error: lastError, tool: name, attempts: attempt };
            }
          }
          await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 2000);
        }
        return { ok: false, error: lastError, tool: name, attempts: maxAttempts };
      },
    };
  }
  return out as T;
}

/** أدوات الروابط الخارجية (Connectors) ونداءات HTTP العامة. */
function connectorTools(projectId: string | null, userId: string | null = null) {
  /** يمنع الوكيل من استعمال رابط عطّله المالك من صفحة الروابط. */
  const assertEnabled = async (connectorId: string) => {
    const { enabledConnectorIds } = await import("@/lib/connector-settings.server");
    const allowed = await enabledConnectorIds(userId);
    if (allowed && !allowed.includes(connectorId)) {
      return `الرابط ${connectorId} معطّل من إعدادات الروابط. فعّله من صفحة «الروابط» أو استخدم رابطاً مفعّلاً.`;
    }
    return null;
  };
  return {
    connector_list: tool({
      description:
        "يسرد الروابط الخارجية المجانية المتاحة (Telegram، GitHub، Notion، Airtable، Resend، Slack، Unsplash، بيانات مفتوحة…) مع حالة المفتاح لكل واحد. نفّذه قبل أي تكامل خارجي.",
      inputSchema: z.object({}),
      execute: async () => {
        const { listConnectorStatus } = await import("@/lib/connectors.server");
        const { enabledConnectorIds } = await import("@/lib/connector-settings.server");
        const allowed = await enabledConnectorIds(userId);
        const all = await listConnectorStatus(projectId);
        return { connectors: allowed ? all.filter((c) => allowed.includes(c.id)) : all };
      },
    }),
    connector_call: tool({
      description:
        "ينفّذ نداءً على رابط خارجي من سجل الروابط باستخدام مفتاح المشروع تلقائياً (لا تكتب المفتاح أبداً). حدّد connectorId والمسار والطريقة والجسم.",
      inputSchema: z.object({
        connectorId: z.string().describe("معرّف الرابط من connector_list"),
        path: z.string().describe("المسار بعد قاعدة العنوان، مثل /user/repos"),
        method: z.string().describe("GET أو POST أو PATCH أو DELETE"),
        query: z.record(z.string(), z.string()).describe("معاملات الاستعلام، أو كائن فارغ"),
        body: z.string().describe("جسم الطلب كنص JSON، أو نص فارغ"),
      }),
      execute: async ({ connectorId, path, method, query, body }) => {
        const blocked = await assertEnabled(connectorId);
        if (blocked) return { ok: false, error: blocked };
        const { callConnector } = await import("@/lib/connectors.server");
        let parsed: unknown = undefined;
        if (body && body.trim()) {
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
        }
        return callConnector({
          projectId,
          connectorId,
          path,
          method,
          query: query ?? {},
          ...(parsed === undefined ? {} : { body: parsed }),
        });
      },
    }),
    http_request: tool({
      description:
        "نداء HTTP عام على أي واجهة برمجية عامة (بلا عناوين داخلية). استخدمه فقط عندما لا يوجد رابط جاهز في connector_list.",
      inputSchema: z.object({
        url: z.string().describe("رابط https كامل"),
        method: z.string().describe("GET أو POST أو PATCH أو DELETE"),
        headers: z.record(z.string(), z.string()).describe("ترويسات إضافية أو كائن فارغ"),
        body: z.string().describe("جسم الطلب كنص، أو نص فارغ"),
      }),
      execute: async ({ url, method, headers, body }) => {
        const { httpCall } = await import("@/lib/connectors.server");
        return httpCall({
          url,
          method,
          headers: headers ?? {},
          ...(body && body.trim() ? { body } : {}),
        });
      },
    }),
  };
}

/** مجموعة أدوات Weaver الكاملة — يشاركها مسار الدردشة والعامل الخلفي. */
export function buildWeaverToolset(
  auth: AuthedContext,
  projectId: string | null,
  origin: string,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
) {
  return hardenTools(
    {
      ...planningTools(auth, projectId),
      ...webTools(),
      ...intelTools(auth, projectId),
      ...workspaceTools(auth, projectId, origin),
      ...botTools(auth, projectId, origin),
      ...(projectId ? targetSupabaseTools(projectId) : {}),
      ...connectorTools(projectId, auth.userId),
      ...selfTools(),
      ...platformTools(auth),
    },

    onResult,
    onEvent,
    { userId: auth.userId, projectId },
  );
}

/** نص النظام الكامل — يشاركه مسار الدردشة والعامل الخلفي. */
export function buildWeaverSystem(activeSkills: string[], mode: string, customPrompt = "") {
  return (
    SYSTEM_PROMPT +
    MEMORY_RULE +
    DESIGN_KIT +
    DESIGN_LIBRARY +
    STACK_LIBRARY +
    skillPrompt(activeSkills) +
    customPrompt +
    modePrompt(mode)
  );
}

/** لقطة حالة المشروع الحقيقية تُحقن في كل جولة حتى لا يعيد النموذج عملاً منجزاً ولا يتوقف قبل الإغلاق. */
function statusPrompt(state: LifecycleState, buildIntent: boolean, runtimeReady = true) {
  if (!buildIntent) return "";
  const next = nextBuildAction(state);
  const lines = [
    "",
    "=== حالة المشروع الحالية (من قاعدة البيانات، ليست تخميناً) ===",
    `عقد التصميم محفوظ: ${state.hasDesignBlueprint ? "نعم" : "لا"}`,
    `كل مهام الرسم منجزة: ${state.allTasksDone ? "نعم" : "لا"}`,
    `ملفات مكتوبة: ${state.hasFiles ? "نعم" : "لا"}`,
    `آخر run_checks ناجح: ${state.checksPassed ? "نعم" : "لا"}`,
    `مراجعة بصرية ناجحة على النسخة الحالية: ${state.designPassed ? "نعم" : "لا"}`,
    `منشور: ${state.published ? "نعم" : "لا"}`,
  ];
  if (!runtimeReady) {
    lines.push(
      "بيئة التنفيذ (المنفّذ) غير متاحة الآن: ممنوع طلب تشغيلها من المستخدم أو إنهاء المشروع بانتظارها.",
      "أكمل البناء والتحقق عبر run_checks و fix_errors و visual_audit ثم انشر عبر publish_site.",
    );
  }
  if (next) {
    lines.push(
      `الخطوة التالية الإلزامية في هذه الجولة: ${next}`,
      "ممنوع إنهاء الجولة بنص فقط أو بطلب مراجعة/موافقة قبل تنفيذ هذه الخطوة بأداة فعلية.",
    );
  } else {
    lines.push(
      "المشروع مكتمل ومنشور — لا تعِد البناء من الصفر، نفّذ فقط ما يطلبه المستخدم صراحةً.",
    );
  }
  return lines.join("\n") + "\n";
}

export { MAX_STEPS, TIME_BUDGET_MS, budgetReached, applyToolResult, statusPrompt };
export type { LifecycleState };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["OPENROUTER_API_KEY"];
        if (!key && !process.env["GEMINI_API_KEY"] && !process.env["GROQ_API_KEY"]) {
          return new Response("Missing model provider key", { status: 500 });
        }

        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const projectId = typeof body.projectId === "string" ? body.projectId : null;
        const origin = resolvePublicOrigin(new URL(request.url).origin);

        const requested =
          typeof body.model === "string" && /^[\w.-]+\/[\w.:-]+$/.test(body.model.trim())
            ? body.model.trim()
            : null;
        const modelId = requested ?? getOpenRouterModelId();
        const activeSkills = Array.isArray(body.skills)
          ? body.skills.filter((s): s is string => typeof s === "string").slice(0, 12)
          : [];
        const mode = typeof body.mode === "string" ? body.mode : "build";
        const buildIntent = mode === "build" && hasBuildIntent(messages as UIMessage[]);
        // اختيار الأدوات حسب الوضع والنيّة: إرسال كل الأدوات في كل خطوة كان
        // يضخّم الطلب ويبطّئ زمن أول توكن في كل دورة من دورات الوكيل.
        const needs = selectToolGroups(mode, messages as UIMessage[]);

        const lifecycle: LifecycleState = {
          hasDesignBlueprint: false,
          hasTasks: false,
          allTasksDone: false,
          hasFiles: false,
          checksPassed: false,
          designPassed: false,
          published: false,
          acted: false,
        };
        if (projectId) {
          try {
            const [
              { count: taskCount },
              { count: openTaskCount },
              { count: fileCount },
              { data: project },
              { data: latestCheck },
              { data: latestDesign },
              { data: latestFile },
              { count: blueprintCount },
            ] = await Promise.all([
              auth.supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId),
              auth.supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId)
                .neq("status", "done"),
              auth.supabase
                .from("files")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId),
              auth.supabase.from("projects").select("published").eq("id", projectId).maybeSingle(),
              auth.supabase
                .from("runs")
                .select("status")
                .eq("project_id", projectId)
                .eq("kind", "check")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              auth.supabase
                .from("runs")
                .select("status, created_at")
                .eq("project_id", projectId)
                .eq("kind", "design")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              auth.supabase
                .from("files")
                .select("updated_at")
                .eq("project_id", projectId)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              auth.supabase
                .from("project_memory")
                .select("key", { count: "exact", head: true })
                .eq("project_id", projectId)
                .eq("key", "design.blueprint"),
            ]);
            lifecycle.hasTasks = (taskCount ?? 0) > 0;
            lifecycle.allTasksDone = lifecycle.hasTasks && (openTaskCount ?? 0) === 0;
            lifecycle.hasFiles = (fileCount ?? 0) > 0;
            lifecycle.checksPassed = latestCheck?.status === "passed";
            // المراجعة البصرية تُعتبر سارية فقط إن كانت أحدث من آخر تعديل على الملفات.
            const designAt = latestDesign?.created_at ? Date.parse(latestDesign.created_at) : 0;
            const filesAt = latestFile?.updated_at ? Date.parse(latestFile.updated_at) : 0;
            lifecycle.designPassed =
              latestDesign?.status === "passed" && filesAt - designAt <= 60_000;
            lifecycle.published = project?.published === true;
            lifecycle.hasDesignBlueprint = (blueprintCount ?? 0) > 0;
          } catch {
            /* حالة الاكتمال مساعدة؛ الأدوات نفسها تبقى مصدر الحقيقة. */
          }
        }

        // نقطة استرجاع تلقائية قبل كل رسالة — تُنفَّذ في الخلفية حتى لا تؤخّر بدء الردّ
        if (projectId) {
          const lastUser = [...(messages as UIMessage[])].reverse().find((m) => m.role === "user");
          const label =
            (lastUser?.parts ?? [])
              .map((p) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .trim()
              .slice(0, 120) || "قبل رسالة جديدة";
          void (async () => {
            try {
              const { data: current } = await auth.supabase
                .from("files")
                .select("path, content")
                .eq("project_id", projectId);
              if (current && current.length > 0) {
                await auth.supabase.from("checkpoints").insert({
                  project_id: projectId,
                  user_id: auth.userId,
                  label,
                  file_count: current.length,
                  files: current as unknown as Json,
                });
              }
            } catch {
              /* نقطة الاسترجاع اختيارية ولا تُفشل المحادثة */
            }
          })();
        }

        // كل قراءات التهيئة تتم على التوازي حتى لا تتراكم زمنياً قبل أول توكن
        const platformModule = await import("@/lib/platform.server");
        const [customRows, platform, platformPrompt, executionContext] = await Promise.all([
          auth.supabase
            .from("custom_skills")
            .select("slug, name, prompt")
            .eq("enabled", true)
            .then((r) => r.data ?? [])
            .catch(() => []),
          platformModule.loadPlatformSettings(),
          platformModule.activePromptOverride(),
          buildProjectExecutionContext(auth.supabase, projectId),
        ]);

        // المهارات المخصّصة التي أنشأها المالك (skill-creator)
        let customPrompt = "";
        const active = (customRows as Array<{ slug: string; name: string; prompt: string }>).filter(
          (r) => activeSkills.includes(`custom:${r.slug}`),
        );
        if (active.length > 0) {
          customPrompt = `\n\n=== مهارات مخصّصة مفعّلة (التزم بها حرفياً) ===\n${active
            .map((r) => `مهارة "${r.name}":\n${r.prompt}`)
            .join("\n\n")}`;
        }

        applyModelOverrides(platform);
        const effectiveModel = requested ?? platform.primaryModel ?? modelId;
        const routed = resolveBuildModel(effectiveModel, origin);

        let stepsUsed = 0;
        // تثبيت حالة البناء الحقيقية (مشتقّة من قاعدة البيانات) عند أي نهاية للجولة.
        const persistBuildState = async () => {
          if (!projectId) return;
          try {
            // المصالحة تشتق الطور والخطوة التالية من قاعدة البيانات وتحفظهما.
            await reconcileProjectState(projectId);
          } catch {
            try {
              await saveBuildState(
                projectId,
                { phase: lifecyclePhase(lifecycle) },
                lifecycleNextAction(lifecycle),
                null,
              );
            } catch {
              // حالة البناء مساعدة؛ لا نُفشل الردّ
            }
          }
        };
        try {
          const result = streamText({
            model: routed.model,
            system:
              buildWeaverSystem(activeSkills, mode, customPrompt) +
              (platformPrompt
                ? `\n\nتعليمات إضافية من مالك المنصة (إلزامية):\n${platformPrompt}\n`
                : "") +
              statusPrompt(lifecycle, buildIntent, runtimeConfigured()) +
              executionContext,

            // ضغط سياق ذكي: يمنع انفجار حجم الطلب في المشاريع الكبيرة
            // (مخرجات أدوات ضخمة + عشرات الخطوات) وهو أهم سبب لتوقّف البناء في المنتصف.
            messages: await convertToModelMessages(compactMessages(messages as UIMessage[])),
            tools: hardenTools(
              {
                ...planningTools(auth, projectId),

                ...webTools(),
                ...(needs.workspace ? workspaceTools(auth, projectId, origin) : {}),
                ...(needs.bot ? botTools(auth, projectId, origin) : {}),
                ...(needs.db && projectId ? targetSupabaseTools(projectId) : {}),
                ...intelTools(auth, projectId),
                ...(needs.connectors ? connectorTools(projectId, auth.userId) : {}),
                ...(needs.platform ? selfTools() : {}),
                ...(needs.platform ? platformTools(auth) : {}),
              },
              (name, value) => applyToolResult(lifecycle, name, value),
              undefined,
              {
                userId: auth.userId,
                projectId,
              },
            ),
            // بعض النماذج ترسل اسم أداة فارغاً أو غير مطابق — نصحّحه بدل إسقاط الجولة.
            repairToolCall: async ({ toolCall, tools: available }) => {
              const names = Object.keys(available);
              const raw = String(toolCall.toolName ?? "").trim();
              const match =
                names.find((n) => n === raw) ??
                names.find((n) => n.toLowerCase() === raw.toLowerCase()) ??
                names.find((n) => raw && (n.includes(raw) || raw.includes(n)));
              if (!match) {
                // لا نحوّل الاسم الفارغ إلى أداة تحتاج مُدخلات. قراءة الملفات نقطة استرجاع آمنة.
                if (names.includes("list_files"))
                  return { ...toolCall, toolName: "list_files", input: "{}" };
                if (names.includes("memory_list"))
                  return { ...toolCall, toolName: "memory_list", input: "{}" };
                return null;
              }
              if (match === "run_status" && (!toolCall.input || toolCall.input === "{}")) {
                return { ...toolCall, toolName: match, input: "{}" };
              }
              return { ...toolCall, toolName: match };
            },
            stopWhen: [stepCountIs(platform.maxSteps || MAX_STEPS), budgetReached(startedAt)],
            maxOutputTokens: resolveMaxOutputTokens(platform.maxTokens),

            // تفكير موسّع لأقصى ذكاء (قابل للضبط عبر WEAVER_REASONING_EFFORT: high|medium|low|off)
            providerOptions: { openrouter: { reasoning: reasoningConfig() } },

            onStepFinish: () => {
              stepsUsed += 1;
            },

            onFinish: async ({ totalUsage }) => {
              try {
                const inputTokens = totalUsage?.inputTokens ?? 0;
                const outputTokens = totalUsage?.outputTokens ?? 0;
                if (inputTokens || outputTokens) {
                  await auth.supabase.from("usage_events").insert({
                    project_id: projectId,
                    user_id: auth.userId,
                    model: modelId,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: totalUsage?.totalTokens ?? inputTokens + outputTokens,
                    cost_usd: estimateCostUsd(modelId, inputTokens, outputTokens),
                  });
                }
              } catch {
                // تسجيل الاستهلاك لا يجب أن يُفشل الردّ
              }
              await persistBuildState();
            },

            onAbort: async () => {
              // حتى عند القطع نُثبّت حالة البناء الحقيقية حتى لا تتجمّد الواجهة.
              await persistBuildState();
            },

            onError: async () => {
              await persistBuildState();
            },
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
            sendReasoning: true,
            headers: { "X-Weaver-Model": routed.modelId, "X-Weaver-Provider": routed.provider },
            // نُعلم الواجهة أن الجولة انتهت بسبب حد الخطوات/الوقت لا لأن العمل اكتمل،
            // فتستأنف تلقائياً بدل أن يتوقف البناء في المنتصف.
            messageMetadata: ({ part }) =>
              part.type === "finish"
                ? {
                    truncated:
                      stepsUsed >= (platform.maxSteps || MAX_STEPS) ||
                      Date.now() - startedAt > TIME_BUDGET_MS,
                    incomplete: isBuildIncomplete(lifecycle, buildIntent),
                    complete: isBuildComplete(lifecycle),
                    nextAction: nextBuildAction(lifecycle),
                    lifecycle,
                    steps: stepsUsed,
                  }
                : undefined,

            onError: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              console.error("[weaver:stream]", message);
              const learned = noteTokenBudgetError(error);
              const degraded = noteOpenRouterUnavailable(error);
              if (degraded) {
                return `رصيد OpenRouter غير كافٍ الآن — حوّلت البناء تلقائياً إلى Gemini/Groq. أعد الإرسال وسيكمل من آخر حالة محفوظة.`;
              }
              if (learned) {
                return `رصيد OpenRouter لا يسمح بحجم الرد المطلوب. خفّضت الحدّ تلقائياً إلى ${learned} توكن — أعد الإرسال وسيكمل البناء من آخر حالة محفوظة.`;
              }
              return `انقطعت هذه الجولة بسبب خطأ من المزوّد: ${message}\n\nسيستأنف Weaver التنفيذ تلقائياً من آخر حالة محفوظة.`;
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "OpenRouter error";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
