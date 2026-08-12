import { cn } from "@/lib/utils";
import { AlertCircle, ArrowUpCircle, CheckCircle2, CircleDashed, Clock, Loader2 } from "lucide-react";

export type TaskStatus = 'pending' | 'active' | 'review' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface KanbanTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
}

export interface KanbanBoardProps {
  tasks: KanbanTask[];
  className?: string;
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "pending", label: "قيد الانتظار" },
  { id: "active", label: "جاري التنفيذ" },
  { id: "review", label: "قيد المراجعة" },
  { id: "done", label: "مكتمل" },
];

const STATUS_ICONS: Record<TaskStatus, React.ElementType> = {
  pending: CircleDashed,
  active: Loader2,
  review: Clock,
  done: CheckCircle2,
};

const PRIORITY_STYLES: Record<TaskPriority, { icon: React.ElementType, className: string, label: string }> = {
  high: { icon: AlertCircle, className: "text-destructive bg-destructive/10 border-destructive/20", label: "عالي" },
  medium: { icon: ArrowUpCircle, className: "text-warning bg-warning/10 border-warning/20", label: "متوسط" },
  low: { icon: CircleDashed, className: "text-muted-foreground bg-surface border-border", label: "منخفض" },
};

export function KanbanBoard({ tasks, className }: KanbanBoardProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-4 gap-4", className)} dir="rtl">
      {COLUMNS.map(column => {
        const columnTasks = tasks.filter(t => t.status === column.id);
        
        return (
          <div key={column.id} className="flex flex-col glass rounded-xl overflow-hidden">
            <div className="bg-surface-strong/50 p-3 border-b border-border/50 flex items-center justify-between">
              <h3 className="font-semibold text-sm">{column.label}</h3>
              <span className="bg-background text-muted-foreground text-[10px] font-mono px-2 py-0.5 rounded-full border">
                {columnTasks.length}
              </span>
            </div>
            
            <div className="flex-1 p-3 flex flex-col gap-3 min-h-[200px]">
              {columnTasks.map(task => {
                const StatusIcon = STATUS_ICONS[task.status];
                const prio = PRIORITY_STYLES[task.priority];
                const PrioIcon = prio.icon;
                
                return (
                  <div 
                    key={task.id}
                    className="group bg-card border border-border/50 rounded-lg p-3 shadow-soft hover:shadow-lift hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="text-sm font-medium leading-snug line-clamp-2">
                        {task.title}
                      </h4>
                      <StatusIcon className={cn(
                        "size-4 shrink-0 mt-0.5",
                        task.status === "active" ? "animate-spin text-primary" : 
                        task.status === "done" ? "text-success" : 
                        "text-muted-foreground"
                      )} />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                        #{task.id}
                      </span>
                      <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border", prio.className)}>
                        <PrioIcon className="size-3" />
                        {prio.label}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {columnTasks.length === 0 && (
                <div className="m-auto text-[12px] text-muted-foreground/50 border border-dashed border-border/50 rounded-lg p-4 w-full text-center">
                  لا توجد مهام
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
