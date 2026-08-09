import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteCustomSkill,
  listCustomSkills,
  saveCustomSkill,
  type CustomSkill,
} from "@/lib/custom-skills.functions";
import { cn } from "@/lib/utils";

const EMPTY = { id: undefined as string | undefined, name: "", description: "", prompt: "" };

/** منشئ المهارات: يتيح للمالك تعريف خبرات جديدة يلتزم بها الوكيل. */
export function CustomSkillsManager() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["custom-skills"], queryFn: () => listCustomSkills() });

  const save = useMutation({
    mutationFn: () =>
      saveCustomSkill({
        data: {
          id: draft.id,
          name: draft.name.trim(),
          icon: "Puzzle",
          description: draft.description.trim(),
          prompt: draft.prompt.trim(),
          enabled: true,
        },
      }),
    onSuccess: () => {
      setDraft(EMPTY);
      setOpen(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["custom-skills"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomSkill({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["custom-skills"] }),
  });

  const edit = (skill: CustomSkill) => {
    setDraft({ id: skill.id, name: skill.name, description: skill.description, prompt: skill.prompt });
    setOpen(true);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {list.isLoading && (
          <p className="text-[12px] text-muted-foreground">جارٍ تحميل المهارات…</p>
        )}
        {list.data?.length === 0 && !open && (
          <p className="text-[12px] text-muted-foreground">
            لا توجد مهارات مخصّصة بعد. أنشئ مهارة لتعليم الوكيل أسلوباً أو مجالاً جديداً.
          </p>
        )}
        {list.data?.map((skill) => (
          <div
            key={skill.id}
            className="flex items-start gap-3 rounded-xl border bg-surface/60 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{skill.name}</p>
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {skill.description || skill.prompt.slice(0, 120)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => edit(skill)}
              aria-label={`تعديل ${skill.name}`}
              className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => remove.mutate(skill.id)}
              aria-label={`حذف ${skill.name}`}
              className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {open ? (
        <div className="space-y-2 rounded-xl border bg-surface/60 p-3">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="اسم المهارة — مثال: كتابة عقود API"
            className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="وصف قصير يظهر في قائمة المهارات"
            className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={draft.prompt}
            onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            rows={8}
            placeholder={
              "التعليمات التي يلتزم بها الوكيل حرفياً عند تفعيل هذه المهارة.\nمثال:\n- ابدأ دائماً بجدول متطلبات.\n- استخدم أدوات web_search للتحقق من كل رقم.\n- سلّم الملفات بهذا الترتيب…"
            }
            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={save.isPending || draft.name.trim().length < 2 || draft.prompt.trim().length < 10}
              onClick={() => save.mutate()}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground",
                "disabled:opacity-50",
              )}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              حفظ المهارة
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDraft(EMPTY);
              }}
              className="min-h-11 rounded-lg border px-4 text-[13px] font-medium"
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface"
        >
          <Plus className="size-4" />
          مهارة جديدة
        </button>
      )}
    </div>
  );
}
