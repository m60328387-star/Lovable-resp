import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

type SnapFile = { path: string; content: string };

export const listCheckpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("checkpoints")
      .select("id, label, file_count, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), label: z.string().max(200).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: files, error: filesError } = await context.supabase
      .from("files")
      .select("path, content")
      .eq("project_id", data.projectId);
    if (filesError) throw new Error(filesError.message);
    if (!files || files.length === 0) return { ok: false, error: "لا توجد ملفات لحفظها" };

    const { error } = await context.supabase.from("checkpoints").insert({
      project_id: data.projectId,
      user_id: context.userId,
      label: data.label || "نقطة يدوية",
      file_count: files.length,
      files: files as unknown as Json,
    });
    if (error) throw new Error(error.message);
    return { ok: true, fileCount: files.length };
  });

export const restoreCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), checkpointId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("checkpoints")
      .select("files")
      .eq("id", data.checkpointId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: false, error: "نقطة الاسترجاع غير موجودة" };

    // لقطة أمان قبل الاسترجاع حتى يمكن التراجع عن التراجع
    const { data: current } = await context.supabase
      .from("files")
      .select("path, content")
      .eq("project_id", data.projectId);
    if (current && current.length > 0) {
      await context.supabase.from("checkpoints").insert({
        project_id: data.projectId,
        user_id: context.userId,
        label: "قبل الاسترجاع",
        file_count: current.length,
        files: current as unknown as Json,
      });
    }

    const snapshot = (row.files ?? []) as unknown as SnapFile[];
    await context.supabase.from("files").delete().eq("project_id", data.projectId);
    if (snapshot.length > 0) {
      const { error: insertError } = await context.supabase.from("files").insert(
        snapshot.map((f) => ({
          project_id: data.projectId,
          user_id: context.userId,
          path: f.path,
          content: f.content,
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    return { ok: true, restored: snapshot.length };
  });

export const deleteCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ checkpointId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("checkpoints")
      .delete()
      .eq("id", data.checkpointId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
