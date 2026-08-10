import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import type { GhFile } from "@/lib/github.server";

/** ينشئ مستودع GitHub جديداً خاصاً بالمشروع ويرفع كل ملفاته إليه. */
export const createProjectRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(2).max(90),
        private: z.boolean().default(true),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const token = process.env["GITHUB_TOKEN"];
    if (!token) throw new Error("لم يتم ضبط GITHUB_TOKEN بعد.");

    const { data: files, error } = await context.supabase
      .from("files")
      .select("path, content")
      .eq("project_id", data.projectId)
      .order("path", { ascending: true });
    if (error) throw new Error(error.message);
    const workspace = (files ?? []) as GhFile[];
    if (workspace.length === 0) throw new Error("مساحة العمل فارغة — لا يوجد ما يُرفع.");

    const { createRepoAndPush } = await import("@/lib/delivery.server");
    const result = await createRepoAndPush(
      token,
      data.name,
      data.private,
      workspace,
      "Built with Weaver",
    );

    await context.supabase.from("runs").insert({
      project_id: data.projectId,
      user_id: context.userId,
      kind: "git",
      input: { command: `gh repo create ${result.repo}`, reason: "تسليم المشروع للعميل" },
      status: "passed",
      exit_code: 0,
      output: JSON.stringify(result),
    });

    return { ok: true as const, ...result };
  });

/** يصدّر قاعدة بيانات المشروع كملف SQL نصّي (بنية + بيانات). */
export const exportProjectDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("المشروع غير موجود");

    const { dumpProjectDatabase } = await import("@/lib/delivery.server");
    return dumpProjectDatabase(data.projectId);
  });
