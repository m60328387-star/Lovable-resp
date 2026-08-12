import { cn } from "@/lib/utils";
import { LIFECYCLE } from "@/lib/lifecycle";
import { Check } from "lucide-react";

export interface AgentProgressBarProps {
  currentPhase: string;
  completedPhases: string[];
  totalPhases?: string[];
  className?: string;
}

export function AgentProgressBar({ currentPhase, completedPhases, totalPhases, className }: AgentProgressBarProps) {
  const phases = totalPhases && totalPhases.length > 0
    ? LIFECYCLE.filter(p => totalPhases.includes(p.id)) 
    : LIFECYCLE;

  return (
    <div className={cn("w-full glass rounded-xl p-6 pb-8", className)} dir="rtl">
      <style>{`
        @keyframes shimmerFill {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .animate-shimmer-fill {
          background-size: 200% auto;
          animation: shimmerFill 3s linear infinite;
        }
      `}</style>
      
      <div className="relative flex items-center justify-between">
        {/* Background track */}
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-surface-strong border border-border/50" />
        
        {/* Active track fill */}
        <div 
          className="absolute top-1/2 right-0 h-1.5 -translate-y-1/2 rounded-full bg-primary/80 animate-shimmer-fill transition-all duration-500 ease-in-out"
          style={{ 
            backgroundImage: "linear-gradient(90deg, var(--color-primary) 0%, color-mix(in oklch, var(--color-primary) 80%, white) 50%, var(--color-primary) 100%)",
            width: (() => {
              const currentIndex = phases.findIndex(p => p.id === currentPhase);
              if (currentIndex === -1) return "0%";
              return `${(currentIndex / (phases.length - 1)) * 100}%`;
            })()
          }}
        />

        {phases.map((phase, index) => {
          const isCompleted = completedPhases.includes(phase.id);
          const isCurrent = currentPhase === phase.id;

          return (
            <div key={phase.id} className="relative z-10 flex flex-col items-center gap-2 group">
              <div 
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 transition-all duration-500 cursor-default",
                  isCompleted ? "border-primary bg-primary text-primary-foreground" :
                  isCurrent ? "border-primary bg-surface shadow-lg shadow-primary/30 scale-110" :
                  "border-border bg-surface text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="size-4 animate-in zoom-in" />
                ) : (
                  <span className="text-[11px] font-mono">{index + 1}</span>
                )}
              </div>
              <span 
                className={cn(
                  "absolute -bottom-6 text-[11px] font-medium whitespace-nowrap transition-all duration-300",
                  isCurrent ? "text-primary font-bold opacity-100 translate-y-0" :
                  "opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:text-foreground text-muted-foreground"
                )}
              >
                {phase.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
