import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { makeLocalSupabase } from "@/lib/local-supabase";

/**
 * بروتوكول المنفّذ الخارجي (خادم Contabo أو أي VPS).
 * المصادقة: ترويسة Authorization: Bearer <executor token>
 *
 * POST /api/public/executor/heartbeat  → تسجيل الحضور وتحديث حالة المنفّذ
 * POST /api/public/executor/poll       → التقاط أمر واحد من الطابور + ملفات المشروع
 * POST /api/public/executor/result     → إعادة المخرجات وكتابة الملفات المتغيّرة
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const HeartbeatInput = z.object({
  meta: z.record(z.string(), z.unknown()).optional(),
});

const ResultInput = z.object({
  runId: z.string().uuid(),
  output: z.string().max(200_000).default(""),
  exitCode: z.number().int().min(-1).max(255).default(0),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(400),
        content: z.string().max(400_000),
      }),
    )
    .max(80)
    .optional(),
});

export const Route = createFileRoute("/api/public/executor/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token || token.length < 20) return json({ error: "unauthorized" }, 401);

        const sql = getSql();
        const supabase = makeLocalSupabase(sql, "service");

        const { data: executor } = await supabase
          .from("executors")
          .select("id, user_id, name, workdir")
          .eq("token", token)
          .maybeSingle();

        if (!executor) return json({ error: "unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const now = new Date().toISOString();

        // ---- heartbeat -------------------------------------------------
        if (params.action === "heartbeat") {
          const parsed = HeartbeatInput.safeParse(body);
          await supabase
            .from("executors")
            .update({
              status: "online",
              last_seen_at: now,
              ...(parsed.success && parsed.data.meta
                ? { meta: JSON.parse(JSON.stringify(parsed.data.meta)) }
                : {}),
            })
            .eq("id", (executor as any).id);
          return json({ ok: true, executor: { id: (executor as any).id, name: executor.name, workdir: executor.workdir } });
        }

        // ---- poll ------------------------------------------------------
        if (params.action === "poll") {
          await supabase
            .from("executors")
            .update({ status: "online", last_seen_at: now })
            .eq("id", (executor as any).id);

          const { data: queued } = await supabase
            .from("runs")
            .select("id, project_id, input")
            .eq("user_id", executor.user_id)
            .eq("kind", "command")
            .in("status", ["queued", "no_executor"])
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!queued) return json({ ok: true, run: null });

          // التقاط ذرّي: لا يلتقط الأمر منفّذان في آن واحد.
          const { data: claimed } = await supabase
            .from("runs")
            .update({ status: "running", executor_id: (executor as any).id, claimed_at: now })
            .eq("id", (queued as any).id)
            .in("status", ["queued", "no_executor"])
            .select("id")
            .maybeSingle();

          if (!claimed) return json({ ok: true, run: null });

          const { data: files } = await supabase
            .from("files")
            .select("path, content")
            .eq("project_id", (queued as any).project_id)
            .order("path", { ascending: true });

          const input = ((queued as any).input ?? {}) as { command?: string; reason?: string };
          return json({
            ok: true,
            run: {
              id: (queued as any).id,
              projectId: (queued as any).project_id,
              command: input.command ?? "",
              reason: input.reason ?? "",
            },
            files: (files as any[]) ?? [],
          });
        }

        // ---- result ----------------------------------------------------
        if (params.action === "result") {
          const parsed = ResultInput.safeParse(body);
          if (!parsed.success) return json({ error: "invalid_input", details: parsed.error.issues }, 400);
          const { runId, output, exitCode, files } = parsed.data;

          const { data: run } = await supabase
            .from("runs")
            .select("id, project_id, user_id")
            .eq("id", runId)
            .eq("executor_id", (executor as any).id)
            .maybeSingle();

          if (!run) return json({ error: "run_not_found" }, 404);

          let written = 0;
          for (const f of files ?? []) {
            const path = f.path.replace(/^\/+/, "");
            if (path.includes("..")) continue;

            const { data: existing } = await supabase
              .from("files")
              .select("id, version, content")
              .eq("project_id", (run as any).project_id)
              .eq("path", path)
              .maybeSingle();

            if (existing) {
              if ((existing as any).content === f.content) continue;
              await supabase.from("file_versions").insert({
                project_id: (run as any).project_id,
                user_id: (run as any).user_id,
                path,
                content: (existing as any).content,
                version: (existing as any).version,
              });
              await supabase
                .from("files")
                .update({ content: f.content, version: (existing as any).version + 1 })
                .eq("id", (existing as any).id);
            } else {
              await supabase.from("files").insert({
                project_id: (run as any).project_id,
                user_id: (run as any).user_id,
                path,
                content: f.content,
              });
            }
            written += 1;
          }

          await supabase
            .from("runs")
            .update({
              status: exitCode === 0 ? "success" : "failed",
              output: output.slice(0, 200_000),
              exit_code: exitCode,
              finished_at: new Date().toISOString(),
            })
            .eq("id", runId);

          return json({ ok: true, filesWritten: written });
        }

        return json({ error: "unknown_action" }, 404);
      },
    },
  },
});
