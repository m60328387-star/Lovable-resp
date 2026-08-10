/**
 * Weaver UI — مكتبة مكوّنات مُصرّفة تُشحن كملف CSS حقيقي مع كل مشروع.
 *
 * الفكرة الحاكمة: لا يكتب النموذج CSS خاماً للمكوّنات الشائعة. يستدعي قصاصة HTML
 * جاهزة (ui_snippet) ويعدّل محتواها فقط. كل الأنماط تعتمد على متغيّرات
 * brand/tokens.css حصراً — لا قيمة لون أو مسافة مباشرة هنا.
 */

export interface UiSnippet {
  id: string;
  name: string;
  /** متى يُستعمل هذا المكوّن */
  use: string;
  html: string;
}

/* --------------------------------------------------------------------- */
/*                                  CSS                                   */
/* --------------------------------------------------------------------- */

export const UI_CSS = `/* Weaver UI — مكوّنات جاهزة مبنية على brand/tokens.css.
   لا تعدّل هذا الملف. خصّص عبر متغيّرات tokens.css أو أنماط styles.css. */

/* ============================ التخطيط ============================ */
.u-stack   { display: flex; flex-direction: column; gap: var(--space-4); }
.u-row     { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.u-between { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.u-center  { display: flex; align-items: center; justify-content: center; }
.u-grid    { display: grid; gap: var(--space-6); }
.u-grid-2  { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.u-grid-3  { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.u-grid-4  { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.u-narrow  { max-width: 62ch; }
.u-eyebrow {
  display: inline-block; font-size: var(--text-sm); font-weight: 600;
  letter-spacing: .04em; color: var(--color-primary-text); margin-bottom: var(--space-3);
}
.u-section-head { max-width: 68ch; margin-bottom: var(--space-10); }
.u-section-head p { color: var(--color-muted); margin: 0; }

/* ============================ الأزرار ============================ */
.u-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-6); border-radius: var(--radius-full);
  font: inherit; font-weight: 600; line-height: 1.2; text-decoration: none;
  border: 1px solid transparent; cursor: pointer; white-space: nowrap;
  transition: background var(--transition), color var(--transition),
              transform var(--transition), box-shadow var(--transition);
}
.u-btn:disabled, .u-btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; transform: none; }
.u-btn--primary { background: var(--color-primary); color: var(--color-primary-on); box-shadow: var(--shadow-sm); }
.u-btn--primary:hover { background: var(--color-primary-600); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.u-btn--primary:active { background: var(--color-primary-700); transform: translateY(0); }
.u-btn--outline { background: transparent; color: var(--color-text); border-color: var(--color-border); }
.u-btn--outline:hover { background: var(--color-surface-2); border-color: var(--color-primary); }
.u-btn--ghost { background: transparent; color: var(--color-primary-text); }
.u-btn--ghost:hover { background: var(--color-surface-2); }
.u-btn--lg { padding: var(--space-4) var(--space-8); font-size: var(--text-lg); }
.u-btn--sm { padding: var(--space-2) var(--space-4); font-size: var(--text-sm); }
.u-btn--block { width: 100%; }
.u-btn--icon { padding: var(--space-3); border-radius: var(--radius-full); }
.u-btn svg { width: 1.15em; height: 1.15em; flex: none; }

/* ============================ الأسطح ============================ */
.u-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); padding: var(--space-6);
  display: flex; flex-direction: column; gap: var(--space-3);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}
.u-card--link:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--color-primary); }
.u-card--flat { background: transparent; border: 0; padding: 0; }
.u-card h3 { margin: 0; }
.u-card p  { margin: 0; color: var(--color-muted); }
.u-card__icon {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary-text);
}
.u-card__icon svg { width: 22px; height: 22px; }

.u-badge {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: 600;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary-text);
}
.u-badge--muted { background: var(--color-surface-2); color: var(--color-muted); }

.u-divider { height: 1px; background: var(--color-border); border: 0; margin-block: var(--space-8); }

/* ============================ الهيدر ============================ */
.u-header {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  backdrop-filter: saturate(150%) blur(12px);
  border-bottom: 1px solid var(--color-border);
}
.u-header__inner { display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); min-height: 68px; }
.u-brand { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: 700; text-decoration: none; color: var(--color-text); }
.u-brand img, .u-brand svg { height: 30px; width: auto; }
.u-nav { display: flex; align-items: center; gap: var(--space-6); }
.u-nav a { color: var(--color-text); text-decoration: none; font-weight: 500; position: relative; padding-block: var(--space-2); }
.u-nav a:hover, .u-nav a[aria-current="page"] { color: var(--color-primary-text); }
.u-nav a[aria-current="page"]::after {
  content: ""; position: absolute; inset-inline: 0; bottom: 0; height: 2px; background: var(--color-primary);
}
.u-burger { display: none; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2); cursor: pointer; color: var(--color-text); }
.u-burger svg { width: 22px; height: 22px; display: block; }
@media (max-width: 860px) {
  .u-burger { display: inline-flex; }
  .u-nav {
    position: fixed; inset-block: 68px auto; inset-inline: 0;
    flex-direction: column; align-items: stretch; gap: 0;
    background: var(--color-bg); border-bottom: 1px solid var(--color-border);
    padding: var(--space-4); box-shadow: var(--shadow-lg);
    transform: translateY(-8px); opacity: 0; pointer-events: none;
    transition: opacity var(--transition), transform var(--transition);
  }
  .u-nav[data-open="true"] { transform: translateY(0); opacity: 1; pointer-events: auto; }
  .u-nav a { padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--color-border); }
  .u-nav .u-btn { margin-top: var(--space-3); }
}

/* ============================ الهيرو ============================ */
.u-hero { padding-block: clamp(56px, 10vw, 128px); }
.u-hero__grid { display: grid; gap: clamp(32px, 5vw, 64px); align-items: center; }
@media (min-width: 900px) { .u-hero__grid { grid-template-columns: 1.05fr .95fr; } }
.u-hero h1 { font-size: clamp(2.25rem, 5.2vw, 4rem); margin-bottom: var(--space-5); text-wrap: balance; }
.u-hero__lede { font-size: var(--text-lg); color: var(--color-muted); max-width: 56ch; margin-bottom: var(--space-8); }
.u-hero__media { position: relative; border-radius: var(--radius-xl); overflow: hidden; box-shadow: var(--shadow-lg); }
.u-hero__media img { display: block; width: 100%; height: auto; }

/* ============================ Bento ============================ */
.u-bento { display: grid; gap: var(--space-4); grid-template-columns: repeat(6, 1fr); }
.u-bento > * { grid-column: span 6; }
@media (min-width: 780px) {
  .u-bento > * { grid-column: span 2; }
  .u-bento > .u-bento--wide { grid-column: span 4; }
  .u-bento > .u-bento--tall { grid-column: span 2; grid-row: span 2; }
  .u-bento > .u-bento--full { grid-column: span 6; }
}

/* ============================ الإحصاءات ============================ */
.u-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-6); }
.u-stat__value { font-family: var(--font-head); font-size: clamp(1.9rem, 3.6vw, 2.9rem); font-weight: 700; line-height: 1.1; color: var(--color-text); }
.u-stat__label { color: var(--color-muted); font-size: var(--text-sm); }

/* ============================ الخطوات ============================ */
.u-steps { counter-reset: step; display: grid; gap: var(--space-6); }
.u-step { display: grid; grid-template-columns: auto 1fr; gap: var(--space-4); align-items: start; }
.u-step::before {
  counter-increment: step; content: counter(step, decimal);
  width: 38px; height: 38px; border-radius: var(--radius-full);
  display: grid; place-items: center; font-weight: 700;
  background: var(--color-primary); color: var(--color-primary-on);
}
.u-step h3 { margin: 0 0 var(--space-1); }
.u-step p { margin: 0; color: var(--color-muted); }

/* ============================ الأسعار ============================ */
.u-pricing { display: grid; gap: var(--space-6); grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: stretch; }
.u-plan { position: relative; display: flex; flex-direction: column; gap: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-8); }
.u-plan--featured { border-color: var(--color-primary); box-shadow: var(--shadow-lg); }
.u-plan__price { font-family: var(--font-head); font-size: clamp(2rem, 4vw, 2.75rem); font-weight: 700; line-height: 1; }
.u-plan__price span { font-size: var(--text-sm); font-weight: 500; color: var(--color-muted); }
.u-plan ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.u-plan li { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2); align-items: start; color: var(--color-muted); }
.u-plan li svg { width: 18px; height: 18px; margin-top: .25em; color: var(--color-primary-text); flex: none; }
.u-plan .u-btn { margin-top: auto; }

/* ============================ الشهادات ============================ */
.u-quote { display: flex; flex-direction: column; gap: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6); }
.u-quote blockquote { margin: 0; font-size: var(--text-lg); line-height: 1.7; }
.u-quote figcaption { display: flex; align-items: center; gap: var(--space-3); }
.u-quote img { width: 44px; height: 44px; border-radius: var(--radius-full); object-fit: cover; }
.u-quote__who { font-weight: 600; }
.u-quote__role { color: var(--color-muted); font-size: var(--text-sm); }

/* ============================ الأسئلة الشائعة ============================ */
.u-faq { display: grid; gap: var(--space-3); max-width: 76ch; }
.u-faq details { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4) var(--space-5); }
.u-faq summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.u-faq summary::-webkit-details-marker { display: none; }
.u-faq summary::after { content: "+"; font-size: 1.3em; line-height: 1; color: var(--color-primary-text); }
.u-faq details[open] summary::after { content: "\\2212"; }
.u-faq p { margin: var(--space-3) 0 0; color: var(--color-muted); }

/* ============================ الشريط الترويجي ============================ */
.u-cta {
  border-radius: var(--radius-xl); padding: clamp(32px, 6vw, 72px);
  background: var(--color-primary); color: var(--color-primary-on);
  display: grid; gap: var(--space-6); justify-items: center; text-align: center;
}
.u-cta h2 { color: inherit; margin: 0; }
.u-cta p { margin: 0; opacity: .85; max-width: 56ch; }
.u-cta .u-btn--primary { background: var(--color-primary-on); color: var(--color-primary); }
.u-cta .u-btn--primary:hover { background: var(--color-primary-on); opacity: .9; }

/* ============================ النماذج ============================ */
.u-field { display: grid; gap: var(--space-2); }
.u-field label { font-weight: 600; font-size: var(--text-sm); }
.u-input, .u-textarea, .u-select {
  width: 100%; font: inherit; color: var(--color-text);
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
  transition: border-color var(--transition), box-shadow var(--transition);
}
.u-input:focus-visible, .u-textarea:focus-visible, .u-select:focus-visible {
  outline: none; border-color: var(--color-primary); box-shadow: var(--ring);
}
.u-textarea { min-height: 140px; resize: vertical; }
.u-field__hint { font-size: var(--text-sm); color: var(--color-muted); }
.u-field__error { font-size: var(--text-sm); color: var(--color-danger, #d33); }

/* ============================ الفوتر ============================ */
.u-footer { border-top: 1px solid var(--color-border); padding-block: var(--space-16) var(--space-8); background: var(--color-surface-2); }
.u-footer__grid { display: grid; gap: var(--space-8); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.u-footer h4 { margin: 0 0 var(--space-3); font-size: var(--text-sm); letter-spacing: .04em; color: var(--color-muted); }
.u-footer ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.u-footer a { color: var(--color-text); text-decoration: none; }
.u-footer a:hover { color: var(--color-primary-text); }
.u-footer__bottom { margin-top: var(--space-12); padding-top: var(--space-6); border-top: 1px solid var(--color-border); color: var(--color-muted); font-size: var(--text-sm); display: flex; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }

/* ============================ الحالات ============================ */
.u-empty { display: grid; gap: var(--space-3); justify-items: center; text-align: center; padding: var(--space-16) var(--space-6); color: var(--color-muted); }
.u-skeleton { background: linear-gradient(90deg, var(--color-surface-2) 25%, var(--color-border) 37%, var(--color-surface-2) 63%); background-size: 400% 100%; animation: u-shimmer 1.4s ease infinite; border-radius: var(--radius-md); }
.u-skeleton--text { height: 1em; margin-block: .35em; }
@keyframes u-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

/* ============================ الوسائط ============================ */
.u-media { display: block; width: 100%; height: auto; border-radius: var(--radius-lg); object-fit: cover; background: var(--color-surface-2); }
.u-ratio { position: relative; overflow: hidden; border-radius: var(--radius-lg); }
.u-ratio--16-9 { aspect-ratio: 16 / 9; }
.u-ratio--4-3  { aspect-ratio: 4 / 3; }
.u-ratio--1-1  { aspect-ratio: 1 / 1; }
.u-ratio > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* ============================ الظهور عند التمرير ============================ */
.u-reveal { opacity: 0; transform: translateY(18px); transition: opacity 600ms ease, transform 600ms cubic-bezier(.2,.7,.3,1); }
.u-reveal.is-visible { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .u-reveal { opacity: 1; transform: none; transition: none; } }

/* ============================ الوصولية ============================ */
.u-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.u-skip { position: absolute; inset-inline-start: var(--space-4); top: -60px; z-index: 100; background: var(--color-primary); color: var(--color-primary-on); padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); transition: top var(--transition); }
.u-skip:focus { top: var(--space-4); }
`;

/** سكربت مشترك صغير: قائمة الجوال + الظهور عند التمرير. بلا أي مكتبة. */
export const UI_JS = `// Weaver UI — سلوك مشترك بلا مكتبات.
(function () {
  var burger = document.querySelector('[data-burger]');
  var nav = document.getElementById('site-nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      burger.setAttribute('aria-expanded', String(!open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.setAttribute('data-open', 'false');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var reveals = document.querySelectorAll('.u-reveal');
  if (reveals.length) {
    if (!('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
      reveals.forEach(function (el) { io.observe(el); });
    }
  }
})();
`;

/* --------------------------------------------------------------------- */
/*                               القصاصات                                 */
/* --------------------------------------------------------------------- */

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';

export const UI_SNIPPETS: Record<string, UiSnippet> = {
  header: {
    id: "header",
    name: "هيدر ثابت مع قائمة جوال تعمل",
    use: "أعلى كل صفحة. القائمة تعمل عبر brand/ui.js بلا مكتبات.",
    html: `<a class="u-skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="u-header">
  <div class="container u-header__inner">
    <a class="u-brand" href="index.html">
      <img src="brand/logo.svg" alt="شعار {{BRAND}}" width="30" height="30">
      <span>{{BRAND}}</span>
    </a>
    <nav class="u-nav" id="site-nav" aria-label="التنقل الرئيسي">
      <a href="index.html" aria-current="page">الرئيسية</a>
      <a href="services.html">الخدمات</a>
      <a href="about.html">من نحن</a>
      <a href="contact.html">تواصل</a>
      <a class="u-btn u-btn--primary u-btn--sm" href="contact.html">ابدأ الآن</a>
    </nav>
    <button class="u-burger" data-burger type="button" aria-label="فتح القائمة" aria-expanded="false" aria-controls="site-nav">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
</header>`,
  },

  hero: {
    id: "hero",
    name: "هيرو نصّي + وسائط",
    use: "أول شاشة. صورة واحدة مولّدة فعلياً بـ generate_image.",
    html: `<section class="u-hero">
  <div class="container u-hero__grid">
    <div>
      <span class="u-eyebrow">{{EYEBROW}}</span>
      <h1>{{HEADLINE}}</h1>
      <p class="u-hero__lede">{{SUBHEAD}}</p>
      <div class="u-row">
        <a class="u-btn u-btn--primary u-btn--lg" href="contact.html">{{CTA_PRIMARY}}</a>
        <a class="u-btn u-btn--outline u-btn--lg" href="services.html">{{CTA_SECONDARY}}</a>
      </div>
    </div>
    <figure class="u-hero__media" style="margin:0">
      <img src="assets/hero.png" alt="{{HERO_ALT}}" width="1200" height="900" fetchpriority="high" decoding="async">
    </figure>
  </div>
</section>`,
  },

  stats: {
    id: "stats",
    name: "شريط أرقام بلا بطاقات",
    use: "دليل ملموس بعد الهيرو مباشرة.",
    html: `<section class="section">
  <div class="container u-stats">
    <div class="u-stat"><div class="u-stat__value">{{V1}}</div><div class="u-stat__label">{{L1}}</div></div>
    <div class="u-stat"><div class="u-stat__value">{{V2}}</div><div class="u-stat__label">{{L2}}</div></div>
    <div class="u-stat"><div class="u-stat__value">{{V3}}</div><div class="u-stat__label">{{L3}}</div></div>
    <div class="u-stat"><div class="u-stat__value">{{V4}}</div><div class="u-stat__label">{{L4}}</div></div>
  </div>
</section>`,
  },

  features: {
    id: "features",
    name: "شبكة ميزات ببطاقات وأيقونات SVG",
    use: "3–6 ميزات. الأيقونة SVG مضمّنة، لا حزمة أيقونات.",
    html: `<section class="section" id="features">
  <div class="container">
    <div class="u-section-head u-reveal">
      <span class="u-eyebrow">{{EYEBROW}}</span>
      <h2>{{TITLE}}</h2>
      <p>{{SUBTITLE}}</p>
    </div>
    <div class="u-grid u-grid-3">
      <article class="u-card u-reveal">
        <span class="u-card__icon">${CHECK_ICON}</span>
        <h3>{{F1_TITLE}}</h3>
        <p>{{F1_TEXT}}</p>
      </article>
      <article class="u-card u-reveal">
        <span class="u-card__icon">${CHECK_ICON}</span>
        <h3>{{F2_TITLE}}</h3>
        <p>{{F2_TEXT}}</p>
      </article>
      <article class="u-card u-reveal">
        <span class="u-card__icon">${CHECK_ICON}</span>
        <h3>{{F3_TITLE}}</h3>
        <p>{{F3_TEXT}}</p>
      </article>
    </div>
  </div>
</section>`,
  },

  bento: {
    id: "bento",
    name: "شبكة bento غير متناظرة",
    use: "بديل أرقى من صفوف بطاقات متطابقة.",
    html: `<section class="section">
  <div class="container">
    <div class="u-section-head u-reveal"><h2>{{TITLE}}</h2><p>{{SUBTITLE}}</p></div>
    <div class="u-bento">
      <article class="u-card u-bento--wide u-reveal"><h3>{{B1_TITLE}}</h3><p>{{B1_TEXT}}</p></article>
      <article class="u-card u-bento--tall u-reveal"><h3>{{B2_TITLE}}</h3><p>{{B2_TEXT}}</p></article>
      <article class="u-card u-reveal"><h3>{{B3_TITLE}}</h3><p>{{B3_TEXT}}</p></article>
      <article class="u-card u-reveal"><h3>{{B4_TITLE}}</h3><p>{{B4_TEXT}}</p></article>
      <article class="u-card u-bento--full u-reveal"><h3>{{B5_TITLE}}</h3><p>{{B5_TEXT}}</p></article>
    </div>
  </div>
</section>`,
  },

  steps: {
    id: "steps",
    name: "تدفّق عمل مرقّم",
    use: "شرح «كيف يعمل» في 3–4 خطوات.",
    html: `<section class="section">
  <div class="container u-grid u-grid-2">
    <div class="u-section-head"><span class="u-eyebrow">{{EYEBROW}}</span><h2>{{TITLE}}</h2><p>{{SUBTITLE}}</p></div>
    <div class="u-steps">
      <div class="u-step u-reveal"><div><h3>{{S1_TITLE}}</h3><p>{{S1_TEXT}}</p></div></div>
      <div class="u-step u-reveal"><div><h3>{{S2_TITLE}}</h3><p>{{S2_TEXT}}</p></div></div>
      <div class="u-step u-reveal"><div><h3>{{S3_TITLE}}</h3><p>{{S3_TEXT}}</p></div></div>
    </div>
  </div>
</section>`,
  },

  gallery: {
    id: "gallery",
    name: "معرض أعمال بنسب ثابتة",
    use: "بورتفوليو أو منتجات. أبعاد صريحة تمنع القفز التخطيطي.",
    html: `<section class="section">
  <div class="container">
    <div class="u-section-head u-reveal"><h2>{{TITLE}}</h2></div>
    <div class="u-grid u-grid-3">
      <figure class="u-ratio u-ratio--4-3 u-reveal" style="margin:0"><img src="assets/work-1.png" alt="{{ALT1}}" width="800" height="600" loading="lazy" decoding="async"></figure>
      <figure class="u-ratio u-ratio--4-3 u-reveal" style="margin:0"><img src="assets/work-2.png" alt="{{ALT2}}" width="800" height="600" loading="lazy" decoding="async"></figure>
      <figure class="u-ratio u-ratio--4-3 u-reveal" style="margin:0"><img src="assets/work-3.png" alt="{{ALT3}}" width="800" height="600" loading="lazy" decoding="async"></figure>
    </div>
  </div>
</section>`,
  },

  pricing: {
    id: "pricing",
    name: "جدول أسعار من ثلاث خطط",
    use: "الخطة الوسطى مميّزة بـ u-plan--featured.",
    html: `<section class="section" id="pricing">
  <div class="container">
    <div class="u-section-head u-reveal"><h2>{{TITLE}}</h2><p>{{SUBTITLE}}</p></div>
    <div class="u-pricing">
      <div class="u-plan u-reveal">
        <h3>{{P1_NAME}}</h3>
        <div class="u-plan__price">{{P1_PRICE}} <span>/ شهرياً</span></div>
        <p class="muted">{{P1_FOR}}</p>
        <ul>
          <li>${CHECK_ICON}<span>{{P1_F1}}</span></li>
          <li>${CHECK_ICON}<span>{{P1_F2}}</span></li>
        </ul>
        <a class="u-btn u-btn--outline u-btn--block" href="contact.html">اختر الخطة</a>
      </div>
      <div class="u-plan u-plan--featured u-reveal">
        <span class="u-badge">الأكثر اختياراً</span>
        <h3>{{P2_NAME}}</h3>
        <div class="u-plan__price">{{P2_PRICE}} <span>/ شهرياً</span></div>
        <p class="muted">{{P2_FOR}}</p>
        <ul>
          <li>${CHECK_ICON}<span>{{P2_F1}}</span></li>
          <li>${CHECK_ICON}<span>{{P2_F2}}</span></li>
          <li>${CHECK_ICON}<span>{{P2_F3}}</span></li>
        </ul>
        <a class="u-btn u-btn--primary u-btn--block" href="contact.html">ابدأ الآن</a>
      </div>
      <div class="u-plan u-reveal">
        <h3>{{P3_NAME}}</h3>
        <div class="u-plan__price">{{P3_PRICE}}</div>
        <p class="muted">{{P3_FOR}}</p>
        <ul>
          <li>${CHECK_ICON}<span>{{P3_F1}}</span></li>
          <li>${CHECK_ICON}<span>{{P3_F2}}</span></li>
        </ul>
        <a class="u-btn u-btn--outline u-btn--block" href="contact.html">تواصل معنا</a>
      </div>
    </div>
  </div>
</section>`,
  },

  testimonials: {
    id: "testimonials",
    name: "شهادات عملاء",
    use: "دليل اجتماعي. لا تختلق أسماء حقيقية بلا إذن المالك.",
    html: `<section class="section">
  <div class="container">
    <div class="u-section-head u-reveal"><h2>{{TITLE}}</h2></div>
    <div class="u-grid u-grid-3">
      <figure class="u-quote u-reveal">
        <blockquote>{{Q1}}</blockquote>
        <figcaption><div><div class="u-quote__who">{{N1}}</div><div class="u-quote__role">{{R1}}</div></div></figcaption>
      </figure>
      <figure class="u-quote u-reveal">
        <blockquote>{{Q2}}</blockquote>
        <figcaption><div><div class="u-quote__who">{{N2}}</div><div class="u-quote__role">{{R2}}</div></div></figcaption>
      </figure>
      <figure class="u-quote u-reveal">
        <blockquote>{{Q3}}</blockquote>
        <figcaption><div><div class="u-quote__who">{{N3}}</div><div class="u-quote__role">{{R3}}</div></div></figcaption>
      </figure>
    </div>
  </div>
</section>`,
  },

  faq: {
    id: "faq",
    name: "أسئلة شائعة بـ <details> أصلي",
    use: "بلا JavaScript. أضف JSON-LD من نوع FAQPage عبر seo_kit.",
    html: `<section class="section" id="faq">
  <div class="container">
    <div class="u-section-head u-reveal"><h2>{{TITLE}}</h2></div>
    <div class="u-faq">
      <details><summary>{{Q1}}</summary><p>{{A1}}</p></details>
      <details><summary>{{Q2}}</summary><p>{{A2}}</p></details>
      <details><summary>{{Q3}}</summary><p>{{A3}}</p></details>
      <details><summary>{{Q4}}</summary><p>{{A4}}</p></details>
    </div>
  </div>
</section>`,
  },

  cta: {
    id: "cta",
    name: "شريط دعوة نهائي",
    use: "قبل الفوتر مباشرة. دعوة واحدة فقط.",
    html: `<section class="section">
  <div class="container">
    <div class="u-cta u-reveal">
      <h2>{{TITLE}}</h2>
      <p>{{SUBTITLE}}</p>
      <a class="u-btn u-btn--primary u-btn--lg" href="contact.html">{{CTA}}</a>
    </div>
  </div>
</section>`,
  },

  contact_form: {
    id: "contact_form",
    name: "نموذج تواصل مع تحقّق أصلي",
    use: "required + type يعطيان تحقّقاً بلا JavaScript.",
    html: `<section class="section">
  <div class="container u-grid u-grid-2">
    <div class="u-section-head"><h2>{{TITLE}}</h2><p>{{SUBTITLE}}</p></div>
    <form class="u-stack" method="post" action="{{ACTION}}" novalidate>
      <div class="u-field">
        <label for="name">الاسم الكامل</label>
        <input class="u-input" id="name" name="name" type="text" required autocomplete="name" placeholder="اكتب اسمك">
      </div>
      <div class="u-field">
        <label for="email">البريد الإلكتروني</label>
        <input class="u-input" id="email" name="email" type="email" required autocomplete="email" placeholder="name@example.com">
        <span class="u-field__hint">لن نشارك بريدك مع أي جهة.</span>
      </div>
      <div class="u-field">
        <label for="message">رسالتك</label>
        <textarea class="u-textarea" id="message" name="message" required placeholder="كيف يمكننا مساعدتك؟"></textarea>
      </div>
      <button class="u-btn u-btn--primary" type="submit">إرسال الرسالة</button>
    </form>
  </div>
</section>`,
  },

  footer: {
    id: "footer",
    name: "فوتر بأعمدة",
    use: "نهاية كل صفحة، متطابق بين الصفحات.",
    html: `<footer class="u-footer">
  <div class="container">
    <div class="u-footer__grid">
      <div>
        <a class="u-brand" href="index.html"><img src="brand/logo.svg" alt="شعار {{BRAND}}" width="30" height="30"><span>{{BRAND}}</span></a>
        <p class="muted" style="margin-top:var(--space-3);max-width:34ch">{{TAGLINE}}</p>
      </div>
      <div><h4>الموقع</h4><ul><li><a href="index.html">الرئيسية</a></li><li><a href="services.html">الخدمات</a></li><li><a href="about.html">من نحن</a></li></ul></div>
      <div><h4>تواصل</h4><ul><li><a href="mailto:{{EMAIL}}">{{EMAIL}}</a></li><li><a href="tel:{{PHONE}}">{{PHONE}}</a></li></ul></div>
    </div>
    <div class="u-footer__bottom">
      <span>© <span id="year">{{YEAR}}</span> {{BRAND}}. جميع الحقوق محفوظة.</span>
      <a href="privacy.html">سياسة الخصوصية</a>
    </div>
  </div>
</footer>`,
  },

  page_shell: {
    id: "page_shell",
    name: "هيكل صفحة كامل (ابدأ من هنا)",
    use: "أساس كل ملف HTML: RTL، ربط tokens/ui، ترتيب تحميل صحيح.",
    html: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{TITLE}}</title>
  <meta name="description" content="{{DESCRIPTION}}">
  <link rel="stylesheet" href="brand/tokens.css">
  <link rel="stylesheet" href="brand/ui.css">
  <link rel="stylesheet" href="styles.css">
  <link rel="icon" href="brand/favicon.svg" type="image/svg+xml">
</head>
<body>
  <!-- header -->
  <main id="main">
    <!-- sections -->
  </main>
  <!-- footer -->
  <script src="brand/ui.js" defer></script>
</body>
</html>`,
  },
};

export function listSnippets(): { id: string; name: string; use: string }[] {
  return Object.values(UI_SNIPPETS).map(({ id, name, use }) => ({ id, name, use }));
}

export function getSnippets(ids: string[]): UiSnippet[] {
  return ids.map((id) => UI_SNIPPETS[id]).filter((s): s is UiSnippet => Boolean(s));
}

/** ملفات المكتبة التي تُكتب في مساحة المشروع بجانب tokens.css. */
export function uiLibraryFiles(): { path: string; content: string }[] {
  return [
    { path: "brand/ui.css", content: UI_CSS },
    { path: "brand/ui.js", content: UI_JS },
  ];
}
