import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import {
  browserAct,
  browserClose,
  browserFrame,
  browserOpen,
  browserRead,
  runtimeConfigured,
} from "@/lib/runtime.server";

const ProjectInput = z.object({ projectId: z.string().uuid() });

/** يفتح (أو يعيد استخدام) جلسة المتصفح الدائمة للمشروع. */
export const openBrowserSession = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({
      url: z.string().max(2000).optional(),
      allowlist: z.array(z.string().max(120)).max(40).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!runtimeConfigured()) throw new Error("بيئة التنفيذ غير مفعّلة على هذا الخادم.");
    return browserOpen(data.projectId, {
      ...(data.url ? { url: data.url } : {}),
      ...(data.allowlist ? { allowlist: data.allowlist } : {}),
    });
  });

/** إطار حيّ من المتصفح لعرضه داخل اللوحة. */
export const getBrowserFrame = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({ quality: z.number().int().min(20).max(90).optional() }).parse(input),
  )
  .handler(async ({ data }) => browserFrame(data.projectId, data.quality ?? 55));

/** إجراء بشري مباشر (نقر/كتابة/تمرير) من الواجهة الحيّة — لا يمرّ بحواجز الوكيل. */
export const sendBrowserInput = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    ProjectInput.extend({
      kind: z.enum([
        "goto",
        "click",
        "dblclick",
        "type",
        "press",
        "scroll",
        "back",
        "reload",
        "wait",
      ]),
      x: z.number().optional(),
      y: z.number().optional(),
      dy: z.number().optional(),
      text: z.string().max(4000).optional(),
      key: z.string().max(40).optional(),
      url: z.string().max(2000).optional(),
      clear: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { projectId, ...action } = data;
    return browserAct(projectId, { ...action, actor: "human" });
  });

export const readBrowserPage = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data }) => browserRead(data.projectId));

export const closeBrowserSession = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => ProjectInput.parse(input))
  .handler(async ({ data }) => browserClose(data.projectId));
