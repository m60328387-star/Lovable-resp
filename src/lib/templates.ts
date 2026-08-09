export type StarterTemplate = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  files: { path: string; content: string }[];
};

const BASE_CSS = `:root{
  --bg:#ffffff; --fg:#0f172a; --muted:#64748b; --brand:#0d9488; --brand-dark:#0f766e;
  --card:#f8fafc; --border:#e2e8f0; --radius:16px; --max:1120px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;background:var(--bg);color:var(--fg);line-height:1.7}
.container{width:100%;max-width:var(--max);margin-inline:auto;padding-inline:20px}
a{color:inherit;text-decoration:none}
img{max-width:100%;height:auto;display:block;border-radius:var(--radius)}
.site-header{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;height:68px}
.nav ul{display:flex;gap:22px;list-style:none;font-size:14px;color:var(--muted)}
.nav ul a:hover{color:var(--brand)}
.brand{font-weight:800;font-size:18px;color:var(--brand)}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--brand);color:#fff;padding:12px 22px;border-radius:999px;font-weight:700;font-size:14px;border:0;cursor:pointer;transition:.2s}
.btn:hover{background:var(--brand-dark);transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--brand);border:1px solid var(--border)}
.hero{padding:88px 0 64px;display:grid;gap:40px;grid-template-columns:1fr}
.hero h1{font-size:clamp(30px,5vw,52px);font-weight:800;letter-spacing:-.02em;line-height:1.25}
.hero p{margin-top:18px;color:var(--muted);font-size:17px;max-width:56ch}
.hero-actions{margin-top:28px;display:flex;gap:12px;flex-wrap:wrap}
.section{padding:72px 0}
.section-title{font-size:clamp(22px,3vw,32px);font-weight:800;margin-bottom:10px}
.section-sub{color:var(--muted);margin-bottom:36px;max-width:60ch}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:26px}
.card h3{font-size:17px;font-weight:700;margin-bottom:8px}
.card p{color:var(--muted);font-size:14px}
.site-footer{border-top:1px solid var(--border);padding:36px 0;color:var(--muted);font-size:13px;text-align:center}
@media(min-width:900px){.hero{grid-template-columns:1.1fr .9fr;align-items:center;padding:110px 0 80px}}
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
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap" rel="stylesheet">
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
    { path: "styles.css", content: BASE_CSS },
    { path: "app.js", content: APP_JS },
  ];
}

const LANDING_BODY = `${HEADER}
<main>
  <section class="container hero">
    <div>
      <h1>عنوان رئيسي يشرح القيمة في سطر واحد</h1>
      <p>وصف قصير يوضّح لمن هذا المنتج وما المشكلة التي يحلّها، بلغة بسيطة ومباشرة.</p>
      <div class="hero-actions"><a class="btn" href="#pricing">جرّب مجانًا</a><a class="btn ghost" href="#features">اعرف أكثر</a></div>
    </div>
    <div class="card"><h3>لقطة من المنتج</h3><p>ضع هنا صورة أو رسمًا توضيحيًا للمنتج.</p></div>
  </section>
  <section id="features" class="section container">
    <h2 class="section-title">لماذا نحن</h2>
    <p class="section-sub">ثلاث مزايا واضحة تُترجم إلى نتائج ملموسة.</p>
    <div class="grid">
      <article class="card"><h3>سرعة</h3><p>أداء عالٍ وتجربة سلسة على كل الأجهزة.</p></article>
      <article class="card"><h3>موثوقية</h3><p>بنية مستقرة مع مراقبة مستمرة.</p></article>
      <article class="card"><h3>دعم</h3><p>فريق يساندك في كل خطوة.</p></article>
    </div>
  </section>
  <section id="pricing" class="section container">
    <h2 class="section-title">الأسعار</h2>
    <div class="grid">
      <article class="card"><h3>مجاني</h3><p>للبدء والتجربة.</p></article>
      <article class="card"><h3>احترافي</h3><p>للفرق النامية.</p></article>
      <article class="card"><h3>مؤسسات</h3><p>حسب الحاجة.</p></article>
    </div>
  </section>
  <section id="contact" class="section container"><h2 class="section-title">تواصل معنا</h2><p class="section-sub">اترك بريدك وسنعود إليك.</p><a class="btn" href="mailto:hello@example.com">راسلنا</a></section>
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
          `${HEADER}<main class="section container"><h1 class="section-title">تواصل معنا</h1><form class="card"><label for="email">بريدك</label><input id="email" type="email" required style="width:100%;padding:12px;margin:10px 0;border:1px solid var(--border);border-radius:12px"><button class="btn" type="submit">إرسال</button></form></main>${FOOTER}`,
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
