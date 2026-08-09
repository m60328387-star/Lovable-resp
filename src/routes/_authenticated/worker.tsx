import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Timer, RefreshCcw } from "lucide-react";
import { getWorkerMetrics } from "@/lib/agent-jobs.functions";

export const Route = createFileRoute("/_authenticated/worker")({
  component: WorkerPage,
  head: () => ({
    meta: [
      { title: "مراقبة العامل الخلفي | Weaver" },
      {
        name: "description",
        content: "لوحة مراقبة عامل Weaver الخلفي: حالة الطابور، زمن الخطوة، عدد المحاولات ومعدل الفشل.",
      },
      { property: "og:title", content: "مراقبة العامل الخلفي | Weaver" },
      {
        property: "og:description",
        content: "تابع طابور مهام البناء وسجلات العامل الدائم لحظة بلحظة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function WorkerPage() {
  const { data, isPending, refetch } = useQuery({
    queryKey: ["worker-metrics"],
    queryFn: () => getWorkerMetrics(),
    refetchInterval: 5000,
  });

  const counts = data?.counts ?? {};
  const tools = data?.tools ?? [];
  const totalCalls = tools.reduce((sum, t) => sum + t.calls, 0);
  const totalFailures = tools.reduce((sum, t) => sum + t.failures, 0);
  const failureRate = totalCalls ? Math.round((totalFailures / totalCalls) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6" dir="rtl">
      <header className="flex items-center gap-3">
        <Activity className="size-5 text-primary" />
        <h1 className="text-xl font-bold">مراقبة العامل الخلفي</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] hover:bg-surface"
        >
          <RefreshCcw className="size-3.5" /> تحديث
        </button>
      </header>

      {isPending && <p className="text-sm text-muted-foreground">جارٍ تحميل المؤشرات…</p>}

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "في الطابور", value: counts["queued"] ?? 0 },
          { label: "قيد التنفيذ", value: counts["running"] ?? 0 },
          { label: "مكتملة", value: counts["done"] ?? 0 },
          { label: "فاشلة", value: counts["error"] ?? 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <p className="text-[12px] text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Timer className="size-4 text-primary" /> أداء الأدوات (آخر 7 أيام) — معدل الفشل {failureRate}%
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1">الأداة</th>
                <th>استدعاءات</th>
                <th>متوسط الزمن</th>
                <th>إخفاقات</th>
                <th>أقصى محاولة</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.name} className="border-t">
                  <td className="py-1 font-mono">{t.name}</td>
                  <td>{t.calls}</td>
                  <td>{t.avgMs} ms</td>
                  <td className={t.failures > 0 ? "text-destructive" : ""}>{t.failures}</td>
                  <td>{t.maxAttempt}</td>
                </tr>
              ))}
              {tools.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted-foreground">
                    لا توجد بيانات بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-destructive" /> آخر الإخفاقات
        </h2>
        <ul className="space-y-2 text-[12px]">
          {(data?.failures ?? []).map((f, i) => (
            <li key={`${f.at}-${i}`} className="rounded-lg border p-2">
              <span className="font-mono">{f.label}</span>{" "}
              <span className="text-muted-foreground">محاولة {f.attempt}</span>
              {f.detail && <p className="mt-1 text-muted-foreground">{f.detail}</p>}
            </li>
          ))}
          {(data?.failures ?? []).length === 0 && (
            <li className="text-muted-foreground">لا إخفاقات مسجّلة.</li>
          )}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">آخر المهام</h2>
        <ul className="space-y-1 text-[12px]">
          {(data?.recent ?? []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 border-b py-1 last:border-0">
              <span className="font-mono">{j.id.slice(0, 8)}</span>
              <span>{j.status}</span>
              <span className="text-muted-foreground">{j.phase}</span>
              <span className="text-muted-foreground">
                خطوات {j.steps} · محاولات {j.attempts}/{j.maxAttempts}
              </span>
            </li>
          ))}
          {(data?.recent ?? []).length === 0 && (
            <li className="text-muted-foreground">لا مهام بعد.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
