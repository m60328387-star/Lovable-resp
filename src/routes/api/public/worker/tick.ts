import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, stepCountIs, type UIMessage } from "ai";
import { createOpenRouterProvider, getOpenRouterModelId } from "@/lib/openrouter.server";
import { getSql } from "@/lib/db";
import { makeLocalSupabase } from "@/lib/local-supabase";
import { estimateCostUsd } from "@/lib/pricing";
import {
  buildWeaverSystem,
  buildWeaverToolset,
  applyToolResult,
  hasBuildIntent,
  isBuildIncomplete,
  statusPrompt,
  MAX_STEPS,
  TIME_BUDGET_MS,
  type LifecycleState,
} from "@/routes/api/chat";
import {
  claimNextJob,
  ensureAgentJobs,
  finishJob,
  logJobEvent,
  requeueForContinuation,
  setJobPhase,
} from "@/lib/agent-jobs.server";

/**
 * نقطة العامل الخلفي الدائم: يسحب مهمة واحدة من الطابور وينفّذ حلقة الوكيل
 * كاملة على الخادم — يكمل البناء حتى لو أُغلق المتصفح.
 */
export const Route = createFileRoute("/api/public/worker/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["WEAVER_WORKER_TOKEN"];
        if (!token || token.length < 16) {
          return Response.json({ ok: false, error: "worker_token_missing" }, { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${token}`) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const key = process.env["OPENROUTER_API_KEY"];
        if (!key) {
          return Response.json({ ok: false, error: "missing_openrouter_key" }, { status: 500 });
        }

        await ensureAgentJobs();
        const job = await claimNextJob();
        if (!job) return Response.json({ ok: true, idle: true });

        const sql = getSql();
        const supabase = makeLocalSupabase(sql, job.user_id);
        const ctx = { supabase, userId: job.user_id };
        const projectId = job.project_id;
        const origin = new URL(request.url).origin;
        const modelId = job.model ?? getOpenRouterModelId();
        const openrouter = createOpenRouterProvider(key, origin);
        const skills = Array.isArray(job.skills) ? (job.skills as string[]) : [];
        const startedAt = Date.now();

        const lifecycle: LifecycleState = {
          hasTasks: false,
          hasFiles: false,
          checksPassed: false,
          published: false,
          acted: false,
        };

        if (projectId) {
          try {
            const [taskRows, fileRows, projectRows, checkRows] = await Promise.all([
              sql`SELECT count(*)::int AS count FROM public.tasks WHERE project_id = ${projectId}`,
              sql`SELECT count(*)::int AS count FROM public.files WHERE project_id = ${projectId}`,
              sql`SELECT published FROM public.projects WHERE id = ${projectId} LIMIT 1`,
              sql`
                SELECT status FROM public.runs
                WHERE project_id = ${projectId} AND kind = 'check'
                ORDER BY created_at DESC LIMIT 1
              `,
            ]);
            lifecycle.hasTasks = Number((taskRows[0] as { count?: number } | undefined)?.count ?? 0) > 0;
            lifecycle.hasFiles = Number((fileRows[0] as { count?: number } | undefined)?.count ?? 0) > 0;
            lifecycle.published = (projectRows[0] as { published?: boolean } | undefined)?.published === true;
            lifecycle.checksPassed =
              (checkRows[0] as { status?: string } | undefined)?.status === "passed";
          } catch (error) {
            console.error("[weaver:worker:lifecycle]", error);
          }
        }

        const buildIntent =
          job.mode === "build" && hasBuildIntent((job.messages ?? []) as UIMessage[]);

        let steps = 0;
        try {
          const tools = buildWeaverToolset(
            ctx,
            projectId,
            origin,
            (name, value) => applyToolResult(lifecycle, name, value),
            (event) => {
              void logJobEvent({
                jobId: job.id,
                projectId,
                kind: "tool",
                label: event.name,
                detail: event.detail ?? null,
                ok: event.ok,
                durationMs: event.durationMs,
                attempt: event.attempt,
              });
              void setJobPhase(job.id, `${event.ok ? "نفّذ" : "أعاد المحاولة"}: ${event.name}`);
            },
          );

          const result = await generateText({
            model: openrouter(modelId),
            system: buildWeaverSystem(skills, job.mode) + statusPrompt(lifecycle, buildIntent),
            messages: await convertToModelMessages((job.messages ?? []) as UIMessage[]),
            tools,
            stopWhen: [
              stepCountIs(MAX_STEPS),
              () => Date.now() - startedAt > TIME_BUDGET_MS * 3,
            ],
            maxOutputTokens: Number(process.env["OPENROUTER_MAX_TOKENS"] ?? 64000),
            onStepFinish: () => {
              steps += 1;
              void setJobPhase(job.id, `خطوة ${steps} من ${MAX_STEPS}`, steps);
            },
          });

          // تسجيل الاستهلاك
          try {
            const usage = result.totalUsage;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;
            if (inputTokens || outputTokens) {
              await supabase.from("usage_events").insert({
                project_id: projectId,
                user_id: job.user_id,
                model: modelId,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: usage?.totalTokens ?? inputTokens + outputTokens,
                cost_usd: estimateCostUsd(modelId, inputTokens, outputTokens),
              });
            }
          } catch {
            /* الاستهلاك لا يُفشل المهمة */
          }

          // إلحاق ردّ المساعد بالمحادثة حتى يراه المستخدم عند العودة
          if (projectId && result.text.trim()) {
            try {
              const rows = await sql`
                SELECT COALESCE(MAX(position), -1) + 1 AS next
                FROM public.messages WHERE project_id = ${projectId}
              `;
              const next = (rows[0] as unknown as { next: number }).next ?? 0;
              await sql`
                INSERT INTO public.messages (project_id, user_id, role, parts, position)
                VALUES (
                  ${projectId}, ${job.user_id}, 'assistant',
                  ${sql.json({
                    id: `bg-${job.id}-${next}`,
                    role: "assistant",
                    parts: [{ type: "text", text: result.text }],
                  } as never)},
                  ${next}
                )
              `;
            } catch (error) {
              console.error("[weaver:worker:persist]", error);
            }
          }

          const incomplete = isBuildIncomplete(lifecycle, buildIntent);

          if (incomplete && job.attempts < job.max_attempts) {
            await requeueForContinuation(job, result.text);
            await logJobEvent({
              jobId: job.id,
              projectId,
              kind: "requeue",
              label: "متابعة تلقائية",
              detail: JSON.stringify(lifecycle),
              ok: true,
              attempt: job.attempts,
            });
            return Response.json({ ok: true, jobId: job.id, requeued: true, steps });
          }

          await finishJob({
            jobId: job.id,
            status: incomplete ? "error" : "done",
            phase: incomplete ? "توقف قبل الاكتمال بعد استنفاد المحاولات" : "اكتمل",
            resultText: result.text,
            error: incomplete ? "لم تجتز المهمة بوابات الملفات والفحص والنشر ضمن حد المحاولات." : null,
            steps,
          });
          await logJobEvent({
            jobId: job.id,
            projectId,
            kind: "finish",
            label: "اكتملت المهمة",
            ok: !incomplete,
            durationMs: Date.now() - startedAt,
            attempt: job.attempts,
          });
          return Response.json({ ok: !incomplete, jobId: job.id, steps, done: !incomplete, incomplete });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[weaver:worker]", message);
          const retry = job.attempts < job.max_attempts;
          if (retry) {
            await requeueForContinuation(
              job,
              `فشلت الجولة السابقة بهذا الخطأ:\n${message.slice(0, 1000)}`,
              "تابع التنفيذ من آخر حالة محفوظة. عالج الخطأ السابق بسبب مختلف أو أداة بديلة، ثم أكمل الملفات والفحص والنشر. لا تكرر نفس الإجراء الفاشل بلا تغيير.",
              "خطأ مؤقت — إعادة محاولة بسياق الإصلاح",
            );
          } else {
            await finishJob({
              jobId: job.id,
              status: "error",
              phase: "فشل بعد استنفاد المحاولات",
              error: message,
              steps,
            });
          }
          await logJobEvent({
            jobId: job.id,
            projectId,
            kind: "error",
            label: "خطأ في التنفيذ",
            detail: message.slice(0, 500),
            ok: false,
            durationMs: Date.now() - startedAt,
            attempt: job.attempts,
          });
          return Response.json({ ok: false, jobId: job.id, error: message, retry });
        }
      },
    },
  },
});
