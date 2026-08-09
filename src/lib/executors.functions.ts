import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

export type ExecutorRow = {
  id: string;
  name: string;
  status: string;
  workdir: string;
  token: string;
  last_seen_at: string | null;
  meta: { node?: string; platform?: string; workdir?: string };
};

const ONLINE_WINDOW_MS = 90_000;

/** يسرد منفّذات المالك مع حالة اتصال محسوبة من آخر نبضة. */
export const listExecutors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExecutorRow[]> => {
    const { data, error } = await context.supabase
      .from("executors")
      .select("id, name, status, workdir, token, last_seen_at, meta")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const now = Date.now();
    return (data ?? []).map((row) => ({
      ...row,
      meta: (row.meta ?? {}) as ExecutorRow["meta"],
      status:
        row.last_seen_at && now - new Date(row.last_seen_at).getTime() < ONLINE_WINDOW_MS
          ? "online"
          : "offline",
    }));
  });

/** ينشئ منفّذاً جديداً برمز اتصال سري يُولَّد في القاعدة. */
export const createExecutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(60),
        workdir: z.string().min(1).max(200).default("/opt/weaver/work"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("executors")
      .insert({
        user_id: context.userId,
        name: data.name,
        base_url: "",
        status: "offline",
        workdir: data.workdir,
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** يولّد رمزاً جديداً للمنفّذ (يُبطل الرمز القديم فوراً). */
export const rotateExecutorToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await context.supabase
      .from("executors")
      .update({ token, status: "offline" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { token };
  });

export const deleteExecutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("executors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** آخر الأوامر المنفّذة/المنتظرة — لمتابعة الطابور من لوحة الإعدادات. */
export const listRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runs")
      .select("id, kind, status, input, output, exit_code, created_at, finished_at")
      .eq("kind", "command")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      command: ((r.input ?? {}) as { command?: string }).command ?? "",
      output: r.output ?? "",
      exitCode: r.exit_code,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    }));
  });
