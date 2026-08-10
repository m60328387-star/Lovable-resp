/**
 * مكتبات التصميم المرجعية لـ Weaver: لوحات ألوان، أزواج خطوط، أطقم أيقونات SVG مضمّنة،
 * أشكال وأنماط خلفية، أنماط تخطيط، ولمسات ابتكارية أصلية (بدون اعتماديات خارجية).
 * تُحقن في نص النظام ليختار الوكيل منها بدل ارتجال ألوان وأشكال عشوائية.
 */
import { ART_DIRECTION_KIT } from "./art-direction";


export const COLOR_LIBRARY = `
=== مكتبة الألوان (اختر لوحة واحدة كاملة ولا تخلط بين لوحتين) ===
كل لوحة: [خلفية، سطح، نص أساسي، محايد، أساسي، تمييز].
1  رمال دافئة — #FAF7F2 #F1EAE0 #1C1917 #7C6F64 #B45309 #0F766E   (حِرَفي، عقارات، مطاعم)
2  حبر وورق — #F6F5F1 #E9E7E0 #111111 #6B6B6B #C2410C #1F2937   (تحريري، مدوّنات، مجلات)
3  عمق المحيط — #071B2C #0E2E47 #E6F1F7 #7FA6BF #22B8CF #F4A261   (تقني، SaaS، لوحات)
4  أخضر زمردي فاخر — #04231A #083A2B #EAF6F0 #8FB8A6 #10B981 #D4AF37   (مالي، فاخر، عيادات)
5  ليل نيلي — #0A0A1A #15153A #EDEDFB #9A9AC4 #6366F1 #22D3EE   (منتجات رقمية، ذكاء اصطناعي)
6  فحم وجمرة — #141414 #1F1F1F #F5F5F5 #A3A3A3 #EA580C #FACC15   (رياضة، سيارات، جرأة)
7  طين وميرمية — #FBF7F4 #EFE6DE #26201C #7A6A5F #C4654A #6B8E6B   (طبيعي، عناية، حِرَف)
8  صقيع قطبي — #F4F9FD #E1EDF7 #0B2233 #5C7C93 #2E6B8A #14B8A6   (طبي، تعليمي، حكومي)
9  أسود وذهب — #0B0B0B #171717 #F7F3E8 #9C9384 #C9A84C #FFFFFF   (فنادق، مجوهرات، فخامة)
10 مرجاني كهربائي — #FFF7F5 #FFE9E4 #2A1214 #8A5A58 #FF5A5F #4C3BCF   (تطبيقات، ترفيه، شباب)
11 غابة وطحلب — #0E2119 #17362A #E8F2EC #93AF9F #3F9D6B #C9E265   (بيئي، زراعي، سياحة)
12 صحراء نحاسية — #FDF6EC #F3E3CC #2B1D10 #8A6E4E #B87333 #1E6F5C   (تراث، ضيافة، متاجر)

قواعد اللون: 60% خلفية/سطح، 30% نص ومحايد، 10% أساسي+تمييز فقط.
لا تستخدم اللون الأساسي كخلفية لأقسام كاملة إلا مرة واحدة في الصفحة.
اشتق درجات الحالة من اللوحة: نجاح/تحذير/خطأ بنفس درجة التشبّع.
تباين النص على الخلفية ≥ 4.5:1، والعناوين الكبيرة ≥ 3:1.
ممنوع: التدرّج البنفسجي→الأزرق على أبيض، والرمادي الافتراضي #333 على #fff بلا هوية.
`;

export const TYPE_LIBRARY = `
=== مكتبة الخطوط (زوج واحد فقط: عنوان + نص، ووزنان لكل عائلة) ===
عربي: IBM Plex Sans Arabic (تقني نظيف) · Tajawal (ودود عصري) · Cairo (محايد قوي) ·
Almarai (تحريري هادئ) · Rubik (جريء حديث) · Readex Pro (عناوين معاصرة) ·
Amiri أو Aref Ruqaa (عناوين تراثية فقط، للنص لا).
لاتيني/أرقام: Inter · Sora · Space Grotesk · Manrope. أحادي: JetBrains Mono · IBM Plex Mono.
أزواج موصى بها: Readex Pro + IBM Plex Sans Arabic · Tajawal + Inter · Rubik + Manrope · Almarai + Sora.
مقياس: h1 clamp(2rem,5vw,3.5rem)/1.15 · h2 clamp(1.5rem,3vw,2.25rem) · نص 17px/1.8 ·
تباعد حروف العناوين العربية 0 (لا تستخدم letter-spacing سالباً مع العربية) · أقصى عرض سطر 65 محرفاً.
`;

export const ICON_LIBRARY = `
=== مكتبة الأيقونات (SVG مضمّن = صفر اعتمادية، هذا الأسلوب الافتراضي) ===
عرّف <svg style="display:none"><symbol id="i-x" viewBox="0 0 24 24">…</symbol>…</svg> مرة واحدة،
ثم استعمل <svg class="ico" aria-hidden="true"><use href="#i-x"></use></svg>
مع .ico{width:1.25em;height:1.25em;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
مسارات جاهزة (نمط Lucide، 24×24):
check   M20 6 9 17l-5-5
arrow   M5 12h14M13 6l6 6-6 6            (اقلبها في RTL بـ transform:scaleX(-1))
star    M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z
shield  M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z
bolt    M13 2 4 14h7l-1 8 9-12h-7z
clock   M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2
mail    M3 6h18v12H3zM3 6l9 7 9-7
phone   M4 4h4l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v4a16 16 0 0 1-16-16z
user    M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0
chart   M4 20V10M10 20V4M16 20v-7M22 20H2
layers  M12 3l9 5-9 5-9-5zM3 13l9 5 9-5
search  M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3
menu    M4 7h16M4 12h16M4 17h16
close   M6 6l12 12M18 6 6 18
قواعد: طقم واحد فقط، سماكة موحّدة، حجم 20–24px داخل النص، aria-hidden للأيقونة الزخرفية،
واسم بديل عبر <span class="sr-only"> للأيقونة التي تحمل معنى. ممنوع الإيموجي بديلاً عن الأيقونة.
`;

export const SHAPE_LIBRARY = `
=== مكتبة الأشكال والأنماط (CSS/SVG أصلي، بلا صور ثقيلة) ===
شبكة نقاط: background-image:radial-gradient(currentColor 1px,transparent 1px);background-size:22px 22px;opacity:.08
شبكة خطوط: linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:48px 48px
توهّج شبكي (mesh): radial-gradient(60% 60% at 20% 20%,color-mix(in oklab,var(--primary) 22%,transparent),transparent 70%), radial-gradient(50% 50% at 85% 10%,color-mix(in oklab,var(--accent) 18%,transparent),transparent 70%)
حبيبات (grain): طبقة ::after مع SVG feTurbulence بـ data:URI وopacity .05 وmix-blend-mode:overlay
فاصل موجي: <svg viewBox="0 0 1440 90" preserveAspectRatio="none"><path d="M0 60 C 240 0 480 90 720 60 S 1200 0 1440 45 V90 H0Z" fill="var(--surface)"/></svg>
فاصل مائل: clip-path:polygon(0 0,100% 4vw,100% 100%,0 100%)
كتلة عضوية (blob): border-radius:58% 42% 39% 61% / 45% 52% 48% 55%
حلقات متحدة المركز: repeating-radial-gradient(circle at 70% 30%,transparent 0 18px,color-mix(in oklab,var(--primary) 10%,transparent) 18px 19px)
بطاقة زجاجية: background:color-mix(in oklab,var(--surface) 70%,transparent);backdrop-filter:blur(14px);border:1px solid color-mix(in oklab,var(--fg) 8%,transparent)
حد متدرّج: border:1px solid transparent;background:linear-gradient(var(--surface),var(--surface)) padding-box,linear-gradient(120deg,var(--primary),var(--accent)) border-box
إطار منقّط عربي: استخدم زوايا radius غير متساوية (24px 4px 24px 4px) لهوية بصرية مميزة.
قاعدة: شكل خلفي واحد مسيطر لكل قسم، ولا يتكرر نفس النمط في قسمين متتاليين.
`;

export const LAYOUT_LIBRARY = `
=== مكتبة التخطيطات (نوّع بينها؛ ممنوع قسمان متتاليان بنفس البنية) ===
hero-split (نص + بصري) · hero-centered (نص وسط + توهّج) · bento (شبكة بأحجام مختلطة) ·
zigzag (صف صورة/نص متبادل) · stat-band (شريط أرقام عريض) · timeline (خط زمني رأسي) ·
comparison-table (جدول مقارنة) · pricing-tiers (ثلاث بطاقات مع بطاقة مميّزة مرفوعة) ·
logo-marquee (شريط شعارات متحرك بـ CSS) · faq-accordion (<details>/<summary> أصلي) ·
testimonial-quote (اقتباس كبير مفرد) · gallery-masonry (columns في CSS) ·
sticky-sidebar (position:sticky) · steps-3 (ثلاث خطوات مرقّمة) · cta-band (نداء أخير عريض).
إيقاع: hero → قيمة → دليل (أرقام/شعارات) → تفصيل → اعتراضات (FAQ) → CTA.
مسافات رأسية: 96–128px على الديسكتوب، 56–72px على الجوال، حاوية 1120–1200px.
`;

export const INNOVATION_LIBRARY = `
=== لمسات ابتكارية (أصلية في المتصفح، بلا مكتبات) ===
ظهور عند التمرير: IntersectionObserver يضيف .in مع transition على opacity/transform فقط.
حركة مرتبطة بالتمرير: animation-timeline:view() مع @supports fallback.
انتقالات صفحات: document.startViewTransition عند دعمه.
عدّاد أرقام: requestAnimationFrame مع easing، يبدأ عند دخول العنصر.
تمييز تفاعلي: تحديث --mx/--my عبر pointermove ثم radial-gradient يتبع المؤشر.
إمالة خفيفة للبطاقة: rotate3d بحدود 4 درجات، تُلغى مع prefers-reduced-motion.
تمرير أفقي لاصق: scroll-snap-type:x mandatory + scroll-snap-align:center.
شريط تقدّم القراءة: عنصر ثابت بعرض يعتمد على scrollY.
تبويبات وحوارات: <details> و<dialog> الأصليان بدل مكتبات.
استعلامات الحاوية: container-type:inline-size لبطاقات تتكيّف مع مكانها لا مع الشاشة.
:has() لحالات الأب، :focus-visible لكل عنصر تفاعلي، prefers-color-scheme لوضع ليلي حقيقي.
كل حركة: transform/opacity فقط، 150–400ms، ومحاطة بـ @media (prefers-reduced-motion: reduce){}.
`;

/** المكتبة الكاملة كما تُحقن في نص النظام. */
export const DESIGN_LIBRARY = `

=== مكتبات التصميم المرجعية (اختر منها صراحةً وصرّح باختيارك قبل الكتابة) ===
قبل أول ملف اكتب سطراً واحداً: «الاتجاه: … | اللوحة: … | الخطوط: … | التخطيطات: … | الشكل المسيطر: … | اللمسة الابتكارية: …»
ثم التزم به في كل الملفات.
${COLOR_LIBRARY}${TYPE_LIBRARY}${ICON_LIBRARY}${SHAPE_LIBRARY}${LAYOUT_LIBRARY}${INNOVATION_LIBRARY}${ART_DIRECTION_KIT}
`;

