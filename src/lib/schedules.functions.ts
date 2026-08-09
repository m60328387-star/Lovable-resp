import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

/** المهام المجدولة: أوامر دورية تُدفع إلى طابور المنفّذ تلقائياً. */
export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_jobs")
      .select(
        "id, project_id, name, command, interval_minutes, enabled, next_run_at, last_run_at, last_status",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(120),
        command: z.string().min(1).max(2000),
        intervalMinutes: z.number().int().min(5).max(10080),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("scheduled_jobs")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        name: data.name,
        command: data.command,
        interval_minutes: data.intervalMinutes,
        next_run_at: new Date(Date.now() + data.intervalMinutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_jobs")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scheduled_jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** تشغيل فوري: يدفع الأمر إلى الطابور الآن دون انتظار الموعد. */
export const runScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("scheduled_jobs")
      .select("id, project_id, command, name")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { data: run, error: runError } = await context.supabase
      .from("runs")
      .insert({
        project_id: job.project_id,
        user_id: context.userId,
        kind: "command",
        status: "queued",
        input: { command: job.command, reason: `مهمة مجدولة: ${job.name}` },
      })
      .select("id")
      .single();
    if (runError) throw new Error(runError.message);

    await context.supabase
      .from("scheduled_jobs")
      .update({ last_run_at: new Date().toISOString(), last_status: "queued", last_run_id: run.id })
      .eq("id", job.id);

    return { runId: run.id };
  });
