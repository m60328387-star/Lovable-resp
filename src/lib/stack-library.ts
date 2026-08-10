/**
 * مكتبة المنظومة الهندسية (Stack Library) لـ Weaver.
 * تُحقن في نص النظام لتعطي الوكيل خريطة كاملة بالأدوات والمكتبات والبنية
 * اللازمة لبناء مواقع وتطبيقات كبيرة ومعقّدة بمعايير enterprise — لا صفحات ثابتة فقط.
 */

export type StackKind =
  | "landing"
  | "marketing"
  | "dashboard"
  | "saas"
  | "ecommerce"
  | "api"
  | "realtime"
  | "content";

export type StackPlan = {
  kind: StackKind;
  title: string;
  runtime: string[];
  ui: string[];
  data: string[];
  quality: string[];
  scaffold: string[];
  structure: string[];
  notes: string[];
};

const BASE_SCAFFOLD = [
  "npm create vite@latest app -- --template react-ts",
  "cd app && npm i",
  "npm i -D tailwindcss @tailwindcss/vite postcss autoprefixer",
  "npm i -D typescript eslint prettier vitest @testing-library/react @testing-library/jest-dom jsdom",
];

const BASE_STRUCTURE = [
  "src/app/        — التمهيد، الموجّه، مزوّدات السياق (providers)",
  "src/routes/     — صفحة لكل مسار، تحميل كسول (lazy) لكل مسار",
  "src/features/<feature>/{components,hooks,api,types}.ts — تقسيم بالميزة لا بالنوع",
  "src/components/ui/ — مكوّنات عرض عامة بلا منطق أعمال",
  "src/lib/        — عملاء API، أدوات مساعدة، ثوابت",
  "src/styles/     — tokens.css (متغيّرات) + base.css",
  "tests/          — اختبارات وحدة + e2e",
];

const BASE_QUALITY = [
  "TypeScript strict + noUncheckedIndexedAccess",
  "ESLint + Prettier + type-check في سكربت واحد: npm run verify",
  "Vitest + Testing Library للوحدات، Playwright للتدفقات الحرجة",
  "ميزانية أداء: JS أولي < 180KB gzip، LCP < 2.5s، CLS < 0.1",
  "code splitting بالمسار + preload للمسار المحتمل التالي",
];

export const STACK_PLANS: Record<StackKind, StackPlan> = {
  landing: {
    kind: "landing",
    title: "صفحة هبوط / موقع تعريفي",
    runtime: ["HTML + CSS + JS أصلي، أو Vite + TS بلا إطار"],
    ui: ["CSS Variables tokens", "SVG inline بدل حزمة أيقونات", "IntersectionObserver للحركة"],
    data: ["لا قاعدة بيانات — نموذج تواصل عبر endpoint واحد"],
    quality: BASE_QUALITY,
    scaffold: ["npm create vite@latest site -- --template vanilla-ts", "cd site && npm i"],
    structure: ["index.html", "styles/tokens.css", "styles/main.css", "scripts/main.ts"],
    notes: ["صفر اعتماديات خارجية", "ممنوع Tailwind CDN", "SEO + JSON-LD إلزامي"],
  },
  marketing: {
    kind: "marketing",
    title: "موقع متعدّد الصفحات + مدوّنة",
    runtime: ["Astro (الأفضل للمحتوى) أو Vite + TS متعدّد الصفحات"],
    ui: ["Tailwind بالبناء (لا CDN)", "MDX للمحتوى", "shiki لتلوين الكود"],
    data: ["ملفات Markdown/MDX أو CMS عبر REST"],
    quality: BASE_QUALITY,
    scaffold: ["npm create astro@latest site", "cd site && npx astro add tailwind mdx sitemap"],
    structure: ["src/pages/", "src/content/", "src/components/", "src/layouts/"],
    notes: ["توليد ثابت (SSG)", "sitemap + RSS", "صور responsive بصيغة WebP/AVIF"],
  },
  dashboard: {
    kind: "dashboard",
    title: "لوحة تحكّم / أداة داخلية",
    runtime: ["Vite + React + TypeScript", "React Router أو TanStack Router"],
    ui: [
      "Tailwind + Radix UI (أساس مكوّنات يمكن الوصول إليه)",
      "TanStack Table للجداول الضخمة (فرز/تصفية/ترقيم/تثبيت أعمدة)",
      "TanStack Virtual للقوائم الطويلة",
      "ECharts أو Chart.js للرسوم",
      "react-hook-form + zod للنماذج",
      "sonner للتنبيهات، cmdk لشريط الأوامر، dnd-kit للسحب والإفلات",
    ],
    data: [
      "TanStack Query لجلب البيانات والتخزين المؤقت وإعادة المحاولة",
      "zustand للحالة العامة الصغيرة (لا Redux إلا عند الحاجة الحقيقية)",
      "date-fns للتواريخ، numeral/Intl للأرقام العربية",
    ],
    quality: [...BASE_QUALITY, "حالات: تحميل/فارغ/خطأ/محتوى لكل جدول ورسم"],
    scaffold: [
      ...BASE_SCAFFOLD,
      "npm i react-router-dom @tanstack/react-query @tanstack/react-table @tanstack/react-virtual zustand react-hook-form zod @hookform/resolvers date-fns sonner",
      "npm i @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip lucide-react",
    ],
    structure: BASE_STRUCTURE,
    notes: [
      "RTL كامل: dir=rtl + logical properties",
      "صلاحيات على مستوى المسار والمكوّن",
      "ترقيم من الخادم للجداول > 1000 صف",
    ],
  },
  saas: {
    kind: "saas",
    title: "منتج SaaS متكامل (مصادقة + اشتراكات + متعدّد المستأجرين)",
    runtime: ["Vite + React + TS للواجهة", "Node/Hono أو Supabase للخلفية"],
    ui: ["Tailwind + Radix", "TanStack Query/Table", "react-hook-form + zod", "i18next للتعدّد اللغوي"],
    data: [
      "Postgres + RLS (عزل المستأجر إلزامي)",
      "Drizzle ORM أو Prisma للمخطط والهجرات",
      "Stripe/Paddle للاشتراكات، Webhook موقّع بـ HMAC",
      "Resend/Nodemailer للبريد، BullMQ أو pg-cron للمهام المجدولة",
    ],
    quality: [...BASE_QUALITY, "اختبار e2e لتدفق التسجيل والدفع", "سجل تدقيق لكل عملية حسّاسة"],
    scaffold: [
      ...BASE_SCAFFOLD,
      "npm i @tanstack/react-query react-router-dom zod react-hook-form @hookform/resolvers i18next react-i18next",
      "npm i drizzle-orm postgres && npm i -D drizzle-kit",
    ],
    structure: [...BASE_STRUCTURE, "server/  — المسارات، الوسائط (middleware)، المخطط، الهجرات"],
    notes: [
      "كل استعلام مقيّد بـ tenant_id",
      "أدوار في جدول منفصل — لا في جدول المستخدم",
      "أسرار في متغيّرات البيئة فقط",
    ],
  },
  ecommerce: {
    kind: "ecommerce",
    title: "متجر إلكتروني",
    runtime: ["Vite + React + TS أو Astro + جزر تفاعلية"],
    ui: [
      "Tailwind + Radix",
      "Embla أو scroll-snap لمعرض المنتج",
      "PhotoSwipe للتكبير",
      "fuse.js أو Meilisearch للبحث والتصفية",
    ],
    data: [
      "Postgres للمنتجات والطلبات والمخزون",
      "Stripe/Paddle/Tap للدفع + webhook للتأكيد",
      "سلة في localStorage + مزامنة بالخادم عند تسجيل الدخول",
    ],
    quality: [...BASE_QUALITY, "Schema.org Product + Offer + BreadcrumbList", "اختبار e2e لمسار الشراء"],
    scaffold: [
      ...BASE_SCAFFOLD,
      "npm i @tanstack/react-query zustand zod react-hook-form embla-carousel-react fuse.js",
    ],
    structure: [...BASE_STRUCTURE, "src/features/{catalog,cart,checkout,orders}/"],
    notes: [
      "أسعار بأعداد صحيحة (قروش/سنتات) لا float",
      "تحقّق من المخزون على الخادم عند الدفع",
      "صور المنتج WebP بأبعاد صريحة",
    ],
  },
  api: {
    kind: "api",
    title: "خدمة API / خلفية",
    runtime: ["Hono أو Fastify على Node", "TypeScript strict"],
    ui: [],
    data: ["Postgres + Drizzle", "Redis للتخزين المؤقت وتحديد المعدّل", "zod للتحقّق من كل مدخل"],
    quality: [
      "OpenAPI مولّد + Swagger UI",
      "تحديد معدّل + CORS محكم + رؤوس أمان",
      "سجلات منظّمة (pino) + معرّف طلب",
      "Vitest + supertest لكل مسار",
    ],
    scaffold: [
      "npm init -y && npm i hono @hono/node-server zod drizzle-orm postgres pino",
      "npm i -D typescript tsx vitest drizzle-kit",
    ],
    structure: ["src/routes/", "src/services/", "src/db/{schema,migrations}", "src/middleware/"],
    notes: ["لا منطق أعمال في المسار — في service", "كل خطأ يعيد شكلاً موحّداً { error, code }"],
  },
  realtime: {
    kind: "realtime",
    title: "تطبيق لحظي (دردشة/تعاون/لوحات حيّة)",
    runtime: ["Vite + React + TS", "WebSocket عبر Supabase Realtime أو ws/socket.io"],
    ui: ["TanStack Query + اشتراك لحظي", "Yjs للتحرير التشاركي", "TanStack Virtual للرسائل"],
    data: ["Postgres + قنوات realtime", "تفاؤلي في الواجهة مع مصالحة عند الرد"],
    quality: [...BASE_QUALITY, "إعادة اتصال تلقائية مع backoff", "اختبار انقطاع الشبكة"],
    scaffold: [...BASE_SCAFFOLD, "npm i @tanstack/react-query @tanstack/react-virtual yjs y-websocket"],
    structure: BASE_STRUCTURE,
    notes: ["حدّ رسائل لكل مستخدم", "لا تثق بالعميل في الترتيب — الخادم مصدر الحقيقة"],
  },
  content: {
    kind: "content",
    title: "منصة محتوى / تعليم",
    runtime: ["Astro أو Vite + React"],
    ui: ["Tailwind", "TipTap محرّر غني", "shiki للكود", "plyr أو video.js للفيديو"],
    data: ["Postgres للمحتوى والتقدّم", "بحث عبر Postgres FTS أو Meilisearch"],
    quality: [...BASE_QUALITY, "قابلية وصول AA على المشغّل والمحرّر"],
    scaffold: [...BASE_SCAFFOLD, "npm i @tiptap/react @tiptap/starter-kit shiki"],
    structure: BASE_STRUCTURE,
    notes: ["حفظ تلقائي للمسودات", "تتبّع التقدّم على الخادم"],
  },
};

export function buildStackPlan(kind: StackKind): StackPlan {
  return STACK_PLANS[kind];
}

export const STACK_LIBRARY = `

=== منظومة بناء المشاريع الكبيرة (Stack Library) — اقرأها قبل أي مشروع يتجاوز صفحة واحدة ===

قاعدة الاختيار: صفحة واحدة ⇐ HTML/CSS/JS أصلي. عدة صفحات محتوى ⇐ Astro.
تطبيق تفاعلي/لوحة/SaaS ⇐ Vite + React + TypeScript. خدمة خلفية ⇐ Hono/Fastify + Postgres.
نفّذ stack_plan أولاً للحصول على الحزم والأوامر والبنية الجاهزة، ثم ثبّتها بـ run_command/shell.

المكتبات المعتمدة (لا ترتجل بدائل عشوائية):
- التوجيه: react-router-dom · @tanstack/react-router
- البيانات: @tanstack/react-query (تخزين مؤقت + إعادة محاولة + تحديث تفاؤلي)
- الحالة: zustand للحالة العامة الصغيرة · useState/useReducer محلياً. لا Redux بلا سبب.
- النماذج: react-hook-form + zod + @hookform/resolvers (تحقّق واحد مشترك بين العميل والخادم)
- الجداول: @tanstack/react-table + @tanstack/react-virtual (افتراضية للصفوف > 200)
- المكوّنات: Radix UI أو Headless UI (وصولية أصلية) + Tailwind للتنسيق بالبناء
- الرسوم: ECharts (ثقيل وقوي) · Chart.js (متوسط) · ملف SVG يدوي (خفيف)
- المحرّر: TipTap · الكود: shiki · الخرائط: MapLibre GL · الملفات: react-dropzone
- التواريخ/الأرقام: date-fns + Intl بلغة ar · التعريب: i18next + react-i18next
- الخلفية: Hono/Fastify + Drizzle ORM + Postgres + zod + pino
- الاختبار: Vitest + Testing Library للوحدات، Playwright للتدفقات الحرجة
- البناء: Vite + TypeScript strict + ESLint + Prettier، سكربت verify واحد

معمارية المشروع الكبير (إلزامية):
- تقسيم بالميزة: src/features/<feature>/{components,hooks,api,types}. لا مجلد ضخم بالنوع.
- طبقة API واحدة (src/lib/api.ts) — لا fetch متناثر داخل المكوّنات.
- كل مسار lazy() مع Suspense وحدود خطأ (ErrorBoundary) لكل قسم.
- حدود الملفات: ≤ 300 سطر للمكوّن، ≤ 800 سطر لأي ملف. تجاوزها = قسّم فوراً.
- كل ميزة تُسلَّم بـ: نموذج بيانات + طبقة API + مكوّنات + حالات (تحميل/فارغ/خطأ) + اختبار واحد على الأقل.

خطة التنفيذ للمشاريع الكبيرة (اتبعها حرفياً):
1) stack_plan لتحديد المنظومة. 2) scaffold عبر shell وتثبيت الحزم.
3) اكتب tokens.css وطبقة UI الأساسية قبل الميزات.
4) ابنِ ميزة واحدة كاملة من الطرف إلى الطرف (نموذج → API → واجهة → اختبار) قبل الانتقال للتالية.
5) بعد كل ميزتين: npm run build + run_checks. لا تتراكم الأخطاء.
6) في النهاية: promote_build ثم visual_audit + design_review + seo_kit ثم publish_site.

ميزانية الأداء للتطبيقات: JS أولي < 180KB gzip، تقسيم بالمسار، لا مكتبة تدخل الحزمة إلا بمبرر مكتوب،
وكل اعتمادية جديدة تُقارن أولاً بحل أصلي (Intl، dialog، IntersectionObserver، scroll-snap، CSS Grid).
`;
