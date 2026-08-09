import { createServerFn } from "@tanstack/react-start";
import { requireWeaverAuth } from "@/lib/weaver-auth";

export type ConnectorRow = {
  id: string;
  name: string;
  category: string;
  free: string;
  docs: string;
  examples: string[];
  secret: string | null;
  ready: boolean;
  enabled: boolean;
  priority: number;
  tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_ms: number | null;
};

/** قائمة الروابط مع حالة المفتاح وإعدادات المستخدم (تفعيل/أولوية/آخر اختبار). */
export const listConnectorsWithSettings = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { projectId?: string | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<ConnectorRow[]> => {
    const { listConnectorStatus } = await import("@/lib/connectors.server");
    const { readConnectorSettings } = await import("@/lib/connector-settings.server");
    const [status, settings] = await Promise.all([
      listConnectorStatus(data.projectId ?? null),
      readConnectorSettings(context.userId),
    ]);
    return status
      .map((item) => {
        const setting = settings[item.id];
        return {
          ...item,
          category: String(item.category),
          enabled: setting?.enabled ?? false,
          priority: setting?.priority ?? 100,
          tested_at: setting?.tested_at ?? null,
          last_test_ok: setting?.last_test_ok ?? null,
          last_test_ms: setting?.last_test_ms ?? null,
        };
      })
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "ar"));
  });

/** حفظ إعداد رابط واحد (تفعيل أو ترتيب أولوية). */
export const saveConnectorSetting = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { connectorId: string; enabled?: boolean; priority?: number }) => {
    if (!input?.connectorId) throw new Error("connectorId مطلوب");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { writeConnectorSetting } = await import("@/lib/connector-settings.server");
    await writeConnectorSetting(context.userId, data.connectorId, {
      ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
      ...(data.priority === undefined ? {} : { priority: data.priority }),
    });
    return { ok: true };
  });

export type ConnectorTestResult = {
  ok: boolean;
  status: number | null;
  durationMs: number;
  url: string | null;
  contentType: string | null;
  body: string;
  error: string | null;
};

/** إرسال طلب تجريبي إلى رابط قبل تفعيله للوكيل — يعرض الاستجابة ومدة التنفيذ. */
export const testConnector = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator(
    (input: {
      connectorId: string;
      path: string;
      method?: string;
      body?: string;
      projectId?: string | null;
    }) => {
      if (!input?.connectorId) throw new Error("connectorId مطلوب");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<ConnectorTestResult> => {
    const { callConnector } = await import("@/lib/connectors.server");
    const { runInSandbox, SandboxError } = await import("@/lib/sandbox.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const { recordConnectorTest } = await import("@/lib/connector-settings.server");

    let parsed: unknown = undefined;
    if (data.body && data.body.trim()) {
      try {
        parsed = JSON.parse(data.body);
      } catch {
        parsed = data.body;
      }
    }

    const startedAt = Date.now();
    let result: ConnectorTestResult;
    try {
      const raw = (await runInSandbox(
        `connector_test:${data.connectorId}`,
        () =>
          callConnector({
            projectId: data.projectId ?? null,
            connectorId: data.connectorId,
            path: data.path || "/",
            method: data.method || "GET",
            query: {},
            ...(parsed === undefined ? {} : { body: parsed }),
          }),
        { timeoutMs: 20_000 },
      )) as Record<string, unknown>;
      const bodyText =
        typeof raw["body"] === "string"
          ? (raw["body"] as string)
          : JSON.stringify(raw["body"] ?? raw, null, 2);
      result = {
        ok: Boolean(raw["ok"]),
        status: (raw["status"] as number | undefined) ?? null,
        durationMs: Date.now() - startedAt,
        url: (raw["url"] as string | undefined) ?? null,
        contentType: (raw["contentType"] as string | undefined) ?? null,
        body: (bodyText ?? "").slice(0, 8000),
        error: (raw["error"] as string | undefined) ?? null,
      };
    } catch (error) {
      const message =
        error instanceof SandboxError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      result = {
        ok: false,
        status: null,
        durationMs: Date.now() - startedAt,
        url: null,
        contentType: null,
        body: "",
        error: message,
      };
    }

    await Promise.all([
      recordAudit({
        userId: context.userId,
        projectId: data.projectId ?? null,
        kind: "test",
        name: data.connectorId,
        target: `${data.method || "GET"} ${data.path || "/"}`,
        ok: result.ok,
        status: result.status,
        durationMs: result.durationMs,
        detail: result.error ?? result.body.slice(0, 400),
      }),
      recordConnectorTest(context.userId, data.connectorId, result.ok, result.durationMs),
    ]);

    return result;
  });
