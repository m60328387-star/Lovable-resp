import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { SKILLS, useSkills } from "@/lib/skills";
import { listCustomSkills } from "@/lib/custom-skills.functions";
import { cn } from "@/lib/utils";

/** مُبدّل المهارات المفعّلة للمحادثة. */
export function SkillsPicker() {
  const { skills, toggle } = useSkills();
  const [open, setOpen] = useState(false);
  const custom = useQuery({
    queryKey: ["custom-skills"],
    queryFn: () => listCustomSkills(),
    enabled: open,
  });
  const items = [
    ...SKILLS.map((s) => ({ id: s.id, name: s.name, desc: s.desc })),
    ...(custom.data ?? [])
      .filter((s) => s.enabled)
      .map((s) => ({ id: `custom:${s.slug}`, name: s.name, desc: s.description || "مهارة مخصّصة" })),
  ];


  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
          skills.length > 0
            ? "border-primary/40 bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-surface",
        )}
      >
        <Sparkles className="size-3.5" />
        المهارات
        {skills.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">
            {skills.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute bottom-full z-40 mb-2 max-h-80 w-80 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lift">
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
              فعّل المهارات التي تريد أن يلتزم بها الوكيل في هذه المحادثة.
            </p>
            {items.map((skill) => {
              const active = skills.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggle(skill.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-start transition-colors",
                    active ? "bg-accent" : "hover:bg-surface",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                      active ? "border-primary bg-primary text-primary-foreground" : "",
                    )}
                  >
                    {active && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold">{skill.name}</span>
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {skill.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
