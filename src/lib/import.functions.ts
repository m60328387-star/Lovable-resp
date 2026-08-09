import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

const fileSchema = z.object({
  path: z.string().min(1).max(400),
  content: z.string().max(1_500_000),
});

const input = z.object({
  projectId: z.string().uuid(),
  files: z.array(fileSchema).min(1).max(400),
  mode: z.enum(["merge", "replace"]),
});

/** يستورد ملفات مستخرجة من ملف ZIP إلى مساحة عمل المشروع ثم يفحصها. */
export const importWorkspaceFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.mode === "replace") {
      await supabase.from("files").delete().eq("project_id", data.projectId);
    }

    const { data: existing } = await supabase
      .from("files")
      .select("id, path, content, version")
      .eq("project_id", data.projectId);
    const byPath = new Map((existing ?? []).map((f) => [f.path, f]));

    let created = 0;
    let updated = 0;
    for (const file of data.files) {
      const prev = byPath.get(file.path);
      if (prev) {
        await supabase.from("file_versions").insert({
          project_id: data.projectId,
          user_id: userId,
          path: file.path,
          content: prev.content,
          version: prev.version,
        });
        await supabase
          .from("files")
          .update({ content: file.content, version: prev.version + 1 })
          .eq("id", prev.id);
        updated++;
      } else {
        await supabase.from("files").insert({
          project_id: data.projectId,
          user_id: userId,
          path: file.path,
          content: file.content,
        });
        created++;
      }
    }

    const { data: all } = await supabase
      .from("files")
      .select("path, content")
      .eq("project_id", data.projectId)
      .order("path", { ascending: true });

    const { runChecks } = await import("@/lib/verify.server");
    const report = runChecks(all ?? []);

    await supabase.from("runs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "import",
      input: { command: "weaver import zip", files: data.files.length, mode: data.mode },
      status: report.ok ? "passed" : "failed",
      exit_code: report.ok ? 0 : 1,
      output: JSON.stringify(report),
    });

    return { created, updated, total: (all ?? []).length, report };
  });
