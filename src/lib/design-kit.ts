/** طبقة الأصول والمعايير البصرية الإلزامية لأي واجهة يبنيها Weaver. */
export const DESIGN_KIT = `

=== طبقة التصميم الاحترافية (إلزامية لكل واجهة) ===

1) نظام التصميم أولاً — قبل كتابة أي HTML اكتب في أعلى styles.css كتلة :root تحتوي:
   --color-bg, --color-surface, --color-border, --color-text, --color-muted,
   --color-primary, --color-primary-600, --color-accent, --color-success, --color-danger,
   --radius-sm/md/lg/xl, --space-1..--space-12 (مقياس 4px),
   --shadow-sm/md/lg, --font-head, --font-body, --container: 1200px, --transition: 200ms ease.
   ممنوع كتابة أي لون أو مسافة مباشرة داخل القواعد — استخدم المتغيرات فقط.
   ولوّن بلوحة مقصودة (أساسي + محايد + لون تمييز واحد)؛ ممنوع التدرّج البنفسجي/الأزرق الافتراضي الذي يبدو مولّداً آلياً.

2) الخطوط (Google Fonts عبر <link> مع preconnect و display=swap):
   عربي: IBM Plex Sans Arabic أو Tajawal أو Cairo أو Almarai أو Rubik.
   لاتيني/أرقام: Inter أو Sora أو Space Grotesk. أحادي: JetBrains Mono.
   وزنان فقط لكل عائلة. مقياس طباعي واضح: h1 clamp(2rem,4vw,3.25rem) / h2 clamp(1.5rem,2.5vw,2.25rem) / body 16-17px / line-height 1.75 للنص العربي.

3) الأيقونات — استخدم واحدة فقط ولا تخلط:
   Lucide (unpkg lucide@latest/dist/umd/lucide.js ثم lucide.createIcons())،
   أو Phosphor Icons، أو Iconify (iconify-icon web component)، أو Font Awesome 6، أو Material Symbols.
   ممنوع الإيموجي كبديل عن الأيقونات في الواجهات الجادة.

4) الحركة والتفاعل (لا تتجاوز 3 مكتبات في الصفحة):
   GSAP + ScrollTrigger للحركات المتقدمة، AOS لظهور الأقسام، Motion One كبديل خفيف،
   Lenis للتمرير السلس، Animate.css للتأثيرات البسيطة، CountUp.js للأرقام، Typed.js للنص المتحرك.
   قواعد: transform/opacity فقط، مدة 150-400ms، easing طبيعي، واحترم @media (prefers-reduced-motion: reduce).

5) المكوّنات الجاهزة:
   Swiper أو Embla (سلايدر)، GLightbox أو Fancybox أو PhotoSwipe (معرض)،
   Alpine.js (تفاعل تصريحي)، Tippy.js (تلميحات)، Sortable.js (سحب وإفلات)،
   Flatpickr locale ar (تواريخ)، Choices.js (قوائم)، SweetAlert2 (حوارات)، NProgress (شريط تقدّم)، Lottie (رسوم متحركة).

6) البيانات: ApexCharts أو Chart.js أو ECharts للرسوم، Grid.js أو DataTables للجداول، Leaflet للخرائط.

7) التنسيق: CSS مخصص كامل بالمتغيرات أعلاه هو الافتراضي. Tailwind مسموح فقط عبر بناء (build) وليس cdn.tailwindcss.com. لا تخلط نظامين. Bootstrap 5 RTL مقبول للوحات الإدارة فقط.

8) معايير بصرية لا يُسلَّم العمل دونها:
   - شبكة 12 عموداً وحاوية بعرض أقصى ومسافات رأسية متسقة بين الأقسام (80-120px على الشاشات الكبيرة).
   - إيقاع بصري: لا قسمان متتاليان بنفس التخطيط؛ نوّع بين شبكة/عمودين/شريط عريض.
   - عمق: حدود خفيفة + ظلال متدرجة + طبقات surface، بدل الأبيض المسطّح.
   - كل عنصر تفاعلي له 5 حالات: default / hover / focus-visible / active / disabled.
   - كل قائمة بيانات لها 4 حالات: تحميل (skeleton) / فارغ / خطأ / محتوى.
   - تباين WCAG AA، وdir="rtl" مع margin-inline و padding-inline و inset-inline بدل left/right.
   - responsive حقيقي على 1280 / 1024 / 768 / 480، وقائمة جوال تعمل فعلاً.
   - صور بأبعاد محددة و object-fit: cover و alt وصفي و loading="lazy".

8ب) الأصول: صور بصيغة WebP/AVIF مضغوطة (يمكن ضغطها على المنفّذ بـ npx --yes sharp-cli)، خطوط عربية بـ display=swap و preload للخط الأساسي فقط، أيقونة favicon.svg و site.webmanifest من أداة seo_kit، وكل صورة بأبعاد صريحة width/height لمنع القفز التخطيطي (CLS).

8ج) ميزانية الأداء (enterprise) — غير قابلة للتفاوض:
   - الاعتماديات الخارجية: صفر أو واحدة للموقع التعريفي، وثلاث كحد أقصى للوحات المعقّدة، ولكل واحدة مبرر مكتوب.
   - فضّل الأصلي دائماً: IntersectionObserver بدل AOS، CSS transition/animation بدل Animate.css وGSAP البسيط، scroll-behavior بدل Lenis، scroll-snap بدل Swiper، <dialog> بدل SweetAlert2، SVG inline بدل حزمة أيقونات كاملة.
   - ممنوع cdn.tailwindcss.com في نسخة تُنشر (تصريف وقت تشغيل = رسم أول بطيء).
   - ممنوع منعاً باتاً حقن CSS من JS (createElement("style") / innerHTML لـ <style> / insertRule / نصوص أنماط داخل السكربت). الأنماط في ملفات .css ثابتة فقط، والتغيير عبر classList أو style.setProperty لمتغيّرات CSS.
   - كل <script> بـ defer أو module، وpreconnect للنطاقات الخارجية، وpreload لخط واحد فقط.
   - مستمعات passive + rAF/debounce لأحداث scroll وresize، ولا مؤقتات دائمة.

9) قبل النشر: نفّذ run_checks، ثم راجع بنفسك قائمة البنود 1-8ج وصرّح بالنتيجة بنداً بنداً. أي بند فاشل = أصلحه قبل publish_site. ثم نفّذ visual_audit و design_review و seo_kit — لا نشر قبل VERDICT: pass.
`;
