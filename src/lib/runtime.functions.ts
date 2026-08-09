import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";
import {
  runtimeConfigured,
  runtimeDevLogs,
  runtimeDevStart,
  runtimeDevStatus,
  runtimeDevStop,
  runtimeBrowserCheck,
  runtimeExec,
  runtimeHealthy,
  runtimeList,
  runtimeSync,
  runtimeReset,
} from "@/lib/runtime.server";

const ProjectInput = z.object({ projectId: z.string().uuid() });

/** يقرأ ملفات المشروع من قاعدة البيانات ويكتبها في مساحة العمل الحقيقية. */
async function pushWorkspace(projectId: string, clean = false) {
  const sql = getSql();
  const rows = (await sql`
    SELECT path, content FROM public.files WHERE project_id = ${projectId} ORDER BY path
  `) as unknown as Array<{ path: string; content: string }>;
  const files = rows.map((row) => ({ path: row.path, content: row.content ?? "" }));
  await runtimeSync(projectId, files, clean);
  return files.length;
}

export const getRuntimeStatus = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data }) => {
    if (!runtimeConfigured()) return { available: false as const, dev: { running: false } };
    const healthy = await runtimeHealthy();
    if (!healthy) return { available: false as const, dev: { running: false } };
    const dev = await runtimeDevStatus(data.projectId).catch(() => ({ running: false }));
    return { available: true as const, dev };
  });

export const syncRuntimeWorkspace = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({ clean: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => ({
    ok: true,
    synced: await pushWorkspace(data.projectId, data.clean ?? false),
  }));

export const runRuntimeCommand = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({
      command: z.string().min(1).max(2000),
      sync: z.boolean().optional(),
      timeoutMs: z.number().int().min(1000).max(600_000).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (data.sync !== false) await pushWorkspace(data.projectId);
    const result = await runtimeExec(data.projectId, data.command, data.timeoutMs ?? 300_000);
    return { ...result, output: result.output.slice(-60_000) };
  });

export const startRuntimeDev = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({ command: z.string().max(500).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    await pushWorkspace(data.projectId);
    return runtimeDevStart(data.projectId, data.command);
  });

export const stopRuntimeDev = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data }) => runtimeDevStop(data.projectId));

export const getRuntimeLogs = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({ limit: z.number().int().min(10).max(800).optional() }).parse(input),
  )
  .handler(async ({ data }) => runtimeDevLogs(data.projectId, data.limit ?? 200));

export const listRuntimeFiles = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data }) => runtimeList(data.projectId));

export const resetRuntimeWorkspace = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data }) => runtimeReset(data.projectId));

/** فحص متصفح حقيقي على المعاينة الحيّة للمشروع (Chromium داخل الحاوية). */
export const runRuntimeBrowserCheck = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({
      path: z.string().max(200).optional(),
      devices: z.array(z.enum(["desktop", "tablet", "mobile"])).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!runtimeConfigured())
      return { ok: false, errors: ["بيئة التنفيذ غير مفعّلة."], warnings: [], results: [] };
    await pushWorkspace(data.projectId);
    return runtimeBrowserCheck(data.projectId, {
      path: data.path ?? "",
      devices: data.devices ?? ["desktop", "mobile"],
      screenshots: false,
    });
  });
