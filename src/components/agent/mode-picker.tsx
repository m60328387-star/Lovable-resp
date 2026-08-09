import { Hammer, MessagesSquare, Search, Send, Wrench } from "lucide-react";
import { MODES, useMode, type ModeId } from "@/lib/modes";
import { cn } from "@/lib/utils";

const ICONS: Record<ModeId, typeof Hammer> = {
  build: Hammer,
  research: Search,
  advise: MessagesSquare,
  bot: Send,
  platform: Wrench,
};

/** مبدّل أوضاع التشغيل: بناء / بحث / استشارة / بوت. */
export function ModePicker() {
  const { mode, setMode } = useMode();

  return (
    <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
      {MODES.map((item) => {
        const Icon = ICONS[item.id];
        const active = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.desc}
            onClick={() => setMode(item.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            <Icon className="size-3.5" />
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
