import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCcw,
  ScrollText,
  Server,
} from "lucide-react";
import { getMonitorSnapshot } from "@/lib/monitor.functions";
import { AuditPanel } from "@/components/agent/audit-panel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/monitor")({
  component: MonitorPage,
  head: () => ({
    meta: [
      { title: "لوحة المراقبة والسجلات | Weaver" },
      {
        name: "description",
        content:
          "راقب سجلات weaver-app و weaver-worker، حالة قاعدة البيانات، ومتغيّرات البيئة الحرجة مع تنبيهات فورية.",
      },
      { property: "og:title", content: "لوحة المراقبة والسجلات | Weaver" },
      {
        property: "og:description",
        content:
          "تنبيهات فورية عند نقص VITE_SUPABASE_* أو WEAVER_WORKER_TOKEN أو انقطاع قاعدة البيانات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MonitorPage() {
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["monitor-snapshot"],
    queryFn: () => getMonitorSnapshot(),
    refetchInterval: 10000,
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6" dir="rtl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">لوحة المراقبة والسجلات</h1>
          <p className="text-[12px] text-muted-foreground">
            حالة التطبيق والعامل الخلفي وقاعدة البيانات ومتغيّرات البيئة الحرجة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
        >
          <RefreshCcw className={cn("size-3.5", isFetching && "animate-spin")} />
          تحديث
        </button>
      </header>

      {isPending && <p className="text-[12px] text-muted-foreground">جارٍ القراءة…</p>}

      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
          تعذّر جلب لقطة المراقبة: {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {data && (
        <>
          {data.alerts.length > 0 ? (
            <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="size-4" />
                تنبيهات ({data.alerts.length})
              </h2>
              <ul className="space-y-1.5">
                {data.alerts.map((alert) => (
                  <li key={alert} className="text-[12px] leading-relaxed">
                    • {alert}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-[12px]">
              <CheckCircle2 className="size-4 text-primary" />
              لا توجد تنبيهات — كل المتغيّرات الحرجة موجودة وقاعدة البيانات تستجيب.
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard
              icon={Database}
              label="قاعدة البيانات"
              value={data.db ? "متصلة" : "منقطعة"}
              tone={data.db ? "ok" : "bad"}
            />
            <StatCard
              icon={Server}
              label="آخر نبضة للعامل"
              value={
                data.workerLastSeen ? new Date(data.workerLastSeen).toLocaleString("ar") : "لا يوجد"
              }
              tone={data.workerLastSeen ? "ok" : "warn"}
            />
            <StatCard
              icon={ScrollText}
              label="مهام في الطابور"
              value={String(data.jobs.find((j) => j.status === "queued")?.count ?? 0)}
              tone="ok"
            />
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="mb-1 text-sm font-semibold">موجّه النماذج</h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              توجيه حسب نوع المهمة مع انتقال تلقائي للبديل عند أي فشل.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {data.modelRouter.providers.map((provider) => (
                <span
                  key={provider.id}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[11px]",
                    provider.configured
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {provider.id} — {provider.configured ? "مفعّل" : "بلا مفتاح"}
                </span>
              ))}
            </div>
            <ul className="space-y-1.5">
              {data.modelRouter.routes.map((route) => (
                <li key={route.kind} className="text-[11px] leading-relaxed">
                  <span className="font-semibold">{route.kind}</span>
                  <span className="text-muted-foreground"> ← {route.chain.join(" → ")}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 text-sm font-semibold">متغيّرات البيئة على الخادم</h2>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {data.env.map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-surface/40 px-2.5 py-1.5"
                >
                  <span className="min-w-0">
                    <code className="font-mono text-[11px]" dir="ltr">
                      {item.name}
                    </code>
                    <span className="block text-[10px] text-muted-foreground">{item.hint}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px]",
                      item.present
                        ? "bg-accent text-accent-foreground"
                        : item.critical
                          ? "bg-destructive/10 text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {item.present ? "موجود" : item.critical ? "مفقود (حرج)" : "غير مضبوط"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 text-sm font-semibold">سجلات العامل الخلفي (آخر 80 حدثاً)</h2>
            {data.events.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">لا توجد أحداث بعد.</p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-y-auto font-mono text-[11px]" dir="ltr">
                {data.events.map((event) => (
                  <li
                    key={event.id}
                    className={cn(
                      "flex gap-2 rounded px-2 py-1",
                      event.ok === false
                        ? "bg-destructive/10 text-destructive"
                        : "hover:bg-surface",
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(event.created_at).toLocaleTimeString("en-GB")}
                    </span>
                    <span className="shrink-0">[{event.kind}]</span>
                    <span className="truncate">
                      {event.label}
                      {event.detail ? ` — ${event.detail.slice(0, 160)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <AuditPanel />
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-[13px] font-semibold",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
