import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, Loader2, RefreshCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { getInfraHealth, restartInfraService } from "@/lib/infra-health.functions";
import { cn } from "@/lib/utils";

type Service = "deploy-hook" | "nginx" | "runtime" | "app" | "worker";

const RESTART_BUTTONS: { service: Service; label: string }[] = [
  { service: "deploy-hook", label: "خطّاف النشر" },
  { service: "runtime", label: "بيئة التنفيذ" },
  { service: "nginx", label: "البوابة" },
];

/** شريط صحة البنية التحتية داخل المحادثة مع أزرار إعادة تشغيل فورية. */
export function InfraHealthStrip() {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["infra-health"],
    queryFn: () => getInfraHealth(),
    refetchInterval: 30_000,
    retry: false,
  });

  const restart = useMutation({
    mutationFn: (service: Service) => restartInfraService({ data: { service } }),
    onSuccess: (result) => {
      setNote(result.detail);
      void queryClient.invalidateQueries({ queryKey: ["infra-health"] });
    },
    onError: (error) => setNote(error instanceof Error ? error.message : String(error)),
  });

  if (!data) return null;
  const failing = data.probes.filter((probe) => !probe.ok);
  const healthy = data.ok && failing.length === 0;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-[12px]",
        healthy ? "bg-surface/60 text-muted-foreground" : "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {healthy ? (
          <CheckCircle2 className="size-3.5 text-primary" />
        ) : (
          <XCircle className="size-3.5" />
        )}
        <span className="font-semibold">
          {healthy
            ? "خدمات كونتابو تعمل (deploy-hook + runtime)"
            : `أعطال في ${failing.length} خدمة على كونتابو`}
        </span>
        {!healthy && (
          <span className="truncate" dir="ltr">
            {failing
              .slice(0, 2)
              .map((probe) => `${probe.label}: ${probe.detail}`)
              .join(" · ")
              .slice(0, 120)}
          </span>
        )}
        <button
          type="button"
          onClick={() => void refetch()}
          className="ms-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5"
        >
          <RefreshCcw className={cn("size-3", isFetching && "animate-spin")} /> تحديث
        </button>
        <Link to="/status" className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
          <Activity className="size-3" /> صفحة الحالة
        </Link>
      </div>

      {!healthy && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px]">إعادة تشغيل:</span>
          {RESTART_BUTTONS.map((item) => (
            <button
              key={item.service}
              type="button"
              disabled={restart.isPending}
              onClick={() => restart.mutate(item.service)}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-0.5 font-semibold hover:bg-destructive/10 disabled:opacity-50"
            >
              {restart.isPending && restart.variables === item.service && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {note && (
        <p className="mt-1.5 truncate text-[11px] opacity-80" dir="ltr">
          {note}
        </p>
      )}
    </div>
  );
}
