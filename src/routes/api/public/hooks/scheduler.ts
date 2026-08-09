import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { z } from "zod";
import { makeLocalSupabase } from "@/lib/local-supabase";

const dueJobSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  command: z.string(),
  interval_minutes: z
    .number()
    .int()
    .positive()
    .max(60 * 24 * 31),
});

const runRowSchema = z.object({ id: z.string() });

/** مقارنة ثابتة الزمن لمنع تسريب السر عبر توقيت الرد. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * مشغّل المهام المجدولة — يُستدعى دورياً من pg_cron أو أي مؤقت خارجي.
 * يدفع كل مهمة مستحقّة إلى طابور المنفّذ ثم يحدّث موعدها القادم.
 */
export const Route = createFileRoute("/api/public/hooks/scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allowed = [process.env["WEAVER_SCHEDULER_SECRET"]].filter((value): value is string =>
          Boolean(value),
        );
        const provided = request.headers.get("apikey") ?? "";
        if (allowed.length === 0 || !allowed.some((secret) => safeEqual(secret, provided))) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sql = getSql();
        const supabase = makeLocalSupabase(sql, "service");
        const now = new Date();

        const { data: due, error } = await supabase
          .from("scheduled_jobs")
          .select("id, user_id, project_id, name, command, interval_minutes")
          .eq("enabled", true)
          .lte("next_run_at", now.toISOString())
          .limit(25);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let queued = 0;
        const jobs = dueJobSchema.array().safeParse(due ?? []);
        if (!jobs.success) {
          return new Response(JSON.stringify({ error: "invalid scheduled_jobs row shape" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        for (const job of jobs.data) {
          const { data: run, error: runError } = await supabase
            .from("runs")
            .insert({
              project_id: job.project_id,
              user_id: job.user_id,
              kind: "command",
              status: "queued",
              input: { command: job.command, reason: `مهمة مجدولة: ${job.name}` },
            })
            .select("id")
            .single();

          if (runError) {
            console.error("scheduler: failed to queue run", job.id, runError.message);
            continue;
          }

          const { error: updateError } = await supabase
            .from("scheduled_jobs")
            .update({
              last_run_at: now.toISOString(),
              last_status: "queued",
              last_run_id: runRowSchema.safeParse(run).data?.id ?? null,
              next_run_at: new Date(now.getTime() + job.interval_minutes * 60_000).toISOString(),
            })
            .eq("id", job.id);
          if (updateError)
            console.error("scheduler: failed to update job", job.id, updateError.message);
          queued += 1;
        }

        return new Response(JSON.stringify({ ok: true, queued }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
