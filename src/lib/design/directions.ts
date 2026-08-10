/**
 * موجة 5 — الاتجاهات البصرية: قبل البناء يختار المستخدم اتجاهاً واحداً
 * من ثلاثة اقتراحات محدّدة (لا وصف عام)، فينتهي الجدل حول الذوق مبكراً.
 */
import { getStarterKit } from "./starter-kits";

export interface DesignDirection {
  id: string;
  /** حرف الاتجاه في ART_DIRECTIONS */
  art: string;
  name: string;
  /** وصف قصير يُعرض للمستخدم */
  pitch: string;
  personality: string;
  baseColor: string;
  palette: string[];
  headingFont: string;
  bodyFont: string;
  /** توقيع بصري واحد يميّز هذا الاتجاه */
  signature: string;
  /** ما لا يظهر في هذا الاتجاه */
  avoid: string[];
}

const D: Record<string, DesignDirection> = {
  dark_neon: {
    id: "dark_neon",
    art: "A",
    name: "نيون داكن",
    pitch: "خلفية داكنة عميقة مع توهّج ملوّن خلف المنتج — طابع تقني حديث وجريء.",
    personality: "dark-neon",
    baseColor: "#7C3AED",
    palette: ["#0A0714", "#14101F", "#7C3AED", "#EC4899"],
    headingFont: "IBM Plex Sans Arabic",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "عنوان بتدرّج نصي + توهّج داخلي على البطاقات عند التحويم.",
    avoid: ["ذهبي", "خلفيات فاتحة", "خطوط serif"],
  },
  luxury_gold: {
    id: "luxury_gold",
    art: "B",
    name: "فخامة ذهبية",
    pitch: "خلفية داكنة هادئة، ذهب كلون تمييز وحيد، عناوين serif ومساحات واسعة.",
    personality: "luxury-serif",
    baseColor: "#C9A84C",
    palette: ["#0B0B0B", "#06231C", "#C9A84C", "#F0E3C0"],
    headingFont: "Amiri",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "خط ذهبي رفيع تحت العنوان + حدود ذهبية 1px بلا ظلال قوية.",
    avoid: ["نيون", "تدرّجات صارخة", "أكثر من زر في الهيرو"],
  },
  editorial: {
    id: "editorial",
    art: "C",
    name: "تحريري استوديو",
    pitch: "أقسام متناوبة كريمي/داكن مع شبكة bento للأعمال — طابع مجلة معمارية.",
    personality: "bold-editorial",
    baseColor: "#121212",
    palette: ["#F5F2EC", "#121212", "#C2410C", "#8A8578"],
    headingFont: "Amiri",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "شريط إحصاءات عائم يتداخل مع الهيرو بهامش سالب.",
    avoid: ["ظلال ملوّنة", "تدرّجات", "زوايا شديدة الاستدارة"],
  },
  clean_market: {
    id: "clean_market",
    art: "E",
    name: "متجر نظيف",
    pitch: "خلفية فاتحة، بطاقات بيضاء، كثافة عالية وشارات خصم — مصمّم للبيع.",
    personality: "clean-commerce",
    baseColor: "#5B2BE0",
    palette: ["#FAFAFB", "#FFFFFF", "#5B2BE0", "#DC2626"],
    headingFont: "IBM Plex Sans Arabic",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "شريط تصنيفات بأيقونات + سعر مشطوب بجانب السعر الحالي.",
    avoid: ["خلفيات داكنة", "خطوط serif", "مساحات فارغة مبالغ بها"],
  },
  fresh_service: {
    id: "fresh_service",
    art: "F",
    name: "خدمة منعشة",
    pitch: "داكن مع teal، هيرو بصورة عريضة وبطاقة بحث عائمة هي بطل الصفحة.",
    personality: "fresh-service",
    baseColor: "#2ED3B7",
    palette: ["#0B1418", "#12212A", "#2ED3B7", "#F4F7F7"],
    headingFont: "IBM Plex Sans Arabic",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "بطاقة بحث/حجز عائمة فوق صورة الهيرو بظل عميق.",
    avoid: ["ذهبي", "أكثر من لون تمييز", "بطاقات بيضاء بحتة"],
  },
  soft_saas: {
    id: "soft_saas",
    art: "H",
    name: "SaaS ناعم",
    pitch: "أبيض مائل للأزرق، حدود رفيعة، لقطة واجهة داخل إطار متصفح مائل.",
    personality: "modern-tech",
    baseColor: "#2563EB",
    palette: ["#F7F9FC", "#FFFFFF", "#2563EB", "#0F172A"],
    headingFont: "IBM Plex Sans Arabic",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "لقطة المنتج داخل إطار متصفح مائل مع انعكاس أسفلها.",
    avoid: ["ألوان صارخة", "ظلال ثقيلة", "خلفيات داكنة"],
  },
  minimal_mono: {
    id: "minimal_mono",
    art: "G",
    name: "أحادي مينيمال",
    pitch: "أسود شبه كامل مع لون تمييز واحد وطباعة ضخمة — طابع شخصي حادّ.",
    personality: "minimal-mono",
    baseColor: "#FF5B1A",
    palette: ["#0A0A0A", "#161616", "#FF5B1A", "#FAFAFA"],
    headingFont: "IBM Plex Sans Arabic",
    bodyFont: "JetBrains Mono",
    signature: "عنوان بسطرين: اسم أبيض + لقب ملوّن، ونقاط تنقّل رأسية.",
    avoid: ["أكثر من لون تمييز", "صور مخزون", "بطاقات ملوّنة"],
  },
  warm_appetite: {
    id: "warm_appetite",
    art: "D",
    name: "دافئ شهيّ",
    pitch: "ألوان دافئة ونسيج خفيف مع صور طعام كبيرة — للمطاعم والمقاهي.",
    personality: "warm-appetite",
    baseColor: "#B45309",
    palette: ["#1A1310", "#2A1F19", "#B45309", "#F5E9D7"],
    headingFont: "Amiri",
    bodyFont: "IBM Plex Sans Arabic",
    signature: "صور أطباق ملء العرض مع vignette ونصوص فوقها.",
    avoid: ["ألوان باردة", "طابع تقني", "خلفيات بيضاء بحتة"],
  },
};

/** ثلاثة اتجاهات مرشّحة لكل نوع منتج — مختلفة فعلاً لا متغيّرات لون. */
const BY_KIT: Record<string, string[]> = {
  saas: ["soft_saas", "dark_neon", "editorial"],
  store: ["clean_market", "dark_neon", "warm_appetite"],
  agency: ["editorial", "minimal_mono", "soft_saas"],
  luxury: ["luxury_gold", "editorial", "minimal_mono"],
  portfolio: ["minimal_mono", "editorial", "dark_neon"],
  restaurant: ["warm_appetite", "luxury_gold", "editorial"],
  landing: ["soft_saas", "dark_neon", "clean_market"],
  blog: ["editorial", "soft_saas", "minimal_mono"],
};

export function directionsForKit(kitId: string): DesignDirection[] {
  const ids = BY_KIT[kitId] ?? ["soft_saas", "editorial", "dark_neon"];
  return ids.map((id) => D[id]).filter((d): d is DesignDirection => Boolean(d));
}

export function getDirection(id: string): DesignDirection | null {
  return D[id] ?? null;
}

export function listDirections(): DesignDirection[] {
  return Object.values(D);
}

/** يبني نصّ السؤال المعروض للمستخدم لاختيار اتجاه واحد. */
export function directionsQuestion(kitId: string): {
  question: string;
  options: { id: string; label: string; description: string }[];
  directions: DesignDirection[];
} {
  const kit = getStarterKit(kitId);
  const directions = directionsForKit(kitId);
  return {
    question: kit
      ? `اخترت طقم «${kit.name}». أي اتجاه بصري تريده؟ سألتزم به حرفياً في كل الصفحات.`
      : "أي اتجاه بصري تريده للموقع؟",
    options: directions.map((d) => ({
      id: d.id,
      label: d.name,
      description: `${d.pitch} — ألوان: ${d.palette.join("، ")} · التوقيع: ${d.signature}`,
    })),
    directions,
  };
}
