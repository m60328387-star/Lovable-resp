import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CircleCheck,
  CircleX,
  Clock,
  Globe,
  Loader2,
  Server,
  Terminal,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/agent/app-shell";
import { getSystemHealth } from "@/lib/health.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({
    meta: [
      { title: "صحة النظام — Weaver" },
      {
        name: "description",
        content:
          "لوحة صحة Weaver: حالة المنفّذات، طابور الأوامر، الأخطاء الأخيرة، الاستهلاك، والمواقع المنشورة.",
      },
      { property: "og:title", content: "صحة النظام — Weaver" },
      { property: "og:description", content: "مراقبة حيّة لمنصّة Weaver الهندسية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg",
          tone === "good" && "bg-primary/10 text-primary",
          tone === "bad" && "bg-destructive/10 text-destructive",
          tone === "warn" && "bg-amber-500/10 text-amber-600",
          tone === "default" && "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-[11.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums" dir="ltr">
        {value}
      </p>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Activity;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Icon className="size-4 text-primary" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function HealthPage() {
  const health = useQuery({
    queryKey: ["system-health"],
    queryFn: () => getSystemHealth(),
    refetchInterval: 20_000,
  });

  const data = health.data;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-5 px-5 py-10">
          <header className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">صحة النظام</h1>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                نظرة واحدة على المنفّذات والطابور والأخطاء والاستهلاك — تُحدَّث تلقائياً كل ٢٠
                ثانية.
              </p>
            </div>
            {health.isFetching && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            )}
          </header>

          {!data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border bg-surface" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  icon={Server}
                  label="منفّذات متصلة"
                  value={`${data.executorsOnline}/${data.executors.length}`}
                  tone={data.executorsOnline > 0 ? "good" : "warn"}
                />
                <Stat
                  icon={Terminal}
                  label="أوامر في الطابور (٢٤ ساعة)"
                  value={`${data.queue.queued + data.queue.running}`}
                  tone={data.queue.noExecutor > 0 ? "warn" : "default"}
                />
                <Stat
                  icon={CircleX}
                  label="أوامر فاشلة (٢٤ ساعة)"
                  value={`${data.queue.failed}`}
                  tone={data.queue.failed > 0 ? "bad" : "good"}
                />
                <Stat
                  icon={Wallet}
                  label="التكلفة (٣٠ يوماً)"
                  value={`$${data.usage.cost.toFixed(3)}`}
                />
              </div>

              <Card icon={Server} title="المنفّذات">
                {data.executors.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    لا يوجد منفّذ مسجّل.{" "}
                    <Link to="/settings" className="font-semibold text-primary">
                      أضف خادمك من الإعدادات
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.executors.map((executor) => (
                      <li
                        key={executor.id}
                        className="flex items-center gap-2 rounded-xl border bg-surface px-3 py-2"
                      >
                        {executor.online ? (
                          <CircleCheck className="size-3.5 text-primary" />
                        ) : (
                          <CircleX className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="text-[13px] font-semibold">{executor.name}</span>
                        <span
                          className="truncate font-mono text-[10.5px] text-muted-foreground"
                          dir="ltr"
                        >
                          {executor.baseUrl}
                        </span>
                        <span className="ms-auto text-[11px] text-muted-foreground">
                          {executor.lastSeenAt
                            ? new Date(executor.lastSeenAt).toLocaleString("ar")
                            : "لم يتصل بعد"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card icon={CircleX} title="آخر الإخفاقات">
                {data.failures.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    لا توجد أوامر فاشلة خلال ٢٤ ساعة.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.failures.map((failure) => (
                      <li key={failure.id} className="rounded-xl border bg-surface px-3 py-2">
                        <p className="font-mono text-[11.5px]" dir="ltr">
                          {failure.command}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          رمز الخروج {failure.exitCode ?? "—"} ·{" "}
                          {new Date(failure.createdAt).toLocaleString("ar")} ·{" "}
                          <Link
                            to="/c/$threadId"
                            params={{ threadId: failure.projectId }}
                            className="font-semibold text-primary"
                          >
                            فتح المهمة
                          </Link>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card icon={Clock} title="المهام المجدولة">
                {data.jobs.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    لا توجد مهام مجدولة.{" "}
                    <Link to="/settings" className="font-semibold text-primary">
                      أنشئ واحدة من الإعدادات
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.jobs.map((job) => (
                      <li
                        key={job.id}
                        className="flex items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-[12.5px]"
                      >
                        <span className="font-semibold">{job.name}</span>
                        <span className="text-muted-foreground">
                          {job.enabled ? "مفعّلة" : "موقوفة"} · {job.lastStatus ?? "لم تُشغَّل"}
                        </span>
                        <span className="ms-auto text-[11px] text-muted-foreground">
                          التالي: {new Date(job.nextRunAt).toLocaleString("ar")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card icon={Globe} title="المشاريع والمواقع المنشورة">
                <p className="text-[12.5px] text-muted-foreground">
                  {data.projects.total} مشروع · {data.projects.published} منشور ·{" "}
                  {data.usage.requests} طلب نموذج خلال ٣٠ يوماً (
                  {data.usage.tokens.toLocaleString("en")} توكن).
                </p>
                <ul className="mt-3 space-y-2">
                  {data.projects.recent.map((project) => (
                    <li
                      key={project.id}
                      className="flex items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-[12.5px]"
                    >
                      <Link
                        to="/c/$threadId"
                        params={{ threadId: project.id }}
                        className="truncate font-semibold hover:text-primary"
                      >
                        {project.title}
                      </Link>
                      <span className="rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                        {project.status}
                      </span>
                      {project.published && project.slug && (
                        <a
                          href={`/s/${project.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="ms-auto font-semibold text-primary"
                        >
                          الموقع المباشر
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
