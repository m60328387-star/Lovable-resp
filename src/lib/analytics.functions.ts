import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

/** تحليلات زوار الموقع المنشور لهذا المشروع. */
export const getSiteAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("site_views")
      .select("path, referrer, created_at")
      .eq("project_id", data.projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const views = rows ?? [];
    const byPath = new Map<string, number>();
    const byReferrer = new Map<string, number>();
    const byDay = new Map<string, number>();

    for (const row of views) {
      byPath.set(row.path, (byPath.get(row.path) ?? 0) + 1);
      let ref = "مباشر";
      if (row.referrer) {
        try {
          ref = new URL(row.referrer).hostname;
        } catch {
          ref = row.referrer.slice(0, 40);
        }
      }
      byReferrer.set(ref, (byReferrer.get(ref) ?? 0) + 1);
      const day = row.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }

    const top = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const today = new Date().toISOString().slice(0, 10);
    return {
      total: views.length,
      today: byDay.get(today) ?? 0,
      pages: top(byPath),
      referrers: top(byReferrer),
      days: [...byDay.entries()]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-14),
    };
  });
