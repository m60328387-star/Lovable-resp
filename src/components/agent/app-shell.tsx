import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Activity, Code2, LogOut, MessageSquarePlus, PanelLeft, ScrollText, Settings, ServerCog, Trash2, Workflow, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { LifecycleRail } from "@/components/agent/lifecycle-rail";
import { createProject, deleteProject, listProjects } from "@/lib/projects.functions";
import { exitSession } from "@/lib/auth.functions";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";


export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
  });
}

export function AppShell({
  children,
  activeThreadId,
}: {
  children: ReactNode;
  activeThreadId?: string;
}) {
  const { data: projects = [] } = useProjects();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: (title: string) => createProject({ data: { title } }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      if (project) void navigate({ to: "/c/$threadId", params: { threadId: project.id } });
    },
    onError: () => toast.error("تعذّر إنشاء المهمة"),
  });

  const remove = useMutation({
    mutationFn: (projectId: string) => deleteProject({ data: { projectId } }),
    onSuccess: (_data, projectId) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (activeThreadId === projectId) void navigate({ to: "/app" });
    },
    onError: () => toast.error("تعذّر حذف المهمة"),
  });

  return (
    <div className="flex h-dvh overflow-hidden bg-background" dir="rtl">
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex w-72 flex-col border-e bg-sidebar transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-4" />
          </span>
          <div>
            <p className="text-sm font-bold leading-none">Weaver</p>
            <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
              ENGINEERING AGENT
            </p>
          </div>
        </div>

        <div className="px-3 py-3">
          <button
            type="button"
            onClick={() => create.mutate("محادثة جديدة")}
            disabled={create.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-accent px-3 py-2.5 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            <MessageSquarePlus className="size-4" />
            مهمة جديدة
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            المهام
          </p>
          {projects.length === 0 && (
            <p className="px-1 text-[12px] text-muted-foreground">لا توجد مهام بعد.</p>
          )}
          <ul className="space-y-1">
            {projects.map((project) => (
              <li
                key={project.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-1 transition-colors",
                  activeThreadId === project.id ? "bg-surface-strong" : "hover:bg-surface",
                )}
              >
                <Link
                  to="/c/$threadId"
                  params={{ threadId: project.id }}
                  onClick={() => setOpen(false)}
                  className="flex-1 truncate px-2 py-2 text-[13px]"
                >
                  {project.title}
                </Link>
                <button
                  type="button"
                  aria-label="حذف المهمة"
                  onClick={() => remove.mutate(project.id)}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t px-4 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            دورة العمل
          </p>
          <LifecycleRail />
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Link
            to="/health"
            aria-label="صحة النظام"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <Activity className="size-3.5" />
          </Link>
          <Link
            to="/worker"
            aria-label="مراقبة العامل الخلفي"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <ServerCog className="size-3.5" />
          </Link>
          <Link
            to="/monitor"
            aria-label="لوحة المراقبة والسجلات"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <ScrollText className="size-3.5" />
          </Link>

          <Link
            to="/connectors"
            aria-label="الروابط الخارجية"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <PlugZap className="size-3.5" />
          </Link>
          <Link
            to="/platform"
            aria-label="تطوير المنصة"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <Code2 className="size-3.5" />
          </Link>
          <Link
            to="/settings"
            aria-label="الإعدادات"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <Settings className="size-3.5" />
          </Link>
          <span className="truncate text-[12px] text-muted-foreground" dir="ltr">
            {user?.email ?? ""}
          </span>

          <button
            type="button"
            aria-label="تسجيل الخروج"
            onClick={() => {
              void exitSession().then(() => {
                queryClient.clear();
                void navigate({ to: "/auth" });
              });
            }}
            className="ms-auto grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-destructive"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="القائمة"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg border"
          >
            <PanelLeft className="size-4" />
          </button>
          <span className="text-sm font-bold">Weaver</span>
          <button
            type="button"
            onClick={() => create.mutate("محادثة جديدة")}
            className="ms-auto grid size-9 place-items-center rounded-lg border"
            aria-label="مهمة جديدة"
          >
            <MessageSquarePlus className="size-4" />
          </button>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
