import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Clock,
  Cpu,
  Github,
  Puzzle,
  Server,
  Sparkles,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/agent/app-shell";
import { ConnectorsCatalog } from "@/components/agent/connectors-catalog";
import { CustomSkillsManager } from "@/components/agent/custom-skills-manager";

import { ExecutorsManager } from "@/components/agent/executors-manager";
import { SchedulesManager } from "@/components/agent/schedules-manager";

import { DEFAULT_MODEL, MODEL_OPTIONS, useModelSetting } from "@/lib/model-settings";
import { SKILLS, useSkills } from "@/lib/skills";
import { getUsageSummary } from "@/lib/usage.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — Weaver" },
      {
        name: "description",
        content: "اضبط نموذج الذكاء الاصطناعي، فعّل المهارات، وراجع استهلاك الطلبات في Weaver.",
      },
      { property: "og:title", content: "الإعدادات — Weaver" },
      { property: "og:description", content: "لوحة الإعدادات الإدارية لوكيل Weaver الهندسي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const { model, setModel } = useModelSetting();
  const { skills, toggle } = useSkills();
  const usage = useQuery({
    queryKey: ["usage-summary"],
    queryFn: () => getUsageSummary(),
  });

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-10">
          <header>
            <h1 className="text-2xl font-bold tracking-tight">الإعدادات</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              كل ما يتحكّم في سلوك الوكيل من مكان واحد.
            </p>
          </header>

          <Section
            icon={Cpu}
            title="نموذج الذكاء الاصطناعي"
            desc="النموذج المستخدم عبر OpenRouter في كل المحادثات الجديدة."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {MODEL_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setModel(option.id)}
                  className={cn(
                    "rounded-xl border p-3 text-start transition-colors",
                    model === option.id
                      ? "border-primary/50 bg-accent"
                      : "hover:border-primary/30 hover:bg-surface",
                  )}
                >
                  <span className="block text-[13px] font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                    {option.note}
                  </span>
                  <span
                    className="mt-1 block font-mono text-[10px] text-muted-foreground"
                    dir="ltr"
                  >
                    {option.id}
                  </span>
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold">معرّف نموذج مخصص</span>
              <input
                defaultValue={model}
                onBlur={(e) => setModel(e.target.value || DEFAULT_MODEL)}
                dir="ltr"
                className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="vendor/model-id"
              />
            </label>
          </Section>

          <Section
            icon={Sparkles}
            title="المهارات"
            desc="المهارات المفعّلة تُحقن في تعليمات الوكيل وتغيّر طريقة بنائه للمشاريع."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {SKILLS.map((skill) => {
                const active = skills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggle(skill.id)}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-colors",
                      active
                        ? "border-primary/50 bg-accent"
                        : "hover:border-primary/30 hover:bg-surface",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      {skill.name}
                      {active && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] text-primary-foreground">
                          مفعّلة
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
                      {skill.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            icon={Puzzle}
            title="منشئ المهارات"
            desc="عرّف مهارات خاصة بك: اسم ووصف وتعليمات يلتزم بها الوكيل حرفياً عند تفعيلها من صندوق المحادثة."
          >
            <CustomSkillsManager />
          </Section>

          <ConnectorsCatalog />

          <Section
            icon={Server}
            title="منفّذ التنفيذ (Contabo / VPS)"
            desc="اربط خادمك الخاص ليشغّل الوكيل أوامر حقيقية: npm install وbuild واختبارات وgit — ثم تعود الملفات المعدّلة تلقائياً إلى المشروع."
          >
            <ExecutorsManager />
          </Section>

          <Section
            icon={Clock}
            title="المهام المجدولة"
            desc="أوامر دورية تُدفع تلقائياً إلى طابور المنفّذ: بناء ليلي، اختبارات، نسخ احتياطي، أو أي أمر تريده يتكرر."
          >
            <SchedulesManager />
          </Section>

          <Section
            icon={Activity}
            title="صحة النظام"
            desc="حالة المنفّذات، الطابور، الإخفاقات الأخيرة، الاستهلاك، والمواقع المنشورة في لوحة واحدة."
          >
            <Link
              to="/health"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold hover:bg-surface"
            >
              فتح لوحة صحة النظام
              <ArrowRight className="size-3.5 rotate-180" />
            </Link>
          </Section>

          <Section
            icon={Wallet}
            title="الاستهلاك"
            desc="إجمالي التوكينز والتكلفة التقديرية لطلبات الوكيل."
          >
            {usage.isLoading ? (
              <p className="text-[12.5px] text-muted-foreground">جارٍ الحساب…</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="الطلبات" value={String(usage.data?.requests ?? 0)} />
                <Stat
                  label="التوكينز"
                  value={(usage.data?.totalTokens ?? 0).toLocaleString("en-US")}
                />
                <Stat
                  label="التكلفة التقديرية"
                  value={`$${(usage.data?.costUsd ?? 0).toFixed(4)}`}
                />
              </div>
            )}
          </Section>

          <Section
            icon={Github}
            title="المستودع والنشر"
            desc="رفع مساحة عمل أي مشروع إلى GitHub ونشره على رابط مباشر يتم من داخل لوحة المشروع."
          >
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors hover:bg-surface"
            >
              الذهاب إلى المشاريع
              <ArrowRight className="size-3.5 rotate-180" />
            </Link>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-surface/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-[15px] font-bold" dir="ltr">
        {value}
      </p>
    </div>
  );
}
