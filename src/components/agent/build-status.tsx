import { Loader2, CheckCircle2, AlertCircle, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const phaseLabels: Record<string, string> = {
  intake: "استلام المتطلبات",
  discovery: "اكتشاف المتطلبات",
  spec: "كتابة المواصفات",
  architect: "تصميم البنية",
  graph: "رسم المهام",
  execute: "بناء الملفات",
  verify: "التحقق والاختبار",
  review: "المراجعة",
  deploy: "النشر",
  monitor: "المراقبة",
  done: "اكتمل",
  blocked: "متوقف",
};

const nextActionLabels: Record<string, string> = {
  ask_user: "ينتظر إجابة منك",
  write_spec: "كتابة المواصفات",
  build_task_graph: "رسم المهام",
  execute_next_task: "تنفيذ المهمة التالية",
  run_checks: "فحص الجودة",
  auto_repair: "إصلاح الأخطاء تلقائياً",
  visual_audit: "تدقيق بصري",
  deploy: "النشر",
  verify_deploy: "التحقق من النشر",
  done: "اكتمال المشروع",
};

export function BuildStatusBar({
  phase,
  progress,
  nextAction,
  deployedUrl,
  isLive,
  compact,
}: {
  phase?: string | null;
  progress?: number;
  nextAction?: string | null;
  deployedUrl?: string | null;
  isLive?: boolean;
  compact?: boolean;
}) {
  const label = phaseLabels[phase ?? "intake"] ?? phase ?? "غير معروف";
  const pct = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  const done = phase === "done";
  const blocked = phase === "blocked";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              blocked ? "bg-destructive" : done ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("text-[10px]", blocked ? "text-destructive" : "text-muted-foreground")}>
          {done ? "مكتمل" : `${pct}%`}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLive ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : done ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : blocked ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : (
            <div className="size-4 rounded-full bg-primary/20" />
          )}
          <span className="text-[13px] font-semibold">{label}</span>
          {nextAction && !done && (
            <span className="text-[11px] text-muted-foreground">
              ←{" "}
              {nextActionLabels[nextAction] ?? nextAction.replace("execute_task:", "تنفيذ المهمة ")}
            </span>
          )}
        </div>
        <span
          className={cn(
            "text-[12px] font-bold",
            blocked ? "text-destructive" : done ? "text-emerald-500" : "text-primary",
          )}
        >
          {done ? "100%" : `${pct}%`}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            blocked ? "bg-destructive" : done ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {deployedUrl && (
        <a
          href={normalizeDeployedUrl(deployedUrl)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <Rocket className="size-3" /> {normalizeDeployedUrl(deployedUrl)}
        </a>
      )}
    </div>
  );
}

/** يستبدل روابط الـIP الخام القديمة بأصل الموقع الحالي حتى لا تظهر روابط غير آمنة. */
function normalizeDeployedUrl(url: string) {
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    const isRawIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname);
    if (isRawIp && parsed.hostname !== window.location.hostname) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
