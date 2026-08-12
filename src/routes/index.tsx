import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
  Sparkles,
  TerminalSquare,
  Workflow,
  Zap,
  Layers,
  Eye,
  Code2,
} from "lucide-react";
import { LIFECYCLE } from "@/lib/lifecycle";

const SITE = "https://buildbuddy-ai-55.lovable.app";

export const Route = createFileRoute("/")({"component": Landing,
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
});

/* ── Data ── */

const PILLARS = [
  {
    icon: TerminalSquare,
    title: "مواصفات قبل الكود",
    desc: "يحوّل طلبك إلى مصدر حقيقة واحد: أهداف، متطلبات، قيود، ومعايير قبول.",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    icon: GitBranch,
    title: "رسم مهام لا قائمة",
    desc: "مهام لها اعتماديات ومخرجات ومعايير قبول، مرتبة بذكاء.",
    gradient: "from-violet-500/20 to-purple-500/20",
  },
  {
    icon: ShieldCheck,
    title: "تحقق بالأدلة",
    desc: "لا يعلن الإنجاز إلا بعد فحص البنية والأنماط ومراجعة مستقلة.",
    gradient: "from-emerald-500/20 to-green-500/20",
  },
];

const MODES = [
  { icon: Hammer, name: "بناء", desc: "الدورة الكاملة: مواصفات، مهام، تنفيذ، فحص، نشر.", color: "text-blue-400" },
  { icon: Search, name: "بحث", desc: "بحث حيّ على الإنترنت مع ملخّص بمراجع مرقّمة.", color: "text-emerald-400" },
  { icon: MessagesSquare, name: "استشارة", desc: "توصية صريحة وبدائل ومخاطر — بلا ملفات.", color: "text-amber-400" },
  { icon: Bot, name: "بوت تيليغرام", desc: "بوت حيّ يردّ تلقائياً مع Mini App.", color: "text-violet-400" },
];

const CAPABILITIES = [
  { icon: FileCode2, title: "مساحة ملفات كاملة", desc: "كتابة وقراءة وحذف مع إصدارات واستيراد ZIP." },
  { icon: Globe, title: "نشر مباشر", desc: "رابط عام لكل مشروع خلال ثوانٍ مع تتبّع الزيارات." },
  { icon: Database, title: "قاعدة بيانات معزولة", desc: "مخطط خاص لكل موقع مع SQL آمن." },
  { icon: ImageIcon, title: "توليد الصور", desc: "أصول بصرية تُولَّد وتُدرج مباشرة." },
  { icon: ShieldCheck, title: "فحص قبل التسليم", desc: "HTML/CSS، WCAG AA، RTL، SEO." },
  { icon: Rocket, title: "قوالب جاهزة", desc: "انطلاقة سريعة مع مهارات قابلة للتفعيل." },
];

const FAQ = [
  { q: "هل يكتب الكود فعلاً أم يخطّط فقط؟", a: "يكتب ملفات حقيقية، يفحصها، يعرضها في معاينة حيّة، ثم ينشرها." },
  { q: "ما نوع المشاريع التي يبنيها؟", a: "صفحات هبوط، متاجر، لوحات تحكم، منصات SaaS، بوتات تيليغرام." },
  { q: "هل تبقى المشاريع محفوظة؟", a: "نعم. كل محادثة ومواصفة ومهمة وملف محفوظ ويمكن العودة إليه." },
  { q: "أي نموذج ذكاء اصطناعي يستخدم؟", a: "نماذج OpenRouter بمفتاحك الخاص، قابل للتغيير من الإعدادات." },
];

const WORKFLOW_STEPS = [
  { icon: Sparkles, label: "اكتب فكرتك", desc: "صف مشروعك بجملة واحدة" },
  { icon: Layers, label: "المواصفات التلقائية", desc: "الوكيل يكتب مواصفات كاملة" },
  { icon: Code2, label: "البناء الذكي", desc: "أكواد حقيقية مع فحص مستمر" },
  { icon: Eye, label: "معاينة حية", desc: "شاهد النتيجة لحظة بلحظة" },
  { icon: Rocket, label: "نشر فوري", desc: "رابط عام جاهز للمشاركة" },
];

/* ── Scroll Reveal Hook ── */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    const children = el.querySelectorAll(".reveal-item");
    children.forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
}

/* ── Typewriter Effect ── */

function Typewriter({ texts, className }: { texts: string[]; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let textIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = texts[textIndex];
      if (!deleting) {
        el.textContent = current.slice(0, charIndex + 1);
        charIndex++;
        if (charIndex >= current.length) {
          deleting = true;
          timeout = setTimeout(tick, 2000);
          return;
        }
        timeout = setTimeout(tick, 80);
      } else {
        el.textContent = current.slice(0, charIndex - 1);
        charIndex--;
        if (charIndex <= 0) {
          deleting = false;
          textIndex = (textIndex + 1) % texts.length;
          timeout = setTimeout(tick, 400);
          return;
        }
        timeout = setTimeout(tick, 40);
      }
    };
    timeout = setTimeout(tick, 1000);
    return () => clearTimeout(timeout);
  }, [texts]);

  return (
    <span className={className}>
      <span ref={ref} />
      <span className="animate-pulse text-primary">|</span>
    </span>
  );
}

/* ── Animated Counter ── */

function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start = 0;
    const duration = 1500;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      el.textContent = `${start}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

/* ── Main Landing ── */

function Landing() {
  const revealRef = useScrollReveal();

  return (
    <div className="min-h-dvh bg-background selection:bg-primary/20" dir="rtl">
      {/* ── Inline Styles for Animations ── */}
      <style>{`
        .reveal-item {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal-item.revealed {
          opacity: 1;
          transform: translateY(0);
        }
        .reveal-item:nth-child(2) { transition-delay: 0.1s; }
        .reveal-item:nth-child(3) { transition-delay: 0.2s; }
        .reveal-item:nth-child(4) { transition-delay: 0.3s; }
        .reveal-item:nth-child(5) { transition-delay: 0.35s; }
        .reveal-item:nth-child(6) { transition-delay: 0.4s; }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-12px) rotate(1deg); }
          66% { transform: translateY(-6px) rotate(-1deg); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(160px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(160px) rotate(-360deg); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-gradient { 
          background-size: 200% 200%;
          animation: gradient-shift 8s ease infinite; 
        }
        .glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }

        .hero-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.15;
          pointer-events: none;
        }
        
        .workflow-line {
          position: absolute;
          top: 50%;
          right: 0;
          left: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, var(--color-primary) 20%, var(--color-primary) 80%, transparent 100%);
          opacity: 0.3;
        }

        .stat-card {
          position: relative;
          overflow: hidden;
        }
        .stat-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, transparent 0%, oklch(0.75 0.12 250 / 0.05) 100%);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .stat-card:hover::before {
          opacity: 1;
        }
      `}</style>

      {/* ── Background Orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="hero-glow animate-float" style={{ top: "-5%", right: "-5%", background: "oklch(0.65 0.15 250)" }} />
        <div className="hero-glow animate-float" style={{ bottom: "-5%", left: "-5%", background: "oklch(0.65 0.15 180)", animationDelay: "-3s" }} />
        <div className="hero-glow glow-pulse" style={{ top: "40%", left: "50%", transform: "translateX(-50%)", background: "oklch(0.65 0.15 300)", width: "300px", height: "300px" }} />
      </div>

      {/* ── Header ── */}
      <header className="sticky top-4 z-30 mx-auto w-full max-w-5xl px-4">
        <div className="glass-strong rounded-2xl border border-white/10 dark:border-white/5 flex items-center gap-2 px-5 py-3 shadow-lift">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.75_0.12_250/0.4)]">
            <Workflow className="size-4.5" />
          </span>
          <span className="text-[15px] font-bold tracking-wide">Weaver</span>
          <nav className="ms-auto hidden items-center gap-6 text-[13px] text-muted-foreground/80 sm:flex font-medium">
            <a href="#how-it-works" className="transition-all hover:text-foreground">كيف يعمل</a>
            <a href="#capabilities" className="transition-all hover:text-foreground">القدرات</a>
            <a href="#lifecycle" className="transition-all hover:text-foreground">دورة العمل</a>
            <a href="#faq" className="transition-all hover:text-foreground">أسئلة</a>
          </nav>
          <Link
            to="/auth"
            className="ms-auto sm:ms-0 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:shadow-[0_0_25px_oklch(0.75_0.12_250/0.4)] active:scale-95"
          >
            ابدأ مجاناً
          </Link>
        </div>
      </header>

      <main ref={revealRef} className="relative z-10 w-full">

        {/* ══════════════════════════════════════════
            HERO SECTION
        ══════════════════════════════════════════ */}
        <section className="relative pt-16 pb-20">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="reveal-item">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[12px] font-semibold text-primary">
                <Zap className="size-3.5" />
                من الفكرة إلى النشر في دقائق
              </div>
              <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-[3.2rem]">
                وكيل هندسي يبني
                <Typewriter
                  texts={["مواقع إلكترونية", "متاجر رقمية", "لوحات تحكم", "بوتات تيليغرام", "منصات SaaS"]}
                  className="block text-primary mt-1"
                />
              </h1>
              <p className="mt-6 text-[16px] leading-[1.8] text-muted-foreground max-w-lg">
                ليس مجرد ذكاء اصطناعي يقترح. Weaver يكتب المواصفات، يرسم المهام، يبني الملفات الحقيقية،
                يفحصها بدقة، ثم ينشرها — كل ذلك في محادثة واحدة.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/auth"
                  className="group inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[15px] font-bold text-primary-foreground shadow-[0_0_30px_oklch(0.75_0.12_250/0.3)] transition-all hover:shadow-[0_0_40px_oklch(0.75_0.12_250/0.5)] hover:-translate-y-0.5 active:scale-95"
                >
                  ابدأ البناء الآن
                  <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex min-h-12 items-center rounded-xl border bg-card/50 px-6 py-3 text-[15px] font-semibold transition-all hover:bg-surface"
                >
                  شاهد كيف يعمل
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-6">
                {[
                  { n: 10, s: "", label: "مراحل عمل" },
                  { n: 99, s: "%", label: "نسبة نجاح البناء" },
                  { n: 30, s: "+", label: "أداة مدمجة" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl font-extrabold text-primary">
                      <AnimatedNumber target={stat.n} suffix={stat.s} />
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Terminal Card */}
            <div className="reveal-item">
              <div className="rounded-2xl border bg-card/80 backdrop-blur-xl p-5 shadow-[0_0_60px_oklch(0.75_0.12_250/0.08)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 pb-4">
                    <span className="size-2.5 rounded-full bg-destructive/60" />
                    <span className="size-2.5 rounded-full bg-warning/70" />
                    <span className="size-2.5 rounded-full bg-success/70" />
                    <span className="ms-auto font-mono text-[10px] text-muted-foreground/60">weaver / agent-loop</span>
                  </div>
                  <ol className="space-y-2.5">
                    {[
                      { s: "SPEC", t: "كتابة مواصفات المشروع", d: "✓", done: true },
                      { s: "GRAPH", t: "12 مهمة باعتماديات", d: "✓", done: true },
                      { s: "BUILD", t: "index.html · styles.css · app.js", d: "✓", done: true },
                      { s: "VERIFY", t: "فحص البنية والوصولية", d: "✓", done: true },
                      { s: "DEPLOY", t: "نشر على رابط عام", d: "◉", done: false },
                    ].map((row, i) => (
                      <li
                        key={row.s}
                        className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-all"
                        style={{
                          background: row.done ? "oklch(0.65 0.15 150 / 0.04)" : "oklch(0.75 0.15 70 / 0.06)",
                          borderColor: row.done ? "oklch(0.65 0.15 150 / 0.15)" : "oklch(0.75 0.15 70 / 0.2)",
                          animationDelay: `${i * 0.15}s`,
                        }}
                      >
                        <span className="w-14 shrink-0 font-mono text-[10px] font-bold tracking-widest text-primary">{row.s}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px]" dir="auto">{row.t}</span>
                        <span className={row.done ? "text-success text-sm font-bold" : "text-warning text-sm animate-pulse"}>
                          {row.d}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            PILLARS
        ══════════════════════════════════════════ */}
        <section className="mx-auto w-full max-w-5xl px-5 py-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article
                key={pillar.title}
                className="reveal-item group rounded-2xl border bg-card/60 backdrop-blur-sm p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift relative overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${pillar.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative">
                  <div className="size-11 rounded-xl bg-primary/10 grid place-items-center mb-4">
                    <pillar.icon className="size-5 text-primary" />
                  </div>
                  <h2 className="text-[15px] font-bold">{pillar.title}</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{pillar.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            HOW IT WORKS — Step-by-Step
        ══════════════════════════════════════════ */}
        <section id="how-it-works" className="border-y bg-surface/30 scroll-mt-20">
          <div className="mx-auto w-full max-w-5xl px-5 py-20">
            <div className="text-center reveal-item">
              <h2 className="text-[26px] font-extrabold tracking-tight">كيف يعمل Weaver؟</h2>
              <p className="mt-3 text-[15px] text-muted-foreground max-w-xl mx-auto">
                خمس خطوات من الفكرة إلى الموقع المنشور — كل شيء يحدث تلقائياً.
              </p>
            </div>
            <div className="relative mt-14">
              <div className="workflow-line hidden lg:block" />
              <div className="grid gap-6 sm:grid-cols-5">
                {WORKFLOW_STEPS.map((step, i) => (
                  <div key={step.label} className="reveal-item text-center relative">
                    <div className="mx-auto size-16 rounded-2xl bg-card border shadow-soft grid place-items-center mb-4 transition-all duration-300 hover:shadow-[0_0_30px_oklch(0.75_0.12_250/0.2)] hover:scale-105 relative z-10">
                      <step.icon className="size-6 text-primary" />
                    </div>
                    <div className="absolute -top-2 -start-2 size-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold grid place-items-center z-20">
                      {i + 1}
                    </div>
                    <h3 className="text-[14px] font-bold">{step.label}</h3>
                    <p className="mt-1 text-[12px] text-muted-foreground">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CAPABILITIES
        ══════════════════════════════════════════ */}
        <section id="capabilities" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-5xl px-5 py-20">
            <div className="reveal-item">
              <h2 className="text-[26px] font-extrabold tracking-tight">قدرات المنصة</h2>
              <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
                أدوات تنفيذ حقيقية بيد الوكيل — لا اقتراحات نصية فقط.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => (
                <div
                  key={cap.title}
                  className="reveal-item stat-card group rounded-2xl border bg-card/60 backdrop-blur-sm p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_oklch(0.75_0.12_250/0.08)] hover:border-primary/20"
                >
                  <span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                    <cap.icon className="size-5" />
                  </span>
                  <h3 className="mb-2 text-[15px] font-bold">{cap.title}</h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{cap.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            OPERATING MODES
        ══════════════════════════════════════════ */}
        <section className="border-y bg-surface/30">
          <div className="mx-auto w-full max-w-5xl px-5 py-20">
            <div className="reveal-item">
              <h2 className="text-[26px] font-extrabold tracking-tight">أربعة أوضاع تشغيل</h2>
              <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
                بدّل سلوك الوكيل حسب ما تحتاجه — بضغطة واحدة.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MODES.map((mode) => (
                <article
                  key={mode.name}
                  className="reveal-item group rounded-2xl border bg-card/60 backdrop-blur-sm p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
                >
                  <mode.icon className={`size-6 ${mode.color} transition-transform group-hover:scale-110`} />
                  <h3 className="mt-4 text-[15px] font-bold">{mode.name}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{mode.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            LIFECYCLE
        ══════════════════════════════════════════ */}
        <section id="lifecycle" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-5xl px-5 py-20">
            <div className="reveal-item">
              <h2 className="text-[26px] font-extrabold tracking-tight">دورة العمل الكاملة</h2>
              <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
                عشر مراحل إلزامية لا يتجاوزها الوكيل — وكل مرحلة تترك أثراً محفوظاً.
              </p>
            </div>
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LIFECYCLE.map((stage, index) => (
                <li key={stage.id} className="reveal-item group rounded-2xl border bg-card/60 backdrop-blur-sm px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft hover:border-primary/20">
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-[11px] font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {index + 1}
                    </span>
                    <span className="text-[14px] font-bold">{stage.label}</span>
                    <span className="ms-auto font-mono text-[9px] tracking-widest text-muted-foreground/60">{stage.en}</span>
                  </div>
                  <p className="mt-2 ps-11 text-[12.5px] leading-relaxed text-muted-foreground">{stage.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            FAQ
        ══════════════════════════════════════════ */}
        <section id="faq" className="border-t bg-surface/30 scroll-mt-20">
          <div className="mx-auto w-full max-w-3xl px-5 py-20">
            <div className="text-center reveal-item">
              <h2 className="text-[26px] font-extrabold tracking-tight">أسئلة شائعة</h2>
            </div>
            <div className="mt-10 space-y-3">
              {FAQ.map((item) => (
                <details
                  key={item.q}
                  className="reveal-item group rounded-2xl border bg-card/60 backdrop-blur-sm shadow-soft transition-all hover:shadow-lift open:shadow-lift"
                >
                  <summary className="cursor-pointer list-none px-6 py-4 text-[15px] font-semibold flex items-center gap-3">
                    {item.q}
                    <ArrowLeft className="size-4 ms-auto text-muted-foreground transition-transform group-open:rotate-90 shrink-0" />
                  </summary>
                  <p className="px-6 pb-5 text-[14px] leading-[1.8] text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CTA
        ══════════════════════════════════════════ */}
        <section className="mx-auto w-full max-w-5xl px-5 pb-24 pt-8">
          <div className="reveal-item rounded-3xl border bg-card/80 backdrop-blur-xl p-10 text-center shadow-[0_0_80px_oklch(0.75_0.12_250/0.08)] relative overflow-hidden sm:p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
            <div className="absolute inset-0 grid-paper opacity-30 pointer-events-none" />
            <div className="relative">
              <h2 className="text-[28px] font-extrabold tracking-tight">
                جاهز لتحويل فكرة إلى موقع منشور؟
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[1.8] text-muted-foreground">
                اكتب طلبك بجملة واحدة، ودع Weaver يكتب المواصفات ويبني الملفات ويفحصها وينشرها.
              </p>
              <Link
                to="/auth"
                className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-[16px] font-bold text-primary-foreground shadow-[0_0_40px_oklch(0.75_0.12_250/0.3)] transition-all hover:shadow-[0_0_60px_oklch(0.75_0.12_250/0.5)] hover:-translate-y-0.5 active:scale-95"
              >
                ابدأ البناء الآن
                <ArrowLeft className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t bg-surface/30">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-5 py-8">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Workflow className="size-3.5" />
          </span>
          <span className="text-[14px] font-bold">Weaver</span>
          <span className="text-[13px] text-muted-foreground">
            وكيل هندسي — من الطلب إلى النشر.
          </span>
          <span className="ms-auto font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
