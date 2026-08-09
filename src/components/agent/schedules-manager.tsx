import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProjects } from "@/components/agent/app-shell";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  runScheduleNow,
  toggleSchedule,
} from "@/lib/schedules.functions";
import { cn } from "@/lib/utils";

const INTERVALS = [
  { value: 15, label: "كل ١٥ دقيقة" },
  { value: 60, label: "كل ساعة" },
  { value: 360, label: "كل ٦ ساعات" },
  { value: 1440, label: "يومياً" },
  { value: 10080, label: "أسبوعياً" },
];

export function SchedulesManager() {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const jobs = useQuery({ queryKey: ["schedules"], queryFn: () => listSchedules() });

  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(1440);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schedules"] });

  const create = useMutation({
    mutationFn: () =>
      createSchedule({
        data: { projectId, name: name.trim(), command: command.trim(), intervalMinutes },
      }),
    onSuccess: () => {
      setName("");
      setCommand("");
      void refresh();
      toast.success("تمت جدولة المهمة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّرت الجدولة"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSchedule({ data: { id } }),
    onSuccess: () => void refresh(),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggleSchedule({ data: input }),
    onSuccess: () => void refresh(),
  });

  const runNow = useMutation({
    mutationFn: (id: string) => runScheduleNow({ data: { id } }),
    onSuccess: () => {
      toast.success("أُرسل الأمر إلى طابور المنفّذ");
      void refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر التشغيل"),
  });

  const canCreate = projectId && name.trim() && command.trim() && !create.isPending;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-semibold">المشروع</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">اختر مشروعاً…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold">التكرار</span>
          <select
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
          >
            {INTERVALS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold">اسم المهمة</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="فحص البناء الليلي"
            className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <label className="block">
          <span className="text-[12px] font-semibold">الأمر</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            dir="ltr"
            placeholder="npm run build"
            className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={!canCreate}
        onClick={() => create.mutate()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Plus className="size-3.5" />
        جدولة المهمة
      </button>

      {(jobs.data ?? []).length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">
          لا توجد مهام مجدولة بعد. المهام المستحقّة تُدفع تلقائياً إلى طابور المنفّذ.
        </p>
      ) : (
        <ul className="space-y-2">
          {(jobs.data ?? []).map((job) => (
            <li key={job.id} className="rounded-xl border bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="size-3.5 text-primary" />
                <span className="text-[13px] font-semibold">{job.name}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 font-mono text-[9.5px]",
                    job.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {job.enabled ? "مفعّلة" : "موقوفة"}
                </span>
                <span className="ms-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => runNow.mutate(job.id)}
                    aria-label="تشغيل الآن"
                    className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:text-primary"
                  >
                    <Play className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ id: job.id, enabled: !job.enabled })}
                    className="rounded-md border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {job.enabled ? "إيقاف" : "تفعيل"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(job.id)}
                    aria-label="حذف"
                    className="grid size-7 place-items-center rounded-md border text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[11.5px] text-muted-foreground" dir="ltr">
                {job.command}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                كل {job.interval_minutes} دقيقة · التالي:{" "}
                {new Date(job.next_run_at).toLocaleString("ar")} · آخر حالة:{" "}
                {job.last_status ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
