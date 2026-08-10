export type DesignBlueprintKind =
  "saas" | "commerce" | "luxury" | "editorial" | "service" | "portfolio" | "dashboard" | "custom";

export type DesignBlueprint = {
  version: 1;
  kind: DesignBlueprintKind;
  direction: string;
  signature: string;
  composition: string[];
  imagePlan: string[];
  interactionPlan: string[];
  qualityBar: string[];
  forbidden: string[];
};

const BLUEPRINTS: Record<Exclude<DesignBlueprintKind, "custom">, Omit<DesignBlueprint, "kind">> = {
  saas: {
    version: 1,
    direction: "Soft SaaS product theatre",
    signature: "لقطة المنتج هي البطل، مع شريط نتائج حقيقي وتفاصيل تقنية كثيفة بلا زخرفة عامة.",
    composition: [
      "هيرو نصي فوق لقطة منتج عريضة",
      "شريط نتائج بلا بطاقات",
      "ميزات bento غير متناظرة",
      "تدفق عمل مرقّم",
      "دليل اجتماعي",
      "CTA واحد",
    ],
    imagePlan: ["لقطة واجهة حقيقية أو mockup واضح للمنتج", "تفصيل مقرّب لميزة أساسية"],
    interactionPlan: [
      "تبديل حي بين حالات المنتج",
      "reveal خفيف للأقسام",
      "حالات hover/focus كاملة",
    ],
    qualityBar: [
      "المنتج ظاهر في أول viewport",
      "لا نص ادعائي بلا دليل مرئي",
      "كل حالة loading/empty/error مصممة",
    ],
    forbidden: [
      "gradient بنفسجي افتراضي",
      "orbs زخرفية",
      "hero split داخل بطاقتين",
      "صفوف بطاقات متطابقة",
    ],
  },
  commerce: {
    version: 1,
    direction: "Editorial commerce catalogue",
    signature:
      "المنتج كبير وقابل للفحص، والكثافة التجارية واضحة دون تحويل الصفحة إلى شبكة بطاقات رتيبة.",
    composition: [
      "هيرو منتج full-bleed",
      "شريط فئات",
      "مجموعة مختارة غير متناظرة",
      "تفصيل مادة/صناعة",
      "مراجعات",
      "خدمات الشحن والضمان",
    ],
    imagePlan: ["صورة hero للمنتج بإضاءة متوافقة مع اللوحة", "صورتان تفصيليتان للخامة والاستخدام"],
    interactionPlan: ["معرض صور قابل للتنقل", "سلة وكمية تعملان فعلياً", "تكبير صورة منضبط"],
    qualityBar: ["السعر والإجراء ظاهران", "صور بنسبة ثابتة بلا قص مؤذٍ", "الفلاتر والسلة تعملان"],
    forbidden: ["placeholder images", "صور منتجات مظلمة", "badge لكل عنصر", "CTA متعدد الألوان"],
  },
  luxury: {
    version: 1,
    direction: "Quiet luxury editorial",
    signature: "مساحات محسوبة وصورة معمارية أو منتجية قوية، مع ذهب محدود وطباعة رصينة.",
    composition: [
      "هيرو full-bleed",
      "بيان علامة كبير",
      "معرض متداخل",
      "أرقام بخطوط فاصلة",
      "قصة تفصيلية",
      "طلب خاص",
    ],
    imagePlan: ["صورة رئيسية سينمائية واضحة للموضوع", "صورتان معماريتان أو تفصيليتان متناسقتان"],
    interactionPlan: ["انتقالات opacity/transform هادئة", "معرض scroll-snap", "مؤشر دقيق للحالة"],
    qualityBar: ["لا ازدحام", "التباين AA رغم رقة الألوان", "الصور متطابقة في المعالجة"],
    forbidden: ["neon", "ظلال قوية", "بطاقات كثيرة", "عناوين sans سميكة", "ذهب يغطي أقساماً كاملة"],
  },
  editorial: {
    version: 1,
    direction: "Contemporary editorial grid",
    signature: "شبكة مطبوعة مكسورة عمداً، مع عناوين قوية وصور ذات تعليق تحريري.",
    composition: [
      "غلاف مجلة",
      "فهرس موضوعات",
      "قصة رئيسية",
      "شبكة أعمال masonry",
      "اقتباس كبير",
      "أرشيف",
    ],
    imagePlan: ["غلاف موضوعي قوي", "صور محتوى متنوعة القصّ مع معالجة موحدة"],
    interactionPlan: ["مرشح موضوعات", "قراءة متدرجة", "انتقال بين الأعمال"],
    qualityBar: ["إيقاع طباعي واضح", "عرض سطر مقروء", "كل صورة لها غرض وتعليق"],
    forbidden: ["dashboard cards", "أيقونة لكل عنوان", "تمركز كل النصوص", "شبكة متساوية بلا هرمية"],
  },
  service: {
    version: 1,
    direction: "Operational service confidence",
    signature: "أداة الحجز أو الطلب هي البطل، مدعومة بصور الخدمة ودليل ثقة مباشر.",
    composition: [
      "هيرو بصورة حقيقية ونموذج طلب",
      "مؤشرات ثقة",
      "الخدمات",
      "كيف تعمل",
      "مناطق التغطية",
      "شهادات",
      "FAQ",
    ],
    imagePlan: ["الخدمة أثناء التنفيذ", "فريق أو مكان العمل الحقيقي", "تفصيل نتيجة الخدمة"],
    interactionPlan: ["نموذج متعدد الخطوات قصير", "تحقق فوري", "حالة نجاح واضحة"],
    qualityBar: ["الإجراء الأساسي يعمل", "الهاتف/الموقع واضحان", "المصداقية قبل الزخرفة"],
    forbidden: ["صور stock عامة", "نموذج داخل modal بلا داعٍ", "أرقام ثقة مختلقة", "CTA غامض"],
  },
  portfolio: {
    version: 1,
    direction: "Case-study first portfolio",
    signature: "الأعمال والنتائج تسبق السيرة، وكل مشروع يعرض المشكلة والقرار والأثر.",
    composition: [
      "اسم وتخصص مع عمل مميز",
      "شريط عملاء",
      "دراسات حالة",
      "منهج العمل",
      "نبذة مختصرة",
      "تواصل",
    ],
    imagePlan: ["لقطة رئيسية لأفضل عمل", "لقطات نتائج فعلية لكل دراسة حالة"],
    interactionPlan: ["انتقال case study", "معرض قبل/بعد", "تواصل مباشر"],
    qualityBar: ["عمل حقيقي في أول viewport", "النتائج قابلة للمسح", "لا مهارات كنسب مئوية"],
    forbidden: ["صورة شخصية بلا أعمال", "skill bars", "neon لمجرد الزخرفة", "mockups غير مقروءة"],
  },
  dashboard: {
    version: 1,
    direction: "Dense professional operations console",
    signature:
      "قرار المستخدم هو محور الشاشة: بيانات قابلة للمقارنة، مرشحات ثابتة، وتفاصيل عند الطلب.",
    composition: [
      "تنقل جانبي",
      "شريط سياق وفلاتر",
      "KPI مضغوط",
      "رسم رئيسي",
      "جدول كثيف",
      "لوحة تفاصيل",
    ],
    imagePlan: ["لا صور زخرفية؛ استخدم البيانات والرسوم فقط"],
    interactionPlan: ["فلاتر تعمل", "فرز وترقيم", "تفاصيل صف", "loading/empty/error"],
    qualityBar: ["المقارنة سريعة", "الأرقام مصطفة", "لا قفز تخطيط", "الجوال يعيد ترتيب الأولويات"],
    forbidden: ["بطاقات داخل بطاقات", "hero تسويقي", "زجاج وتمويه", "ألوان كثيرة للرسوم"],
  },
};

export function buildDesignBlueprint(input: {
  kind: DesignBlueprintKind;
  direction?: string;
  signature?: string;
}): DesignBlueprint {
  if (input.kind === "custom") {
    return {
      version: 1,
      kind: "custom",
      direction: input.direction?.trim() || "اتجاه مخصص مرتبط بموضوع المنتج",
      signature: input.signature?.trim() || "عنصر بصري واحد مميز يتكرر بانضباط عبر التجربة.",
      composition: [
        "تجربة أولى تكشف المنتج",
        "دليل قيمة",
        "تدفق أساسي",
        "تفاصيل",
        "قبول واعتراضات",
        "إجراء ختامي",
      ],
      imagePlan: ["صورة رئيسية تكشف المنتج أو الحالة الفعلية", "صورتان داعمتان متسقتان"],
      interactionPlan: ["تفاعل المجال الأساسي", "حالات كاملة", "حركة transform/opacity فقط"],
      qualityBar: ["هوية واضحة من أول viewport", "هرمية ومسافات ثابتة", "تجربة جوال مكتملة"],
      forbidden: ["قالب SaaS عام", "orbs", "بطاقات متداخلة", "صور placeholder", "زخرفة بلا معنى"],
    };
  }
  const blueprint = BLUEPRINTS[input.kind];
  return { ...blueprint, kind: input.kind };
}
