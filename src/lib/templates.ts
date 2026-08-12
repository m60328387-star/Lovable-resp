import { PREMIUM_CSS_TEMPLATE, generateBrandCSS } from "./design-system";

export type StarterTemplate = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  files: { path: string; content: string }[];
};

const BASE_CSS = PREMIUM_CSS_TEMPLATE + `
.site-header { position: sticky; top: 0; z-index: 40; background: rgba(15, 15, 35, 0.7); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.05); }
.nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 80px; }
.nav ul { display: flex; gap: 32px; list-style: none; font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.7); }
.nav ul a:hover { color: #fff; }
.brand { font-weight: 800; font-size: 24px; background: linear-gradient(to right, var(--color-primary), var(--color-secondary)); -webkit-background-clip: text; color: transparent; }
.hero { padding: 120px 0 80px; display: grid; gap: 40px; grid-template-columns: 1fr; align-items: center; position: relative; }
.hero::before { content: ""; position: absolute; width: 600px; height: 600px; background: var(--color-primary); filter: blur(150px); opacity: 0.15; top: 0; right: -100px; z-index: -1; border-radius: 50%; }
.hero h1 { font-size: clamp(40px, 6vw, 72px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 24px; }
.hero p { color: rgba(255,255,255,0.7); font-size: 20px; max-width: 50ch; margin-bottom: 40px; line-height: 1.6; }
.hero-actions { display: flex; gap: 16px; flex-wrap: wrap; }
.section { padding: 100px 0; }
.section-title { font-size: clamp(32px, 4vw, 48px); font-weight: 800; margin-bottom: 16px; text-align: center; }
.section-sub { color: rgba(255,255,255,0.7); margin-bottom: 64px; max-width: 60ch; text-align: center; margin-inline: auto; font-size: 18px; }
.grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.site-footer { border-top: 1px solid rgba(255,255,255,0.1); padding: 48px 0; color: rgba(255,255,255,0.5); font-size: 14px; text-align: center; }
@media(min-width: 900px) { .hero { grid-template-columns: 1.1fr 0.9fr; } }
`;


function page(title: string, body: string, extraHead = "") {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${title}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="theme.css">
<link rel="stylesheet" href="styles.css">
${extraHead}</head>
<body>
${body}
<script src="app.js"></script>
</body>
</html>
`;
}

const HEADER = `<header class="site-header"><div class="container nav">
  <a href="index.html" class="brand">العلامة</a>
  <ul><li><a href="#features">المزايا</a></li><li><a href="#pricing">الأسعار</a></li><li><a href="#contact">تواصل</a></li></ul>
  <a class="btn" href="#contact">ابدأ الآن</a>
</div></header>`;

const FOOTER = `<footer class="site-footer"><div class="container">© <span id="year"></span> جميع الحقوق محفوظة.</div></footer>`;

const APP_JS = `document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });
});
`;

function baseFiles(body: string) {
  return [
    { path: "index.html", content: page("موقع جديد — Weaver", body) },
    { path: "theme.css", content: generateBrandCSS("midnight") },
    { path: "styles.css", content: BASE_CSS },
    { path: "app.js", content: APP_JS },
  ];
}

const LANDING_BODY = `${HEADER}
<main>
  <section class="container hero">
    <div>
      <h1>عنوان رئيسي يشرح القيمة في سطر واحد</h1>
      <p>وصف قصير يوضّح لمن هذا المنتج وما المشكلة التي يحلّها، بلغة بسيطة ومباشرة. صمم ليجذب الانتباه ويعطي طابعاً احترافياً.</p>
      <div class="hero-actions"><a class="btn" href="#pricing">جرّب مجانًا</a><a class="btn ghost" href="#features">اعرف أكثر</a></div>
    </div>
    <div class="card glass-strong" style="height: 400px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0));">
      <div style="text-align: center;">
        <h3 style="font-size: 24px; margin-bottom: 12px;">لقطة من المنتج</h3>
        <p style="color: rgba(255,255,255,0.5);">واجهة مبهرة بتأثير زجاجي</p>
      </div>
    </div>
  </section>
  <section id="features" class="section container">
    <h2 class="section-title">لماذا نحن</h2>
    <p class="section-sub">ثلاث مزايا واضحة تُترجم إلى نتائج ملموسة. صممت بعناية لتجربة مستخدم لا مثيل لها.</p>
    <div class="grid">
      <article class="card glass-medium">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--color-primary); margin-bottom: 24px; display: flex; align-items: center; justify-content: center;">⚡</div>
        <h3 style="font-size: 20px; margin-bottom: 12px;">سرعة البرق</h3>
        <p style="color: rgba(255,255,255,0.7); line-height: 1.6;">أداء عالٍ وتجربة سلسة على كل الأجهزة، مبنية بأحدث التقنيات لضمان أقصى سرعة استجابة.</p>
      </article>
      <article class="card glass-medium">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--color-secondary); margin-bottom: 24px; display: flex; align-items: center; justify-content: center;">🛡️</div>
        <h3 style="font-size: 20px; margin-bottom: 12px;">أمان مطلق</h3>
        <p style="color: rgba(255,255,255,0.7); line-height: 1.6;">بنية مستقرة مع تشفير متقدم ومراقبة مستمرة، لتبقى بياناتك في أمان تام.</p>
      </article>
      <article class="card glass-medium">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--color-accent); margin-bottom: 24px; display: flex; align-items: center; justify-content: center;">💎</div>
        <h3 style="font-size: 20px; margin-bottom: 12px;">تصميم فاخر</h3>
        <p style="color: rgba(255,255,255,0.7); line-height: 1.6;">واجهات مصممة بعناية فائقة، بتأثيرات زجاجية وتفاعلات سلسة تبهج المستخدم.</p>
      </article>
    </div>
  </section>
  <section id="pricing" class="section container">
    <h2 class="section-title">الأسعار</h2>
    <p class="section-sub">خطط مرنة تناسب جميع الاحتياجات، بدون مفاجآت.</p>
    <div class="grid">
      <article class="card glass-light" style="display: flex; flex-direction: column;">
        <h3 style="font-size: 24px; margin-bottom: 8px;">الأساسي</h3>
        <p style="color: rgba(255,255,255,0.7); margin-bottom: 24px;">للبدء والتجربة.</p>
        <div style="font-size: 40px; font-weight: 800; margin-bottom: 24px;">مجانًا</div>
        <ul style="list-style: none; margin-bottom: 32px; flex-grow: 1;">
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> ميزة أولى</li>
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> ميزة ثانية</li>
        </ul>
        <a class="btn ghost" href="#" style="width: 100%;">اختر الخطة</a>
      </article>
      <article class="card glass-strong" style="display: flex; flex-direction: column; transform: scale(1.05); border-color: var(--color-primary);">
        <div style="background: var(--color-primary); color: #fff; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; align-self: flex-start; margin-bottom: 16px;">الأكثر شعبية</div>
        <h3 style="font-size: 24px; margin-bottom: 8px;">الاحترافي</h3>
        <p style="color: rgba(255,255,255,0.7); margin-bottom: 24px;">للفرق النامية.</p>
        <div style="font-size: 40px; font-weight: 800; margin-bottom: 24px;">$49<span style="font-size: 16px; font-weight: 400; color: rgba(255,255,255,0.5);">/شهر</span></div>
        <ul style="list-style: none; margin-bottom: 32px; flex-grow: 1;">
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> كل ما في الأساسي</li>
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> دعم فني مميز</li>
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> ميزات متقدمة</li>
        </ul>
        <a class="btn" href="#" style="width: 100%;">اشترك الآن</a>
      </article>
      <article class="card glass-light" style="display: flex; flex-direction: column;">
        <h3 style="font-size: 24px; margin-bottom: 8px;">الشركات</h3>
        <p style="color: rgba(255,255,255,0.7); margin-bottom: 24px;">حسب الحاجة المخصصة.</p>
        <div style="font-size: 40px; font-weight: 800; margin-bottom: 24px;">مخصص</div>
        <ul style="list-style: none; margin-bottom: 32px; flex-grow: 1;">
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> كل ما في الاحترافي</li>
          <li style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span style="color: var(--color-primary);">✓</span> مدير حساب مخصص</li>
        </ul>
        <a class="btn ghost" href="#" style="width: 100%;">تواصل معنا</a>
      </article>
    </div>
  </section>
  <section id="contact" class="section container">
    <div class="card glass-medium" style="text-align: center; max-width: 600px; margin: 0 auto; padding: 48px;">
      <h2 class="section-title" style="margin-bottom: 16px;">مستعد للبدء؟</h2>
      <p style="color: rgba(255,255,255,0.7); margin-bottom: 32px; font-size: 18px;">انضم إلى آلاف المستخدمين الذين يثقون بنا كل يوم.</p>
      <a class="btn" href="mailto:hello@example.com" style="font-size: 18px; padding: 16px 32px;">تواصل معنا الآن</a>
    </div>
  </section>
</main>
${FOOTER}`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "landing",
    title: "صفحة هبوط لمنتج",
    description: "هيكل تسويقي كامل: هيرو، مزايا، أسعار، تواصل — RTL جاهز.",
    prompt:
      "ابنِ صفحة هبوط احترافية لمنتج SaaS عربي، انطلاقًا من القالب الموجود في مساحة العمل: طوّر المحتوى والتصميم، أضف قسم آراء العملاء وأسئلة شائعة، ثم شغّل run_checks وانشر.",
    files: baseFiles(LANDING_BODY),
  },
  {
    id: "corporate",
    title: "موقع شركة متعدد الصفحات",
    description: "index / about / services / contact بتنسيق موحّد.",
    prompt:
      "طوّر موقع شركة عربي متعدد الصفحات انطلاقًا من القالب: أكمل صفحات من نحن والخدمات والتواصل بمحتوى واقعي وتصميم موحّد، ثم شغّل run_checks وانشر.",
    files: [
      ...baseFiles(LANDING_BODY),
      {
        path: "about.html",
        content: page(
          "من نحن",
          `${HEADER}<main class="section container"><h1 class="section-title">من نحن</h1><p class="section-sub">قصة الشركة ورسالتها.</p></main>${FOOTER}`,
        ),
      },
      {
        path: "services.html",
        content: page(
          "خدماتنا",
          `${HEADER}<main class="section container"><h1 class="section-title">خدماتنا</h1><div class="grid"><article class="card"><h3>خدمة أولى</h3><p>وصف.</p></article><article class="card"><h3>خدمة ثانية</h3><p>وصف.</p></article></div></main>${FOOTER}`,
        ),
      },
      {
        path: "contact.html",
        content: page(
          "تواصل معنا",
          `${HEADER}<main class="section container"><h1 class="section-title">تواصل معنا</h1><form class="card glass-medium" style="max-width:500px; margin:0 auto;"><label for="email" style="display:block; margin-bottom:8px;">بريدك</label><input id="email" type="email" required style="width:100%;padding:12px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;background:rgba(0,0,0,0.2);color:#fff;outline:none;"><button class="btn" type="submit" style="width:100%">إرسال</button></form></main>${FOOTER}`,
        ),
      },
    ],
  },
  {
    id: "portfolio",
    title: "ملف أعمال شخصي",
    description: "بروفايل، مشاريع، مهارات، وتواصل.",
    prompt:
      "طوّر موقع ملف أعمال شخصي عربي انطلاقًا من القالب: أضف قسم المشاريع بشبكة بطاقات، وقسم المهارات والسيرة، ثم شغّل run_checks وانشر.",
    files: baseFiles(
      `${HEADER}<main><section class="container hero"><div><h1>مرحبًا، أنا…</h1><p>مطوّر/مصمّم أبني منتجات رقمية.</p><div class="hero-actions"><a class="btn" href="#work">أعمالي</a></div></div><div class="card"><h3>صورة</h3><p>ضع صورتك هنا.</p></div></section><section id="work" class="section container"><h2 class="section-title">مشاريع مختارة</h2><div class="grid"><article class="card"><h3>مشروع 1</h3><p>وصف مختصر.</p></article><article class="card"><h3>مشروع 2</h3><p>وصف مختصر.</p></article></div></section></main>${FOOTER}`,
    ),
  },
  {
    id: "dashboard",
    title: "لوحة تحكم بيانات",
    description: "تخطيط لوحة مع بطاقات مؤشرات ورسم بياني (ApexCharts).",
    prompt:
      "طوّر لوحة تحكم عربية انطلاقًا من القالب: أضف مؤشرات وجداول ورسومًا بيانية عبر ApexCharts مع بيانات تجريبية، ثم شغّل run_checks وانشر.",
    files: [
      {
        path: "index.html",
        content: page(
          "لوحة التحكم",
          `${HEADER}<main class="section container"><h1 class="section-title">نظرة عامة</h1><div class="grid"><article class="card"><h3>المستخدمون</h3><p>1,284</p></article><article class="card"><h3>الإيراد</h3><p>42,900 ر.س</p></article><article class="card"><h3>معدل التحويل</h3><p>3.4%</p></article></div><div class="card" style="margin-top:20px"><h3>النمو الشهري</h3><div id="chart"></div></div></main>${FOOTER}`,
          `<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>\n`,
        ),
      },
      { path: "styles.css", content: BASE_CSS },
      {
        path: "app.js",
        content: `${APP_JS}
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('chart');
  if (!el || typeof ApexCharts === 'undefined') return;
  new ApexCharts(el, {
    chart: { type: 'area', height: 300, fontFamily: 'IBM Plex Sans Arabic', toolbar: { show: false } },
    colors: ['#0d9488'],
    series: [{ name: 'الإيراد', data: [12, 19, 15, 27, 34, 42] }],
    xaxis: { categories: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'] },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
  }).render();
});
`,
      },
    ],
  },
];

/* ==================== مكتبة القوالب الموسّعة (لوحات وأشكال مختلفة) ==================== */

type Palette = {
  bg: string;
  card: string;
  fg: string;
  muted: string;
  brand: string;
  brandDark: string;
  border: string;
  radius: string;
};

const PALETTES: Record<string, Palette> = {
  sand: {
    bg: "#FAF7F2",
    card: "#F1EAE0",
    fg: "#1C1917",
    muted: "#7C6F64",
    brand: "#B45309",
    brandDark: "#92400E",
    border: "#E7DCCB",
    radius: "20px",
  },
  ocean: {
    bg: "#071B2C",
    card: "#0E2E47",
    fg: "#E6F1F7",
    muted: "#93B2C6",
    brand: "#22B8CF",
    brandDark: "#1197AC",
    border: "#17405F",
    radius: "14px",
  },
  emerald: {
    bg: "#04231A",
    card: "#083A2B",
    fg: "#EAF6F0",
    muted: "#96BCAB",
    brand: "#10B981",
    brandDark: "#059669",
    border: "#0D4B37",
    radius: "18px",
  },
  ink: {
    bg: "#F6F5F1",
    card: "#EDEBE4",
    fg: "#111111",
    muted: "#6B6B6B",
    brand: "#C2410C",
    brandDark: "#9A3412",
    border: "#DFDCD2",
    radius: "6px",
  },
  clay: {
    bg: "#FBF7F4",
    card: "#F1E7DF",
    fg: "#26201C",
    muted: "#7A6A5F",
    brand: "#C4654A",
    brandDark: "#A24F38",
    border: "#E7D9CE",
    radius: "24px 6px 24px 6px",
  },
  frost: {
    bg: "#F4F9FD",
    card: "#E6F0F8",
    fg: "#0B2233",
    muted: "#5C7C93",
    brand: "#2E6B8A",
    brandDark: "#21526B",
    border: "#D3E4F0",
    radius: "16px",
  },
};

/** ورقة أنماط القالب مع لوحة اللون المختارة وطبقة أشكال خفيفة. */
function themedCss(key: keyof typeof PALETTES, pattern: string) {
  // Use the new design system for themed templates as well.
  // Assuming mapped to royal for event, ocean for..., etc. We can just use generateBrandCSS if key matches, or generate custom tokens
  // For now, we return PREMIUM_CSS_TEMPLATE + our themed properties
  return `${BASE_CSS}
.themed-override { display: none; }
`;
}

const MESH = `background:radial-gradient(60% 60% at 20% 20%, color-mix(in oklab, var(--brand) 22%, transparent), transparent 70%), radial-gradient(50% 50% at 85% 10%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 70%)`;
const DOTS = `background-image:radial-gradient(currentColor 1px, transparent 1px);background-size:22px 22px;opacity:.07`;
const GRID = `background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:48px 48px;opacity:.5`;

const SPRITE = `<svg style="display:none" aria-hidden="true">
<symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></symbol>
<symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 6l9 7 9-7"/></symbol>
</svg>`;

const icon = (id: string, label: string) =>
  `<svg class="ico" aria-hidden="true"><use href="#i-${id}"></use></svg><span class="sr-only">${label}</span>`;

const REVEAL_JS = `${APP_JS}
document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10%' });
  items.forEach((el) => io.observe(el));
});
`;

function themedFiles(title: string, palette: keyof typeof PALETTES, pattern: string, body: string) {
  // Map our old palettes to the new design tokens if possible, or just use ocean/midnight as default.
  const newPaletteMap: Record<string, "midnight" | "ocean" | "forest" | "sunset" | "royal"> = {
    sand: "sunset",
    ocean: "ocean",
    emerald: "forest",
    ink: "midnight",
    clay: "sunset",
    frost: "ocean"
  };
  
  const mappedPalette = newPaletteMap[palette as string] || "midnight";

  return [
    { path: "index.html", content: page(title, `${SPRITE}\n${body}`) },
    { path: "theme.css", content: generateBrandCSS(mappedPalette) },
    { path: "styles.css", content: BASE_CSS + `\n.reveal{opacity:0;transform:translateY(18px);transition:opacity .5s ease, transform .5s ease}\n.reveal.in{opacity:1;transform:none}\n` },
    { path: "app.js", content: REVEAL_JS },
  ];
}

const STORE_BODY = `${HEADER}
<main>
  <section class="container hero"><div><h1>منتجات مختارة بعناية</h1><p>مجموعة محدودة، جودة عالية، وشحن سريع لكل المدن.</p><div class="hero-actions"><a class="btn" href="#products">تسوّق الآن</a><a class="btn ghost" href="#faq">الأسئلة الشائعة</a></div></div><div class="card reveal"><h3>${icon("star", "مميز")} الأكثر مبيعاً</h3><p>ضع هنا صورة المنتج البارز مع السعر.</p></div></section>
  <section id="products" class="section container"><h2 class="section-title">المنتجات</h2><p class="section-sub">شبكة بطاقات بأسعار واضحة وزر شراء لكل منتج.</p><div class="grid"><article class="card reveal"><h3>منتج أول</h3><p>120 ر.س</p><a class="btn" href="#">أضف للسلة</a></article><article class="card reveal"><h3>منتج ثانٍ</h3><p>180 ر.س</p><a class="btn" href="#">أضف للسلة</a></article><article class="card reveal"><h3>منتج ثالث</h3><p>240 ر.س</p><a class="btn" href="#">أضف للسلة</a></article></div></section>
  <section class="band"><div class="container section" style="display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"><div><div class="stat">+12k</div><p>طلب مكتمل</p></div><div><div class="stat">4.9</div><p>تقييم العملاء</p></div><div><div class="stat">48h</div><p>متوسط التوصيل</p></div></div></section>
  <section id="faq" class="section container"><h2 class="section-title">أسئلة شائعة</h2><details class="faq"><summary>ما مدة الشحن؟</summary><p>من يومين إلى أربعة أيام عمل.</p></details><details class="faq"><summary>هل الإرجاع متاح؟</summary><p>نعم خلال 14 يوماً.</p></details></section>
</main>${FOOTER}`;

const RESTAURANT_BODY = `${HEADER}
<main>
  <section class="container hero"><div><h1>مطبخ يعيد تعريف المذاق</h1><p>قائمة موسمية بمكوّنات طازجة، وأجواء تستحق الزيارة.</p><div class="hero-actions"><a class="btn" href="#menu">تصفّح القائمة</a><a class="btn ghost" href="#book">احجز طاولة</a></div></div><div class="card reveal"><h3>${icon("clock", "الدوام")} مفتوح يومياً</h3><p>12 ظهراً — 12 منتصف الليل</p></div></section>
  <section id="menu" class="section container"><h2 class="section-title">القائمة</h2><div class="rail"><article class="card">مقبّلات</article><article class="card">أطباق رئيسية</article><article class="card">حلويات</article><article class="card">مشروبات</article></div></section>
  <section id="book" class="section container"><h2 class="section-title">احجز طاولة</h2><form class="card"><label for="d">التاريخ</label><input id="d" type="date" style="width:100%;padding:12px;margin:10px 0;border:1px solid var(--border);border-radius:12px"><button class="btn" type="submit">تأكيد الحجز</button></form></section>
</main>${FOOTER}`;

const REALESTATE_BODY = `${HEADER}
<main>
  <section class="container hero"><div><h1>عقارات مختارة في أفضل المواقع</h1><p>ابحث، قارن، واحجز معاينة خلال دقائق.</p><div class="hero-actions"><a class="btn" href="#units">اعرض الوحدات</a></div></div><div class="card reveal"><h3>${icon("shield", "موثوق")} توثيق كامل</h3><p>كل وحدة موثّقة مع صور وبيانات دقيقة.</p></div></section>
  <section id="units" class="section container"><h2 class="section-title">وحدات متاحة</h2><div class="grid"><article class="card reveal"><h3>شقة 140م²</h3><p>3 غرف · موقف · إطلالة</p></article><article class="card reveal"><h3>فيلا 320م²</h3><p>حديقة · مسبح · مدخلان</p></article><article class="card reveal"><h3>مكتب 90م²</h3><p>برج إداري · تشطيب كامل</p></article></div></section>
</main>${FOOTER}`;

const MAGAZINE_BODY = `${HEADER}
<main>
  <section class="container hero"><div><h1>قراءات تستحق وقتك</h1><p>مقالات طويلة ومختارات أسبوعية في التقنية والثقافة.</p><div class="hero-actions"><a class="btn" href="#posts">أحدث المقالات</a></div></div><div class="card reveal"><h3>${icon("mail", "النشرة")} النشرة الأسبوعية</h3><p>اشترك لتصلك المختارات كل أحد.</p></div></section>
  <section id="posts" class="section container"><h2 class="section-title">أحدث المقالات</h2><div class="grid"><article class="card reveal"><h3>مقال رئيسي</h3><p>مقدّمة قصيرة تشرح الفكرة.</p></article><article class="card reveal"><h3>مقال ثانٍ</h3><p>مقدّمة قصيرة تشرح الفكرة.</p></article><article class="card reveal"><h3>مقال ثالث</h3><p>مقدّمة قصيرة تشرح الفكرة.</p></article></div></section>
</main>${FOOTER}`;

const CLINIC_BODY = `${HEADER}
<main>
  <section class="container hero"><div><h1>رعاية طبية تبدأ من موعد واحد</h1><p>فريق متخصص، مواعيد مرنة، ومتابعة بعد الزيارة.</p><div class="hero-actions"><a class="btn" href="#book">احجز موعداً</a><a class="btn ghost" href="#services">التخصصات</a></div></div><div class="card reveal"><h3>${icon("check", "تأمين")} نقبل معظم شركات التأمين</h3><p>تحقق من تغطيتك قبل الزيارة.</p></div></section>
  <section id="services" class="section container"><h2 class="section-title">التخصصات</h2><div class="grid"><article class="card reveal"><h3>طب عام</h3><p>فحص وتشخيص شامل.</p></article><article class="card reveal"><h3>أسنان</h3><p>علاج وتجميل.</p></article><article class="card reveal"><h3>جلدية</h3><p>عناية وعلاج.</p></article></div></section>
  <section id="book" class="section container"><h2 class="section-title">حجز موعد</h2><form class="card"><label for="p">رقم الجوال</label><input id="p" type="tel" style="width:100%;padding:12px;margin:10px 0;border:1px solid var(--border);border-radius:12px"><button class="btn" type="submit">احجز</button></form></section>
</main>${FOOTER}`;

const EVENT_BODY = `${HEADER}
<main>
  <section class="container hero"><div><h1>مؤتمر يجمع صنّاع المنتجات</h1><p>يومان من الجلسات وورش العمل ولقاءات الشبكة المهنية.</p><div class="hero-actions"><a class="btn" href="#agenda">البرنامج</a><a class="btn ghost" href="#tickets">التذاكر</a></div></div><div class="card reveal"><h3>${icon("bolt", "مباشر")} بث مباشر للجلسات</h3><p>لمن لا يستطيع الحضور.</p></div></section>
  <section id="agenda" class="section container"><h2 class="section-title">البرنامج</h2><div class="grid"><article class="card reveal"><h3>09:00 — الافتتاح</h3><p>كلمة ترحيبية.</p></article><article class="card reveal"><h3>11:00 — جلسة تصميم</h3><p>أنظمة تصميم عربية.</p></article><article class="card reveal"><h3>14:00 — ورشة</h3><p>من الفكرة إلى الإطلاق.</p></article></div></section>
  <section id="tickets" class="section container"><h2 class="section-title">التذاكر</h2><div class="grid"><article class="card reveal"><h3>عادية</h3><p>350 ر.س</p></article><article class="card reveal"><h3>مميزة</h3><p>650 ر.س</p></article><article class="card reveal"><h3>مجموعات</h3><p>سعر خاص</p></article></div></section>
</main>${FOOTER}`;

STARTER_TEMPLATES.push(
  {
    id: "store",
    title: "متجر إلكتروني",
    description: "لوحة رمال دافئة · شبكة منتجات · شريط أرقام · أسئلة شائعة أصلية.",
    prompt:
      "طوّر متجراً إلكترونياً عربياً انطلاقاً من القالب: أكمل صفحات المنتج والسلة والدفع، حافظ على لوحة الرمال الدافئة والأيقونات المضمّنة، ثم شغّل run_checks وانشر.",
    files: themedFiles("متجر إلكتروني — Weaver", "sand", MESH, STORE_BODY),
  },
  {
    id: "restaurant",
    title: "مطعم وقائمة طعام",
    description: "لوحة طين وميرمية · زوايا غير متماثلة · شريط قائمة أفقي بـ scroll-snap.",
    prompt:
      "طوّر موقع مطعم عربي انطلاقاً من القالب: أكمل قائمة الطعام بالأصناف والأسعار ومعرض الصور ونموذج الحجز، ثم شغّل run_checks وانشر.",
    files: themedFiles("مطعم — Weaver", "clay", DOTS, RESTAURANT_BODY),
  },
  {
    id: "realestate",
    title: "منصة عقارات",
    description: "لوحة صقيع قطبي · بطاقات وحدات · شبكة خلفية هندسية.",
    prompt:
      "طوّر منصة عقارات عربية انطلاقاً من القالب: أضف فلاتر البحث وصفحة تفاصيل الوحدة ونموذج طلب المعاينة، ثم شغّل run_checks وانشر.",
    files: themedFiles("عقارات — Weaver", "frost", GRID, REALESTATE_BODY),
  },
  {
    id: "magazine",
    title: "مجلة ومدوّنة",
    description: "لوحة حبر وورق · زوايا حادّة · تخطيط تحريري.",
    prompt:
      "طوّر مجلة عربية انطلاقاً من القالب: أضف صفحة المقال الكامل والتصنيفات وأرشيفاً ونموذج نشرة بريدية، ثم شغّل run_checks وانشر.",
    files: themedFiles("مجلة — Weaver", "ink", DOTS, MAGAZINE_BODY),
  },
  {
    id: "clinic",
    title: "عيادة وحجز مواعيد",
    description: "لوحة زمرد فاخر · تخصصات · نموذج حجز.",
    prompt:
      "طوّر موقع عيادة عربي انطلاقاً من القالب: أضف صفحات الأطباء والتخصصات ونظام حجز المواعيد، ثم شغّل run_checks وانشر.",
    files: themedFiles("عيادة — Weaver", "emerald", MESH, CLINIC_BODY),
  },
  {
    id: "event",
    title: "مؤتمر وفعالية",
    description: "لوحة عمق المحيط · برنامج زمني · تذاكر.",
    prompt:
      "طوّر موقع مؤتمر عربي انطلاقاً من القالب: أضف المتحدثين والبرنامج التفصيلي وصفحة التسجيل والعدّ التنازلي، ثم شغّل run_checks وانشر.",
    files: themedFiles("مؤتمر — Weaver", "ocean", MESH, EVENT_BODY),
  },
);
