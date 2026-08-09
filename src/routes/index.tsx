import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Database,
  FileCode2,
  GitBranch,
  Globe,
  Hammer,
  Image as ImageIcon,
  MessagesSquare,
  Rocket,
  Search,
  ShieldCheck,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { LIFECYCLE } from "@/lib/lifecycle";

const SITE = "https://buildbuddy-ai-55.lovable.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Weaver — وكيل هندسي يبني ويتحقق ويطلق" },
      {
        name: "description",
        content:
          "منصة وكيل هندسي بدورة عمل كاملة: استقبال المتطلبات، مواصفات، رسم مهام باعتماديات، تنفيذ، تحقق بالأدلة، مراجعة ونشر مباشر.",
      },
      { property: "og:title", content: "Weaver — وكيل هندسي يبني ويتحقق ويطلق" },
      {
        property: "og:description",
        content: "من الطلب إلى النشر: مواصفات، رسم مهام باعتماديات، وتحقق بالأدلة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE}/` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Weaver",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          url: `${SITE}/`,
          description:
            "وكيل هندسي بدورة عمل كاملة: مواصفات، رسم مهام باعتماديات، تنفيذ، تحقق بالأدلة، ونشر.",
        }),
      },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: TerminalSquare,
    title: "مواصفات قبل الكود",
    desc: "يحوّل طلبك إلى مصدر حقيقة واحد: أهداف، متطلبات، قيود، ومعايير قبول محفوظة بإصدارات.",
  },
  {
    icon: GitBranch,
    title: "رسم مهام لا قائمة",
    desc: "مهام لها اعتماديات ومخرجات ومعايير قبول، وحالة محفوظة لكل مهمة في حسابك.",
  },
  {
    icon: ShieldCheck,
    title: "تحقق بالأدلة",
    desc: "لا يعلن الإنجاز إلا بعد فحص البنية والأنماط ومراجعة مستقلة قبل النشر.",
  },
];

const MODES = [
  { icon: Hammer, name: "بناء", desc: "الدورة الكاملة: مواصفات، مهام، ملفات فعلية، فحص، ثم نشر." },
  { icon: Search, name: "بحث", desc: "بحث حيّ على الإنترنت، قراءة المصادر، وملخّص بمراجع مرقّمة." },
  { icon: MessagesSquare, name: "استشارة", desc: "توصية صريحة وبدائل ومخاطر وخطوة تالية — بلا ملفات." },
  { icon: Bot, name: "بوت تيليغرام", desc: "توكن BotFather → بوت حيّ يردّ تلقائياً، مع Mini App." },
];

const CAPABILITIES = [
  { icon: FileCode2, title: "مساحة ملفات كاملة", desc: "كتابة وقراءة وحذف الملفات مع إصدارات لكل تعديل واستيراد ملفات ZIP وإصلاحها." },
  { icon: Globe, title: "نشر مباشر", desc: "رابط عام لكل مشروع خلال ثوانٍ، مع تتبّع الزيارات." },
  { icon: Database, title: "قاعدة بيانات لكل مشروع", desc: "مخطط معزول لكل موقع مع فحص وتنفيذ SQL واستعلامات آمنة." },
  { icon: ImageIcon, title: "توليد الصور", desc: "أصول بصرية تُولَّد وتُدرج داخل المشروع مباشرة." },
  { icon: ShieldCheck, title: "فحص قبل التسليم", desc: "معايير HTML/CSS، وصولية WCAG AA، RTL، وSEO — تُفحص قبل النشر." },
  { icon: Rocket, title: "قوالب وانطلاقة سريعة", desc: "قوالب جاهزة ومهارات قابلة للتفعيل حسب نوع المشروع." },
];

const FAQ = [
  {
    q: "هل يكتب الكود فعلاً أم يخطّط فقط؟",
    a: "يكتب ملفات حقيقية في مساحة عمل المشروع، يفحصها، يعرضها في معاينة حيّة، ثم ينشرها على رابط عام.",
  },
  {
    q: "ما نوع المشاريع التي يبنيها؟",
    a: "صفحات هبوط، متاجر، لوحات تحكم، منصات SaaS، بوتات تيليغرام و Mini Apps، وأدوات داخلية.",
  },
  {
    q: "هل تبقى المشاريع محفوظة؟",
    a: "نعم. كل محادثة ومواصفة ومهمة وملف محفوظ في قاعدة البيانات، ويمكن العودة إليه في أي وقت.",
  },
  {
    q: "أي نموذج ذكاء اصطناعي يستخدم؟",
    a: "نماذج OpenRouter بمفتاحك الخاص، والنموذج قابل للتغيير من لوحة الإعدادات.",
  },
];

function Landing() {
  return (
    <div className="min-h-dvh" dir="rtl">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-5 py-3.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-4" />
          </span>
          <span className="text-sm font-bold">Weaver</span>
          <nav className="ms-6 hidden items-center gap-5 text-[13px] text-muted-foreground sm:flex">
            <a href="#capabilities" className="transition-colors hover:text-foreground">
              القدرات
            </a>
            <a href="#lifecycle" className="transition-colors hover:text-foreground">
              دورة العمل
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              أسئلة
            </a>
          </nav>
          <Link
            to="/auth"
            className="ms-auto rounded-xl border bg-card px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-surface"
          >
            الدخول
          </Link>
        </div>
      </header>

      <main className="w-full">
        <section className="grid-paper border-b">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-accent px-3 py-1 font-mono text-[10px] tracking-widest text-accent-foreground">
                INTAKE → SPEC → GRAPH → VERIFY → DEPLOY
              </span>
              <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-[2.9rem]">
                وكيل هندسي يخطّط وينفّذ ويتحقق
                <span className="block text-primary">قبل أن يقول: انتهيت.</span>
              </h1>
              <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                القوة ليست في عدد الوكلاء، بل في التنسيق والحالة والأدوات والتحقق. Weaver يحفظ كل
                مشروع ومواصفاته ورسم مهامه وسجل تنفيذه، ويقودك من الطلب إلى النشر والمراقبة.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground shadow-lift transition-transform hover:-translate-y-0.5"
                >
                  ابدأ الآن
                  <ArrowLeft className="size-4" />
                </Link>
                <a
                  href="#capabilities"
                  className="inline-flex min-h-11 items-center rounded-xl border bg-card px-5 py-3 text-[14px] font-semibold transition-colors hover:bg-surface"
                >
                  شاهد ما يستطيع فعله
                </a>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
                {["ملفات حقيقية", "معاينة حيّة", "نشر بضغطة", "قاعدة بيانات لكل مشروع"].map(
                  (item) => (
                    <li key={item} className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-success" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-lift">
              <div className="flex items-center gap-1.5 pb-3">
                <span className="size-2.5 rounded-full bg-destructive/60" />
                <span className="size-2.5 rounded-full bg-warning/70" />
                <span className="size-2.5 rounded-full bg-success/70" />
                <span className="ms-auto font-mono text-[10px] text-muted-foreground">
                  weaver / agent-loop
                </span>
              </div>
              <ol className="space-y-2">
                {[
                  { s: "SPEC", t: "كتابة مواصفات المشروع", d: "تم" },
                  { s: "GRAPH", t: "12 مهمة باعتماديات", d: "تم" },
                  { s: "WRITE", t: "index.html · styles.css · app.js", d: "تم" },
                  { s: "VERIFY", t: "فحص البنية والوصولية", d: "تم" },
                  { s: "DEPLOY", t: "نشر على رابط عام", d: "جارٍ" },
                ].map((row) => (
                  <li
                    key={row.s}
                    className="flex items-center gap-3 rounded-lg border bg-surface/60 px-3 py-2.5"
                  >
                    <span className="w-16 shrink-0 font-mono text-[10px] font-bold tracking-widest text-primary">
                      {row.s}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]" dir="auto">
                      {row.t}
                    </span>
                    <span
                      className={
                        row.d === "تم"
                          ? "rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
                          : "rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning"
                      }
                    >
                      {row.d}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 py-16">
          <div className="grid gap-3 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article key={pillar.title} className="rounded-xl border bg-card p-5 shadow-soft">
                <pillar.icon className="size-5 text-primary" />
                <h2 className="mt-3 text-[14px] font-bold">{pillar.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {pillar.desc}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="capabilities" className="border-y bg-surface/40 scroll-mt-20">
          <div className="mx-auto w-full max-w-5xl px-5 py-16">
            <h2 className="text-[22px] font-bold tracking-tight">قدرات المنصة</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              أدوات تنفيذ حقيقية بيد الوكيل — لا اقتراحات نصية فقط.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => (
                <article key={cap.title} className="rounded-xl border bg-card p-5 shadow-soft">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <cap.icon className="size-4" />
                  </span>
                  <h3 className="mt-3 text-[14px] font-bold">{cap.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {cap.desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 py-16">
          <h2 className="text-[22px] font-bold tracking-tight">أربعة أوضاع تشغيل</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            بدّل سلوك الوكيل من أسفل صندوق الكتابة حسب ما تحتاجه الآن.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODES.map((mode) => (
              <article
                key={mode.name}
                className="rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift"
              >
                <mode.icon className="size-5 text-primary" />
                <h3 className="mt-3 text-[14px] font-bold">{mode.name}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {mode.desc}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="lifecycle" className="border-y bg-surface/40 scroll-mt-20">
          <div className="mx-auto w-full max-w-5xl px-5 py-16">
            <h2 className="text-[22px] font-bold tracking-tight">دورة العمل الكاملة</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
              عشر مراحل إلزامية لا يتجاوزها الوكيل، وكل مرحلة تترك أثراً محفوظاً.
            </p>
            <ol className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {LIFECYCLE.map((stage, index) => (
                <li key={stage.id} className="rounded-xl border bg-card px-4 py-3.5 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-[10px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-[13px] font-bold">{stage.label}</span>
                    <span className="ms-auto font-mono text-[9px] tracking-widest text-muted-foreground">
                      {stage.en}
                    </span>
                  </div>
                  <p className="mt-1.5 ps-9 text-[12.5px] leading-relaxed text-muted-foreground">
                    {stage.desc}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="faq" className="mx-auto w-full max-w-3xl px-5 py-16 scroll-mt-20">
          <h2 className="text-[22px] font-bold tracking-tight">أسئلة شائعة</h2>
          <div className="mt-6 divide-y rounded-2xl border bg-card shadow-soft">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none text-[14px] font-semibold marker:hidden">
                  <span className="inline-flex w-full items-center gap-3">
                    {item.q}
                    <span className="ms-auto text-muted-foreground transition-transform group-open:rotate-90">
                      <ArrowLeft className="size-4" />
                    </span>
                  </span>
                </summary>
                <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 pb-20">
          <div className="grid-paper rounded-2xl border bg-card p-8 text-center shadow-lift sm:p-12">
            <h2 className="text-[22px] font-bold tracking-tight">جاهز لتحويل فكرة إلى موقع منشور؟</h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              اكتب طلبك بجملة واحدة، ودع Weaver يكتب المواصفات ويبني الملفات ويفحصها وينشرها.
            </p>
            <Link
              to="/auth"
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground shadow-lift transition-transform hover:-translate-y-0.5"
            >
              ابدأ الآن
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t bg-surface/40">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-5 py-6">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-3.5" />
          </span>
          <span className="text-[13px] font-bold">Weaver</span>
          <span className="text-[12px] text-muted-foreground">وكيل هندسي — من الطلب إلى النشر.</span>
          <span className="ms-auto font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
