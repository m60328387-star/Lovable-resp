import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

/** ملخّص استهلاك التوكنات والتكلفة لمشروع واحد ولكل الحساب. */
export const getUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [projectRows, allRows] = await Promise.all([
      context.supabase
        .from("usage_events")
        .select("model, input_tokens, output_tokens, total_tokens, cost_usd, created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase.from("usage_events").select("total_tokens, cost_usd"),
    ]);

    const events = projectRows.data ?? [];
    const byModel = new Map<string, { model: string; tokens: number; cost: number; calls: number }>();
    for (const row of events) {
      const current = byModel.get(row.model) ?? { model: row.model, tokens: 0, cost: 0, calls: 0 };
      current.tokens += row.total_tokens;
      current.cost += Number(row.cost_usd);
      current.calls += 1;
      byModel.set(row.model, current);
    }

    const account = (allRows.data ?? []).reduce(
      (acc, row) => ({
        tokens: acc.tokens + row.total_tokens,
        cost: acc.cost + Number(row.cost_usd),
      }),
      { tokens: 0, cost: 0 },
    );

    return {
      events: events.slice(0, 30).map((row) => ({
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        cost: Number(row.cost_usd),
        createdAt: row.created_at,
      })),
      byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost),
      project: events.reduce(
        (acc, row) => ({
          tokens: acc.tokens + row.total_tokens,
          cost: acc.cost + Number(row.cost_usd),
          calls: acc.calls + 1,
        }),
        { tokens: 0, cost: 0, calls: 0 },
      ),
      account,
    };
  });

/** ملخّص استهلاك على مستوى الحساب كامل (للوحة الإعدادات). */
export const getUsageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("usage_events")
      .select("total_tokens, cost_usd");
    const rows = data ?? [];
    return {
      requests: rows.length,
      totalTokens: rows.reduce((sum, row) => sum + row.total_tokens, 0),
      costUsd: rows.reduce((sum, row) => sum + Number(row.cost_usd), 0),
    };
  });
