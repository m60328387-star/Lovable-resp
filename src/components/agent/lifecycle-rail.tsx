import { LIFECYCLE, type LifecycleId } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";

export function LifecycleRail({ active }: { active?: LifecycleId | null }) {
  return (
    <ol className="flex flex-col gap-1">
      {LIFECYCLE.map((stage, i) => {
        const isActive = active === stage.id;
        return (
          <li key={stage.id} className="relative flex gap-3 ps-1">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full ring-4 transition-colors",
                  isActive
                    ? "bg-primary ring-accent"
                    : "bg-border ring-transparent group-hover:bg-muted-foreground",
                )}
              />
              {i < LIFECYCLE.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="pb-3">
              <p
                className={cn(
                  "text-[13px] font-semibold leading-tight",
                  isActive ? "text-primary" : "text-foreground",
                )}
              >
                {stage.label}
                <span className="ms-2 font-mono text-[10px] font-normal tracking-widest text-muted-foreground">
                  {stage.en}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{stage.desc}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
