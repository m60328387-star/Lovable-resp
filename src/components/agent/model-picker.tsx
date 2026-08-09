import { useState } from "react";
import { Cpu, Check } from "lucide-react";
import { MODEL_OPTIONS, useModelSetting } from "@/lib/model-settings";
import { cn } from "@/lib/utils";

/** لوحة اختيار نموذج OpenRouter — تُحفظ محلياً وتُرسل مع كل طلب. */
export function ModelPicker({ className }: { className?: string }) {
  const { model, setModel } = useModelSetting();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const known = MODEL_OPTIONS.find((m) => m.id === model);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Cpu className="size-3.5 text-primary" />
        <span className="truncate font-mono text-[11px]" dir="ltr">
          {known?.label ?? model}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute bottom-full z-50 mb-2 w-72 rounded-xl border bg-card p-2 shadow-soft">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              نموذج OpenRouter
            </p>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {MODEL_OPTIONS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setModel(option.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-start transition-colors hover:bg-surface",
                      option.id === model && "bg-surface-strong",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {option.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {option.note}
                      </span>
                      <span
                        className="block truncate font-mono text-[10px] text-muted-foreground"
                        dir="ltr"
                      >
                        {option.id}
                      </span>
                    </span>
                    {option.id === model && <Check className="mt-1 size-3.5 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!custom.trim()) return;
                setModel(custom);
                setCustom("");
                setOpen(false);
              }}
              className="mt-2 flex items-center gap-1.5 border-t pt-2"
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="vendor/model مخصص"
                dir="ltr"
                className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring/40"
              />
              <button
                type="submit"
                className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"
              >
                حفظ
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
