import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { makeLocalSupabase } from "@/lib/local-supabase";

/**
 * مشغّل المهام المجدولة — يُستدعى دورياً من pg_cron أو أي مؤقت خارجي.
 * يدفع كل مهمة مستحقّة إلى طابور المنفّذ ثم يحدّث موعدها القادم.
 */
export const Route = createFileRoute("/api/public/hooks/scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allowed = [process.env["WEAVER_SCHEDULER_SECRET"]].filter(
          (value): value is string => Boolean(value),
        );
        const provided = request.headers.get("apikey") ?? "";
        if (allowed.length === 0 || !allowed.includes(provided)) {
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
        for (const job of (due as any[]) ?? []) {
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
              last_run_id: (run as any)?.id,
              next_run_at: new Date(now.getTime() + job.interval_minutes * 60_000).toISOString(),
            })
            .eq("id", job.id);
          if (updateError) console.error("scheduler: failed to update job", job.id, updateError.message);
          queued += 1;
        }

        return new Response(JSON.stringify({ ok: true, queued }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
