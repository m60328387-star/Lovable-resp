import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cancelAgentJob, listProjectJobs } from "@/lib/agent-jobs.functions";

const STATUS_META: Record<string, { label: string; icon: typeof Clock; tone: string }> = {
  queued: { label: "في الطابور", icon: Clock, tone: "text-muted-foreground" },
  running: { label: "قيد التنفيذ", icon: Loader2, tone: "text-primary" },
  done: { label: "اكتمل", icon: CheckCircle2, tone: "text-emerald-600" },
  error: { label: "فشل", icon: XCircle, tone: "text-destructive" },
  canceled: { label: "أُلغيت", icon: Ban, tone: "text-muted-foreground" },
};

/** لوحة تقدّم العامل الخلفي: تستطلع الحالة كل ثانيتين وتعرض المراحل لحظة بلحظة. */
export function BackgroundJobs({
  projectId,
  onActivity,
}: {
  projectId: string;
  onActivity?: (active: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["agent-jobs", projectId],
    queryFn: async () => {
      const result = await listProjectJobs({ data: { projectId } });
      const active = result.jobs.some((j) => ["queued", "running"].includes(j.status));
      onActivity?.(active);
      if (!active) void queryClient.invalidateQueries({ queryKey: ["conversation", projectId] });
      return result;
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) return null;
  const current = jobs.find((j) => ["queued", "running"].includes(j.status)) ?? jobs[0];
  if (!current) return null;
  const meta = STATUS_META[current.status] ?? STATUS_META["queued"]!;
  const Icon = meta.icon;
  const events = data?.events ?? [];

  return (
    <div className="rounded-xl border bg-card/60 p-3 text-sm">
      <div className="flex items-center gap-2">
        <Icon
          className={`size-4 ${meta.tone} ${current.status === "running" ? "animate-spin" : ""}`}
        />
        <span className="font-medium">عامل الخلفية — {meta.label}</span>
        <Badge variant="secondary">{current.phase}</Badge>
        <span className="text-xs text-muted-foreground">
          خطوات: {current.steps} · محاولات: {current.attempts}/{current.maxAttempts}
        </span>
        {["queued", "running"].includes(current.status) && (
          <Button
            size="sm"
            variant="ghost"
            className="ms-auto"
            onClick={async () => {
              await cancelAgentJob({ data: { jobId: current.id } });
              void queryClient.invalidateQueries({ queryKey: ["agent-jobs", projectId] });
            }}
          >
            إيقاف
          </Button>
        )}
      </div>
      {current.error && <p className="mt-2 text-xs text-destructive">{current.error}</p>}
      {events.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-center gap-2">
              <span className={e.ok === false ? "text-destructive" : "text-emerald-600"}>●</span>
              <span className="font-mono">{e.label}</span>
              {e.durationMs != null && <span>{e.durationMs}ms</span>}
              {e.attempt > 1 && <span>محاولة {e.attempt}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
