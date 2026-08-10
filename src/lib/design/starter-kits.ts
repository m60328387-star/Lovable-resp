/**
 * أطقم البداية — أرضية جودة عالية لكل نوع منتج.
 * لا تُعيد HTML مكرّراً: تُركّب قصاصات Weaver UI في خطة صفحات + عقد محتوى،
 * فيبدأ الوكيل من سقفٍ عالٍ بدل صفحة بيضاء.
 */
import { UI_SNIPPETS, type UiSnippet } from "./ui-library";

export interface StarterPage {
  /** اسم الملف داخل المشروع */
  path: string;
  /** عنوان الصفحة */
  title: string;
  /** ترتيب أقسام الصفحة بمعرّفات قصاصات Weaver UI */
  sections: string[];
}

export interface StarterKit {
  id: string;
  name: string;
  /** متى يُستخدم هذا الطقم */
  use: string;
  /** طابع الهوية المقترح لتمريره إلى brand_kit */
  personality: string;
  /** لون أساس مقترح */
  baseColor: string;
  pages: StarterPage[];
  /** أقسام إلزامية لا يجوز حذفها */
  required: string[];
  /** عقد المحتوى: ما الذي يجب أن يقوله كل قسم */
  copyContract: Record<string, string>;
  /** معايير قبول إضافية خاصة بهذا النوع */
  acceptance: string[];
  /** ما يُمنع في هذا النوع */
  avoid: string[];
}

const common = (extra: string[] = []) => [
  "كل نص عربي حقيقي ومحدّد — ممنوع lorem أو «نص تجريبي» أو «اسم الشركة».",
  "كل رابط في الهيدر والفوتر يشير إلى قسم أو صفحة موجودة فعلاً.",
  "الصفحة تعمل على 390px بلا تمرير أفقي وبقائمة جوال شغّالة.",
  "designGate ≥ 85 على desktop وmobile قبل النشر.",
  ...extra,
];

export const STARTER_KITS: Record<string, StarterKit> = {
  saas: {
    id: "saas",
    name: "منتج SaaS / تطبيق",
    use: "منصة اشتراك، أداة برمجية، لوحة تحكم تُباع بخطط شهرية.",
    personality: "modern-tech",
    baseColor: "#2563eb",
    pages: [
      {
        path: "index.html",
        title: "الرئيسية",
        sections: [
          "header",
          "hero",
          "stats",
          "features",
          "bento",
          "steps",
          "testimonials",
          "pricing",
          "faq",
          "cta",
          "footer",
        ],
      },
      {
        path: "pricing.html",
        title: "الأسعار",
        sections: ["header", "pricing", "faq", "cta", "footer"],
      },
      {
        path: "contact.html",
        title: "تواصل",
        sections: ["header", "contact_form", "footer"],
      },
    ],
    required: ["hero", "features", "pricing", "faq", "cta", "footer"],
    copyContract: {
      hero: "وعد قيمة واحد واضح في ≤ 10 كلمات + جملة توضح لمن المنتج وما المشكلة التي يحلّها + زرّان (ابدأ مجاناً / شاهد العرض).",
      stats: "4 أرقام قابلة للتصديق: عملاء، وقت موفَّر، وقت التشغيل، تقييم.",
      features: "6 ميزات، كل واحدة بعنوان فعل + جملة نتيجة للمستخدم لا وصف تقني.",
      steps: "3 خطوات من التسجيل إلى النتيجة الأولى.",
      pricing: "3 خطط بأسعار حقيقية، خطة موصى بها واحدة، وقائمة مزايا مختلفة بين الخطط لا مكررة.",
      faq: "6 أسئلة تعالج اعتراضات شراء حقيقية (السعر، الإلغاء، البيانات، الدعم، التكامل، التجربة).",
      cta: "دعوة أخيرة بلا حواجز + جملة تقليل مخاطرة (بلا بطاقة ائتمان).",
    },
    acceptance: common([
      "جدول الأسعار يعمل كبطاقات على الجوال.",
      "الخطة الموصى بها مميّزة بصرياً بحدّ ملوّن وشارة.",
    ]),
    avoid: ["صور مخزون عامة لرجال أعمال بربطات عنق", "ادعاءات أرقام خيالية", "خطط أسعار متطابقة"],
  },

  store: {
    id: "store",
    name: "متجر إلكتروني",
    use: "بيع منتجات مادية أو رقمية مع كتالوج وسلة.",
    personality: "clean-commerce",
    baseColor: "#0f766e",
    pages: [
      {
        path: "index.html",
        title: "المتجر",
        sections: ["header", "hero", "gallery", "features", "testimonials", "faq", "cta", "footer"],
      },
      {
        path: "product.html",
        title: "صفحة منتج",
        sections: ["header", "gallery", "features", "faq", "cta", "footer"],
      },
      {
        path: "contact.html",
        title: "تواصل",
        sections: ["header", "contact_form", "footer"],
      },
    ],
    required: ["hero", "gallery", "faq", "footer"],
    copyContract: {
      hero: "عرض البيع الأساسي + شحن/ضمان + زر تسوّق الآن.",
      gallery: "8 منتجات على الأقل بأسماء وأسعار حقيقية وصور بأبعاد محدّدة.",
      features: "أسباب الشراء: الشحن، الإرجاع، الجودة، الدفع الآمن.",
      faq: "الشحن، الإرجاع، طرق الدفع، مدة التوصيل، الضمان، التتبّع.",
    },
    acceptance: common([
      "كل بطاقة منتج تعرض السعر والعملة وزر إضافة.",
      "شبكة المنتجات 4 أعمدة على الديسكتوب وعمودان على الجوال.",
    ]),
    avoid: ["أسعار بلا عملة", "بطاقات منتج بلا صورة", "خصومات وهمية"],
  },

  agency: {
    id: "agency",
    name: "وكالة / خدمات",
    use: "شركة خدمات، وكالة تسويق أو برمجة، استشارات.",
    personality: "bold-editorial",
    baseColor: "#111827",
    pages: [
      {
        path: "index.html",
        title: "الرئيسية",
        sections: [
          "header",
          "hero",
          "stats",
          "features",
          "gallery",
          "steps",
          "testimonials",
          "faq",
          "cta",
          "footer",
        ],
      },
      {
        path: "work.html",
        title: "أعمالنا",
        sections: ["header", "gallery", "testimonials", "cta", "footer"],
      },
      {
        path: "contact.html",
        title: "تواصل",
        sections: ["header", "contact_form", "footer"],
      },
    ],
    required: ["hero", "features", "gallery", "testimonials", "cta", "footer"],
    copyContract: {
      hero: "تخصّص الوكالة في جملة + النتيجة التي تحقّقها للعميل + زر حجز مكالمة.",
      features: "الخدمات كنتائج تجارية لا مسمّيات (مثال: «نضاعف طلبات المتجر» لا «تسويق رقمي»).",
      gallery: "6 دراسات حالة بعنوان العميل + النتيجة الرقمية.",
      testimonials: "3 شهادات باسم ومنصب وشركة.",
      steps: "من الاستكشاف إلى التسليم في 3–4 خطوات.",
    },
    acceptance: common(["كل دراسة حالة تحمل رقم نتيجة واحداً على الأقل."]),
    avoid: ["كلام عام عن «الإبداع» و«الشغف»", "شهادات مجهولة الاسم"],
  },

  luxury: {
    id: "luxury",
    name: "علامة فاخرة",
    use: "عقار راقٍ، مجوهرات، ضيافة، سيارات، علامة فاخرة.",
    personality: "luxury-serif",
    baseColor: "#8a6a3b",
    pages: [
      {
        path: "index.html",
        title: "الرئيسية",
        sections: ["header", "hero", "gallery", "features", "testimonials", "cta", "footer"],
      },
      {
        path: "contact.html",
        title: "استفسار خاص",
        sections: ["header", "contact_form", "footer"],
      },
    ],
    required: ["hero", "gallery", "cta", "footer"],
    copyContract: {
      hero: "جملة واحدة مقتضبة عالية النبرة + زر واحد فقط.",
      gallery: "صور كبيرة بنسبة ثابتة ونصوص قليلة.",
      features: "3 قيم فقط: الحِرفية، الندرة، الخدمة الخاصة.",
    },
    acceptance: common([
      "مساحات بيضاء واسعة: padding الأقسام ≥ 96px على الديسكتوب.",
      "لوحة ألوان ≤ 5 ألوان وخط عناوين serif.",
    ]),
    avoid: ["ألوان صارخة", "ازدحام عناصر", "أكثر من زر إجراء في الهيرو"],
  },

  portfolio: {
    id: "portfolio",
    name: "ملف شخصي / بورتفوليو",
    use: "مصمّم، مطوّر، مصوّر، كاتب يعرض أعماله.",
    personality: "minimal-mono",
    baseColor: "#18181b",
    pages: [
      {
        path: "index.html",
        title: "الرئيسية",
        sections: [
          "header",
          "hero",
          "gallery",
          "features",
          "testimonials",
          "contact_form",
          "footer",
        ],
      },
    ],
    required: ["hero", "gallery", "contact_form", "footer"],
    copyContract: {
      hero: "من أنا + ماذا أصنع + لمن، في سطرين.",
      gallery: "6 أعمال بعنوان ودور ونتيجة.",
      features: "المهارات كأدوات فعلية لا نسب مئوية.",
    },
    acceptance: common(["الصفحة الواحدة بها تنقّل داخلي يعمل بسلاسة."]),
    avoid: ["أشرطة مهارات بنِسَب مئوية", "أعمال بلا وصف"],
  },

  restaurant: {
    id: "restaurant",
    name: "مطعم / مقهى",
    use: "مطعم، مقهى، حلويات مع قائمة طعام وحجز.",
    personality: "warm-appetite",
    baseColor: "#b45309",
    pages: [
      {
        path: "index.html",
        title: "الرئيسية",
        sections: ["header", "hero", "gallery", "features", "testimonials", "faq", "cta", "footer"],
      },
      {
        path: "menu.html",
        title: "القائمة",
        sections: ["header", "gallery", "cta", "footer"],
      },
    ],
    required: ["hero", "gallery", "footer"],
    copyContract: {
      hero: "نوع المطبخ + الموقع + زر حجز طاولة.",
      gallery: "أطباق بأسماء وأسعار حقيقية.",
      features: "ساعات العمل، التوصيل، الحجز، المواقف.",
      footer: "العنوان الكامل ورقم الهاتف وخريطة وساعات العمل.",
    },
    acceptance: common(["رقم الهاتف قابل للنقر tel: والعنوان مرتبط بخريطة."]),
    avoid: ["قائمة طعام بلا أسعار", "صور غير متعلّقة بالمطبخ"],
  },

  landing: {
    id: "landing",
    name: "صفحة هبوط لحملة",
    use: "إطلاق منتج، تسجيل في ندوة، جمع بريد، عرض محدود.",
    personality: "high-conversion",
    baseColor: "#dc2626",
    pages: [
      {
        path: "index.html",
        title: "الصفحة",
        sections: ["hero", "stats", "features", "testimonials", "faq", "cta", "footer"],
      },
    ],
    required: ["hero", "cta", "faq"],
    copyContract: {
      hero: "عرض واحد + مهلة/ندرة صادقة + نموذج أو زر واحد.",
      features: "3 فوائد فقط، كل واحدة نتيجة قابلة للقياس.",
      faq: "إزالة اعتراضات الشراء الخمسة الأولى.",
      cta: "تكرار العرض نفسه بصياغة مختلفة.",
    },
    acceptance: common([
      "هدف تحويل واحد فقط في كل الصفحة — لا روابط خارجية مشتّتة.",
      "لا هيدر تنقّل يسحب الزائر بعيداً.",
    ]),
    avoid: ["عدة أهداف تحويل", "قوائم تنقّل طويلة", "ندرة كاذبة"],
  },

  blog: {
    id: "blog",
    name: "مدوّنة / محتوى",
    use: "موقع مقالات، مجلة، قاعدة معرفة.",
    personality: "editorial-serif",
    baseColor: "#1d4ed8",
    pages: [
      {
        path: "index.html",
        title: "الرئيسية",
        sections: ["header", "hero", "gallery", "cta", "footer"],
      },
      {
        path: "post.html",
        title: "مقال",
        sections: ["header", "cta", "footer"],
      },
    ],
    required: ["header", "gallery", "footer"],
    copyContract: {
      hero: "موضوع المدوّنة ولمن تكتب.",
      gallery: "6 مقالات بعناوين حقيقية وتاريخ ووقت قراءة.",
      cta: "اشتراك بالبريد مع سبب واضح للاشتراك.",
    },
    acceptance: common([
      "عرض سطر النص في صفحة المقال 60–75 حرفاً.",
      "ارتفاع السطر ≥ 1.7 في متن المقال.",
    ]),
    avoid: ["عناوين مقالات وهمية مرقّمة", "نص متن بعرض الشاشة كاملاً"],
  },
};

export function listStarterKits(): { id: string; name: string; use: string }[] {
  return Object.values(STARTER_KITS).map((k) => ({ id: k.id, name: k.name, use: k.use }));
}

export function getStarterKit(id: string): StarterKit | null {
  return STARTER_KITS[id] ?? null;
}

/** يبني خطة تنفيذ كاملة: الصفحات + القصاصات المطلوبة + عقد المحتوى. */
export function planFromKit(id: string): {
  kit: StarterKit;
  snippets: UiSnippet[];
  plan: { path: string; title: string; sections: string[]; missing: string[] }[];
} | null {
  const kit = getStarterKit(id);
  if (!kit) return null;
  const ids = [...new Set(kit.pages.flatMap((p) => p.sections))];
  const snippets = ids.map((s) => UI_SNIPPETS[s]).filter((s): s is UiSnippet => Boolean(s));
  const plan = kit.pages.map((p) => ({
    path: p.path,
    title: p.title,
    sections: p.sections,
    missing: p.sections.filter((s) => !UI_SNIPPETS[s]),
  }));
  return { kit, snippets, plan };
}
