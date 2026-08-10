import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileEdit,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/agent/app-shell";
import { getAgentTrace, type TraceStep } from "@/lib/agent-jobs.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trace")({
  head: () => ({
    meta: [
      { title: "سجل تدقيق الوكيل — Weaver" },
      {
        name: "description",
        content:
          "تتبّع لحظي لكل خطوة ينفّذها وكيل Weaver: قراءة، كتابة، تنفيذ، وتحقق — مع الزمن وحالة كل أمر وتفاصيل الفشل.",
      },
      { property: "og:title", content: "سجل تدقيق الوكيل — Weaver" },
      {
        property: "og:description",
        content: "مراقبة لحظية لخطوات وكيل Weaver مع زمن كل أمر وحالته وتوقّف فوري عند الخطأ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TracePage,
});

const CATEGORY_META: Record<
  TraceStep["category"],
  { label: string; icon: typeof Eye; className: string }
> = {
  read: { label: "قراءة", icon: Eye, className: "bg-sky-500/15 text-sky-700" },
  write: { label: "كتابة", icon: FileEdit, className: "bg-violet-500/15 text-violet-700" },
  exec: { label: "تنفيذ", icon: Terminal, className: "bg-amber-500/15 text-amber-700" },
  verify: { label: "تحقق", icon: ShieldCheck, className: "bg-emerald-500/15 text-emerald-700" },
  deploy: { label: "نشر", icon: Rocket, className: "bg-indigo-500/15 text-indigo-700" },
  other: { label: "أخرى", icon: CheckCircle2, className: "bg-muted text-muted-foreground" },
};

function TracePage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [search, setSearch] = useState("");
  const [autoStop, setAutoStop] = useState(true);

  const trace = useQuery({
    queryKey: ["agent-trace", jobId, onlyFailures, search],
    queryFn: () => getAgentTrace({ data: { jobId, onlyFailures, search } }),
    // يتوقف الاستطلاع فوراً عند أول خطأ إذا كان «التوقف عند الخطأ» مفعّلاً.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 4000;
      if (autoStop && data.halted) return false;
      return data.job?.status === "running" || data.job?.status === "queued" ? 3000 : 15000;
    },
  });

  const data = trace.data;
  const steps = data?.steps ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">سجل تدقيق الوكيل</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              كل خطوة ينفّذها الوكيل أثناء الإصلاح أو البناء، مع زمنها وحالتها وتفاصيلها.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={autoStop}
                onChange={(event) => setAutoStop(event.target.checked)}
                className="size-3.5 accent-current"
              />
              التوقف عند أول خطأ
            </label>
            <button
              type="button"
              onClick={() => void trace.refetch()}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-semibold hover:bg-accent"
            >
              <RefreshCw className={cn("size-3.5", trace.isFetching && "animate-spin")} />
              تحديث
            </button>
          </div>
        </header>

        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={jobId ?? ""}
            onChange={(event) => setJobId(event.target.value || null)}
            className="rounded-lg border bg-background px-2 py-2 text-[12px]"
          >
            <option value="">أحدث مهمة نشطة</option>
            {(data?.jobs ?? []).map((job) => (
              <option key={job.id} value={job.id}>
                {new Date(job.createdAt).toLocaleString("ar")} — {job.status}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث في الأدوات والتفاصيل…"
            className="rounded-lg border bg-background px-2 py-2 text-[12px]"
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12px]">
            <input
              type="checkbox"
              checked={onlyFailures}
              onChange={(event) => setOnlyFailures(event.target.checked)}
              className="size-3.5 accent-current"
            />
            الأخطاء فقط
          </label>
        </div>

        {data?.job ? (
          <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
            <Stat label="الحالة" value={data.job.status} />
            <Stat label="المرحلة" value={data.job.phase || "—"} />
            <Stat label="خطوات مسجّلة" value={`${data.totals.steps} (${data.totals.failed} فشل)`} />
            <Stat label="زمن الأدوات" value={`${Math.round(data.totals.totalMs / 100) / 10}s`} />
            {data.job.projectId ? (
              <Link
                to="/c/$threadId"
                params={{ threadId: data.job.projectId }}
                className="text-[12px] text-primary hover:underline"
              >
                فتح سجل المحادثة الكامل للمهمة ←
              </Link>
            ) : null}
          </div>
        ) : null}

        {data?.halted && data.firstFailure ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
            <p className="flex items-center gap-2 text-[13px] font-bold text-rose-700">
              <AlertTriangle className="size-4" /> توقّفت المتابعة عند أول خطأ:{" "}
              {data.firstFailure.label}
            </p>
            {data.firstFailure.detail ? (
              <pre
                className="mt-2 max-h-48 overflow-auto rounded-lg bg-background/60 p-2 font-mono text-[11px]"
                dir="ltr"
              >
                {data.firstFailure.detail}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          {trace.isPending ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
            </p>
          ) : steps.length === 0 ? (
            <p className="rounded-xl border p-4 text-center text-[13px] text-muted-foreground">
              لا توجد خطوات مسجّلة بعد.
            </p>
          ) : (
            steps.map((step, index) => {
              const meta = CATEGORY_META[step.category];
              const Icon = meta.icon;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-xl border bg-card p-3",
                    step.ok === false && "border-rose-500/40 bg-rose-500/5",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        meta.className,
                      )}
                    >
                      <Icon className="size-3" />
                      {meta.label}
                    </span>
                    <span className="text-[12.5px] font-semibold">{step.label}</span>
                    {step.ok === false ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-rose-600">
                        <XCircle className="size-3.5" /> فشل
                      </span>
                    ) : step.ok ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600">
                        <CheckCircle2 className="size-3.5" /> نجح
                      </span>
                    ) : null}
                    <span className="ms-auto font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {new Date(step.at).toLocaleTimeString("ar")} ·{" "}
                      {step.durationMs != null ? `${step.durationMs}ms` : "—"} · محاولة{" "}
                      {step.attempt}
                    </span>
                  </div>
                  {step.detail ? (
                    <pre
                      className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[11px]"
                      dir="ltr"
                    >
                      {step.detail}
                    </pre>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[12.5px] font-semibold">{value}</p>
    </div>
  );
}
