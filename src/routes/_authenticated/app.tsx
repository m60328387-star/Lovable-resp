import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowUp,
  FolderKanban,
  GitBranch,
  LayoutTemplate,
  Loader2,
  Search,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/agent/app-shell";
import { createProject, listProjects } from "@/lib/projects.functions";
import { applyTemplate } from "@/lib/templates.functions";

import { STARTER_TEMPLATES } from "@/lib/templates";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "مساحة العمل — Weaver" },
      {
        name: "description",
        content: "ابدأ مهمة هندسية جديدة: مواصفات، رسم مهام باعتماديات، تنفيذ وتحقق بالأدلة.",
      },
      { property: "og:title", content: "مساحة العمل — Weaver" },
      {
        property: "og:description",
        content: "لوحة انطلاق مهامك الهندسية داخل Weaver.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

const SAMPLES = [
  "أريد موقعًا مثل Airbnb ولكن للمطاعم",
  "منصة اشتراكات مع دفع ولوحة تحكم للمشرف",
  "راجع معمارية مشروع SaaS متعدد المستأجرين",
];

const PILLARS = [
  {
    icon: TerminalSquare,
    title: "مواصفات قبل الكود",
    desc: "يحوّل طلبك إلى مصدر حقيقة واحد: أهداف، متطلبات، قيود، ومعايير قبول.",
  },
  {
    icon: GitBranch,
    title: "رسم مهام لا قائمة",
    desc: "مهام لها اعتماديات ومخرجات ومعايير قبول، قابلة للتنفيذ المتوازي.",
  },
  {
    icon: ShieldCheck,
    title: "تحقق بالأدلة",
    desc: "لا يعلن الإنجاز إلا بعد build وtypecheck واختبارات ومراجعة مستقلة.",
  },
];

function Workspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const filteredProjects = useMemo(() => {
    const list = projects.data ?? [];
    const term = query.trim().toLowerCase();
    return term ? list.filter((p) => p.title.toLowerCase().includes(term)) : list;
  }, [projects.data, query]);


  const create = useMutation({
    mutationFn: (title: string) => createProject({ data: { title } }),
    onError: () => toast.error("تعذّر بدء المهمة"),
  });

  const launch = (prompt: string) => {
    const value = prompt.trim();
    if (!value || create.isPending) return;
    create.mutate(value.slice(0, 110), {
      onSuccess: (project) => {
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        if (project) {
          void navigate({
            to: "/c/$threadId",
            params: { threadId: project.id },
            search: { q: value },
          });
        }
      },
    });
  };

  const [starting, setStarting] = useState<string | null>(null);

  const launchTemplate = async (templateId: string) => {
    const template = STARTER_TEMPLATES.find((item) => item.id === templateId);
    if (!template || starting) return;
    setStarting(templateId);
    try {
      const project = await createProject({ data: { title: template.title } });
      if (!project) throw new Error("تعذّر إنشاء المشروع");
      await applyTemplate({ data: { projectId: project.id, templateId } });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void navigate({
        to: "/c/$threadId",
        params: { threadId: project.id },
        search: { q: template.prompt },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر بدء القالب");
    } finally {
      setStarting(null);
    }
  };

  return (
    <AppShell>
      <div className="grid-paper h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-accent px-3 py-1 font-mono text-[10px] tracking-widest text-accent-foreground">
            INTAKE → SPEC → GRAPH → VERIFY → DEPLOY
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">
            وكيل هندسي يخطّط وينفّذ ويتحقق
            <span className="block text-primary">قبل أن يقول: انتهيت.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            اكتب طلبك بلغتك، وسيبدأ Weaver من تفكيك المتطلبات حتى خطة النشر والمراقبة — وكل شيء
            محفوظ في حسابك.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              launch(input);
            }}
            className="mt-8"
          >
            <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-lift focus-within:ring-2 focus-within:ring-ring/40">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    launch(input);
                  }
                }}
                rows={2}
                autoFocus
                placeholder="مثال: أريد منصة حجوزات للمطاعم مع لوحة تحكم ودفع إلكتروني…"
                className="max-h-48 flex-1 resize-none bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!input.trim() || create.isPending}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                aria-label="ابدأ المهمة"
              >
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => launch(sample)}
                className="rounded-full border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {sample}
              </button>
            ))}
          </div>

          <section className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <FolderKanban className="size-4 text-primary" />
                مشاريعي
                <span className="font-mono text-[11px] text-muted-foreground">
                  {projects.data?.length ?? 0}
                </span>
              </h2>
              <div className="relative">
                <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث في مشاريعك…"
                  className="w-56 rounded-lg border bg-card py-1.5 pe-3 ps-8 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            {projects.isLoading ? (
              <p className="mt-4 text-[13px] text-muted-foreground">جارٍ تحميل المشاريع…</p>
            ) : filteredProjects.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-[13px] text-muted-foreground">
                {query ? "لا توجد نتائج مطابقة." : "لا توجد مشاريع بعد — ابدأ واحداً من الأعلى."}
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {filteredProjects.map((project) => (
                  <Link
                    key={project.id}
                    to="/c/$threadId"
                    params={{ threadId: project.id }}
                    className="group rounded-xl border bg-card p-4 shadow-soft transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 text-[14px] font-bold group-hover:text-primary">
                        {project.title}
                      </h3>
                      <span className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {project.status}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {new Date(project.updated_at).toLocaleString("en-GB")}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mt-12">

            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <LayoutTemplate className="size-4 text-primary" />
              قوالب انطلاق جاهزة
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              ابدأ من هيكل عربي RTL كامل (HTML + CSS + JS) ثم دع Weaver يطوّره وينشره.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {STARTER_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => void launchTemplate(template.id)}
                  disabled={Boolean(starting)}
                  className="rounded-xl border bg-card p-4 text-start shadow-soft transition-colors hover:border-primary/40 disabled:opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-bold">{template.title}</h3>
                    {starting === template.id && (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    )}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
          </section>



          <div className="mt-14 grid gap-3 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article key={pillar.title} className="rounded-xl border bg-card p-4 shadow-soft">
                <pillar.icon className="size-5 text-primary" />
                <h2 className="mt-3 text-[14px] font-bold">{pillar.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {pillar.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
