import { useEffect, useRef } from "react";
import { Terminal, FileCode, Globe, Package, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type LogEventStatus = "pending" | "running" | "done" | "error";

export interface LogEvent {
  id?: string;
  type: string;
  message: string;
  timestamp: string;
  status: LogEventStatus;
}

export interface AgentLiveLogProps {
  events: LogEvent[];
  className?: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  terminal: Terminal,
  file: FileCode,
  browser: Globe,
  package: Package,
  success: Check,
  error: X,
};

const STATUS_CLASSES: Record<LogEventStatus, string> = {
  pending: "text-muted-foreground bg-surface/50 border-transparent",
  running: "text-primary bg-primary/5 border-primary/20",
  done: "text-success bg-success/5 border-success/20",
  error: "text-destructive bg-destructive/5 border-destructive/20",
};

export function AgentLiveLog({ events, className }: AgentLiveLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div 
      className={cn("flex flex-col gap-2 overflow-y-auto p-4 glass rounded-xl", className)}
      ref={scrollRef}
      dir="rtl"
    >
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up-fade {
          animation: slideUpFade 0.3s ease-out forwards;
        }
        @keyframes checkmarkAnim {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-checkmark {
          animation: checkmarkAnim 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>
      
      {events.map((event, index) => {
        const Icon = TYPE_ICONS[event.type] || Terminal;
        
        return (
          <div
            key={event.id || index}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors animate-slide-up-fade",
              STATUS_CLASSES[event.status]
            )}
          >
            <div className="mt-0.5 shrink-0">
              {event.status === "running" ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : event.status === "done" ? (
                <Check className="size-4 text-success animate-checkmark" />
              ) : event.status === "error" ? (
                <X className="size-4 text-destructive" />
              ) : (
                <Icon className="size-4 opacity-70" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className={cn(
                "leading-relaxed font-medium",
                event.status === "running" && "animate-pulse"
              )}>
                {event.message}
              </p>
            </div>
            
            <div className="shrink-0 text-[10px] text-muted-foreground/70 font-mono mt-1" dir="ltr">
              {event.timestamp}
            </div>
          </div>
        );
      })}
      
      {events.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          لا توجد أحداث بعد...
        </div>
      )}
    </div>
  );
}
