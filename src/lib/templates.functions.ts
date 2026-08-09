import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";
import { STARTER_TEMPLATES } from "@/lib/templates";

/** يزرع ملفات قالب انطلاق في مساحة عمل المشروع. */
export const applyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), templateId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const template = STARTER_TEMPLATES.find((item) => item.id === data.templateId);
    if (!template) throw new Error("قالب غير معروف");

    for (const file of template.files) {
      const { data: existing } = await context.supabase
        .from("files")
        .select("id, content, version")
        .eq("project_id", data.projectId)
        .eq("path", file.path)
        .maybeSingle();

      if (existing) {
        await context.supabase.from("file_versions").insert({
          project_id: data.projectId,
          user_id: context.userId,
          path: file.path,
          content: existing.content,
          version: existing.version,
        });
        await context.supabase
          .from("files")
          .update({ content: file.content, version: existing.version + 1 })
          .eq("id", existing.id);
      } else {
        await context.supabase.from("files").insert({
          project_id: data.projectId,
          user_id: context.userId,
          path: file.path,
          content: file.content,
        });
      }
    }

    return { files: template.files.length, prompt: template.prompt, title: template.title };
  });
