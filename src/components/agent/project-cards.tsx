import { cn } from "@/lib/utils";

export type SpecPayload = {
  title: string;
  objective: string;
  users: string[];
  functional: string[];
  nonFunctional: string[];
  architecture: string[];
  risks: string[];
  acceptance: string[];
  openQuestions: string[];
};

export type TaskNode = {
  id: string;
  title: string;
  layer: string;
  dependsOn: string[];
  acceptance: string;
  verification: string[];
};

export type TaskUpdate = { id: string; status: string; note: string };

const LAYER_LABEL: Record<string, string> = {
  discovery: "استكشاف",
  data: "بيانات",
  backend: "خلفية",
  frontend: "واجهة",
  integration: "تكامل",
  quality: "جودة",
  deploy: "نشر",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-accent text-accent-foreground",
  blocked: "bg-warning/20 text-warning-foreground",
  failed: "bg-destructive/12 text-destructive",
  done: "bg-success/15 text-success",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار",
  running: "جارٍ",
  blocked: "معطّل",
  failed: "فشل",
  done: "مكتمل",
};

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpecCard({ spec }: { spec: SpecPayload }) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-soft">
      <header className="border-b pb-3">
        <p className="font-mono text-[10px] tracking-widest text-primary">PROJECT_SPEC.md</p>
        <h3 className="mt-1 text-base font-bold">{spec.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{spec.objective}</p>
      </header>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Section title="المستخدمون" items={spec.users} />
        <Section title="متطلبات وظيفية" items={spec.functional} />
        <Section title="غير وظيفية" items={spec.nonFunctional} />
        <Section title="المعمارية" items={spec.architecture} />
        <Section title="المخاطر" items={spec.risks} />
        <Section title="معايير القبول" items={spec.acceptance} />
      </div>
      {spec.openQuestions?.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <Section title="أسئلة ناقصة" items={spec.openQuestions} />
        </div>
      )}
    </article>
  );
}

export function TaskGraphCard({
  tasks,
  updates,
}: {
  tasks: TaskNode[];
  updates: Record<string, TaskUpdate>;
}) {
  const byLayer = tasks.reduce<Record<string, TaskNode[]>>((acc, task) => {
    (acc[task.layer] ??= []).push(task);
    return acc;
  }, {});

  return (
    <article className="rounded-xl border bg-card p-4 shadow-soft">
      <header className="border-b pb-3">
        <p className="font-mono text-[10px] tracking-widest text-primary">TASK_GRAPH</p>
        <h3 className="mt-1 text-base font-bold">رسم المهام والاعتماديات</h3>
      </header>
      <div className="mt-3 space-y-4">
        {Object.entries(byLayer).map(([layer, layerTasks]) => (
          <div key={layer}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {LAYER_LABEL[layer] ?? layer}
            </p>
            <div className="grid gap-2">
              {layerTasks.map((task) => {
                const update = updates[task.id];
                const status = update?.status ?? "pending";
                return (
                  <div key={task.id} className="rounded-lg border bg-surface/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                        {task.id}
                      </span>
                      <span className="text-[13px] font-semibold">{task.title}</span>
                      <span
                        className={cn(
                          "ms-auto rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          STATUS_STYLE[status] ?? STATUS_STYLE["pending"],
                        )}
                      >
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                      معيار القبول: {task.acceptance}
                    </p>
                    {update?.note && (
                      <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">
                        › {update.note}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {task.dependsOn?.length > 0 && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ← {task.dependsOn.join(" · ")}
                        </span>
                      )}
                      {task.verification?.map((v) => (
                        <span
                          key={v}
                          className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
