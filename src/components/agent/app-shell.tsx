import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Code2,
  Loader2,
  LogOut,
  MessageSquarePlus,
  PanelLeft,
  Rocket,
  ScrollText,
  HeartPulse,
  Settings,
  ServerCog,
  Trash2,
  Workflow,
  PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import { LifecycleRail } from "@/components/agent/lifecycle-rail";
import { BuildStatusBar } from "@/components/agent/build-status";
import { createProject, deleteProject, listProjects } from "@/lib/projects.functions";
import { exitSession } from "@/lib/auth.functions";
import { deployPlatform } from "@/lib/platform.functions";
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
  const [collapsed, setCollapsed] = useState(false);
  const [showPush, setShowPush] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem("weaver-sidebar-collapsed") === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("weaver-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

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

  const push = useMutation({
    mutationFn: () => deployPlatform({ data: { action: "deploy" } }),
    onSuccess: (result) => {
      if (result.pending) toast.info("بدأ الدفع إلى كونتابو…");
      else if (result.ok) toast.success("تم الاتصال بالخادم");
      else toast.error("فشل الاتصال بكونتابو");
      void queryClient.invalidateQueries({ queryKey: ["platform-deploys"] });
      void queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الدفع"),
  });

  return (
    <div className="flex h-dvh overflow-hidden bg-background" dir="rtl">
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex w-72 max-w-[85vw] flex-col border-e bg-sidebar transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
          collapsed && "lg:hidden",
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
                  "group rounded-lg px-1 transition-colors",
                  activeThreadId === project.id ? "bg-surface-strong" : "hover:bg-surface",
                )}
              >
                <Link
                  to="/c/$threadId"
                  params={{ threadId: project.id }}
                  onClick={() => setOpen(false)}
                  className="block px-2 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px]">{project.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                        project.status === "done"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : project.status === "blocked" || project.next_action === null
                            ? "bg-destructive/15 text-destructive"
                            : "bg-primary/15 text-primary",
                      )}
                    >
                      {project.status === "done"
                        ? "مكتمل"
                        : project.status === "blocked"
                          ? "متوقف"
                          : "يعمل"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <BuildStatusBar
                      phase={project.status}
                      progress={project.build_progress}
                      nextAction={project.next_action}
                      compact
                    />
                    <span className="text-[10px] text-muted-foreground" dir="ltr">
                      {project.build_progress}%
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label="حذف المهمة"
                  onClick={() => remove.mutate(project.id)}
                  className="mx-1 mb-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
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

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
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
            to="/status"
            aria-label="حالة الخدمات والنشر"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary border-primary/40" }}
          >
            <HeartPulse className="size-3.5" />
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
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <button
            type="button"
            aria-label="القائمة"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg border lg:hidden"
          >
            <PanelLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={collapsed ? "إظهار الشريط الجانبي" : "إخفاء الشريط الجانبي"}
            onClick={toggleCollapsed}
            className="hidden size-9 place-items-center rounded-lg border lg:grid"
          >
            <PanelLeft className="size-4" />
          </button>
          <span className="truncate text-sm font-bold">Weaver</span>

          <button
            type="button"
            onClick={() => setShowPush((v) => !v)}
            className="ms-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold hover:bg-accent"
          >
            <Rocket className="size-3.5" /> Push
          </button>
          {showPush ? (
            <div className="absolute start-1/2 top-12 z-50 w-72 -translate-x-1/2 rounded-xl border bg-card p-3 shadow-lg">
              <p className="text-[12px] font-semibold">دفع Weaver إلى كونتابو</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ينشر آخر نسخة من GitHub إلى الخادم 194.163.155.52.
              </p>
              <button
                type="button"
                disabled={push.isPending}
                onClick={() => {
                  setShowPush(false);
                  push.mutate();
                }}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {push.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Rocket className="size-3.5" />
                )}
                دفع الآن
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => create.mutate("محادثة جديدة")}
            className="grid size-9 shrink-0 place-items-center rounded-lg border"
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
