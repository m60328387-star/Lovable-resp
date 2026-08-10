/**
 * بوابة الجودة الرقمية — تحويل قياسات DOM الحتمية إلى درجة تصميم قابلة للمنع.
 * لا آراء لغوية هنا: كل خصم ناتج عن رقم قِيس فعلياً داخل المتصفح.
 */

export interface RawDesignMetrics {
  fontSizeCount?: number;
  fontSizes?: number[];
  colorCount?: number;
  radiusCount?: number;
  spacingSamples?: number;
  spacingOffScale?: number;
  spacingOffScaleRatio?: number;
  contrastChecked?: number;
  lowContrast?: number;
  contrastSamples?: { tag: string; text: string; ratio: number; need: number }[];
  sectionCount?: number;
  sectionPadVariants?: number;
  maxContentWidth?: number;
  viewportWidth?: number;
  interactiveCount?: number;
  aboveFoldElements?: number;
  styleTagCount?: number;
  inlineStyledElements?: number;
  horizontalOverflow?: boolean;
  usesUiLibrary?: boolean;
  externalScripts?: number;
  imagesWithoutDimensions?: number;
}

export interface DesignPenalty {
  /** المحور المتأثّر */
  axis: "typography" | "color" | "spacing" | "layout" | "accessibility" | "hygiene";
  /** النقاط المخصومة */
  points: number;
  /** سبب الخصم بالأرقام */
  reason: string;
  /** الإجراء المطلوب من الوكيل */
  fix: string;
}

export interface DesignScore {
  score: number;
  pass: boolean;
  threshold: number;
  penalties: DesignPenalty[];
  axes: Record<DesignPenalty["axis"], number>;
  summary: string;
}

export const DESIGN_SCORE_THRESHOLD = 85;

const AXES: DesignPenalty["axis"][] = [
  "typography",
  "color",
  "spacing",
  "layout",
  "accessibility",
  "hygiene",
];

/** يحسب درجة تصميم من 100 لصفحة واحدة على جهاز واحد. */
export function scoreDesignMetrics(
  raw: RawDesignMetrics | null | undefined,
  opts: { device?: string; threshold?: number } = {},
): DesignScore {
  const threshold = opts.threshold ?? DESIGN_SCORE_THRESHOLD;
  const device = opts.device ?? "desktop";
  const penalties: DesignPenalty[] = [];

  if (!raw) {
    return {
      score: 0,
      pass: false,
      threshold,
      penalties: [
        {
          axis: "hygiene",
          points: 100,
          reason: "لم تُجمع أي قياسات من الصفحة.",
          fix: "تأكد أن الصفحة تُفتح فعلياً ثم أعد browser_check.",
        },
      ],
      axes: { typography: 0, color: 0, spacing: 0, layout: 0, accessibility: 0, hygiene: 0 },
      summary: "لا توجد قياسات — الصفحة لم تُحمَّل.",
    };
  }

  const add = (p: DesignPenalty) => penalties.push(p);

  // ---------- الطباعة: سلّم محدود ومتناسق
  const fontCount = raw.fontSizeCount ?? 0;
  if (fontCount > 9) {
    add({
      axis: "typography",
      points: Math.min(14, (fontCount - 9) * 2),
      reason: `${fontCount} حجم خط مختلف على الصفحة (المسموح ≤ 9).`,
      fix: "وحّد الأحجام على سلّم tokens: --step--1..--step-5 واحذف الأحجام العشوائية.",
    });
  }
  const sizes = raw.fontSizes ?? [];
  if (sizes.length) {
    const smallest = Math.min(...sizes.filter((s) => s > 0));
    if (smallest > 0 && smallest < 13) {
      add({
        axis: "typography",
        points: 6,
        reason: `أصغر حجم نص ${smallest}px (الحد الأدنى المقبول 13px).`,
        fix: "ارفع النصوص الصغيرة إلى 14px على الأقل.",
      });
    }
    const largest = Math.max(...sizes);
    if (device !== "mobile" && largest < 32) {
      add({
        axis: "typography",
        points: 8,
        reason: `أكبر عنوان ${largest}px فقط — لا يوجد تباين هرمي بصري.`,
        fix: "اجعل عنوان الهيرو clamp(2.4rem, 5vw, 4rem) على الأقل.",
      });
    }
  }

  // ---------- اللون: لوحة محدودة
  const colors = raw.colorCount ?? 0;
  if (colors > 12) {
    add({
      axis: "color",
      points: Math.min(12, (colors - 12) * 1.5),
      reason: `${colors} لون نص مختلف (المسموح ≤ 12).`,
      fix: "استخدم متغيّرات brand/tokens.css فقط: --fg و--muted و--primary.",
    });
  }
  const radii = raw.radiusCount ?? 0;
  if (radii > 5) {
    add({
      axis: "color",
      points: Math.min(6, radii - 5),
      reason: `${radii} قيمة انحناء مختلفة (المسموح ≤ 5).`,
      fix: "التزم بـ --radius و--radius-lg و--radius-full.",
    });
  }

  // ---------- المسافات: شبكة 4px
  const offRatio = raw.spacingOffScaleRatio ?? 0;
  if ((raw.spacingSamples ?? 0) > 20 && offRatio > 0.12) {
    add({
      axis: "spacing",
      points: Math.min(16, Math.round((offRatio - 0.12) * 120)),
      reason: `${Math.round(offRatio * 100)}% من المسافات خارج شبكة 4px.`,
      fix: "استبدل القيم اليدوية بمتغيّرات --space-1..--space-12.",
    });
  }
  const padVariants = raw.sectionPadVariants ?? 0;
  if ((raw.sectionCount ?? 0) >= 3 && padVariants > 3) {
    add({
      axis: "spacing",
      points: Math.min(10, (padVariants - 3) * 3),
      reason: `${padVariants} قيمة padding مختلفة للأقسام — الإيقاع الرأسي مكسور.`,
      fix: "استخدم .u-section لكل الأقسام بدل paddings مخصّصة.",
    });
  }

  // ---------- التخطيط
  if (raw.horizontalOverflow) {
    add({
      axis: "layout",
      points: 20,
      reason: "تمرير أفقي موجود — التصميم يكسر الشاشة.",
      fix: "ابحث عن العنصر الأعرض من الشاشة وأصلح عرضه (max-width:100%، overflow-wrap).",
    });
  }
  const maxW = raw.maxContentWidth ?? 0;
  const vw = raw.viewportWidth ?? 0;
  if (device === "desktop" && vw > 1200 && maxW > 1400) {
    add({
      axis: "layout",
      points: 8,
      reason: `عرض المحتوى ${maxW}px بلا حاوية — النص يمتد بلا حدود.`,
      fix: "لفّ المحتوى بـ .u-container (max-width ≈ 1200px).",
    });
  }
  const sections = raw.sectionCount ?? 0;
  if (sections > 0 && sections < 4) {
    add({
      axis: "layout",
      points: (4 - sections) * 5,
      reason: `${sections} أقسام فقط — الصفحة سطحية.`,
      fix: "أضف أقساماً حقيقية: ميزات، كيف يعمل، شهادات، أسعار، أسئلة، CTA.",
    });
  }
  if ((raw.aboveFoldElements ?? 0) < 6) {
    add({
      axis: "layout",
      points: 6,
      reason: "أول شاشة شبه فارغة من العناصر.",
      fix: "اجعل الهيرو يحتوي عنواناً ووصفاً وزرَّي إجراء ودليل ثقة.",
    });
  }

  // ---------- الوصولية
  const low = raw.lowContrast ?? 0;
  if (low > 0) {
    add({
      axis: "accessibility",
      points: Math.min(25, low * 5),
      reason: `${low} عنصر نصّي تحت حدّ التباين WCAG AA.`,
      fix: "ارفع تباين النص/الخلفية إلى 4.5:1 (3:1 للعناوين الكبيرة).",
    });
  }
  if ((raw.imagesWithoutDimensions ?? 0) > 2) {
    add({
      axis: "accessibility",
      points: 4,
      reason: `${raw.imagesWithoutDimensions} صورة بلا width/height — قفزات تخطيط.`,
      fix: "أضف width وheight لكل <img>.",
    });
  }

  // ---------- النظافة الهندسية
  if ((raw.inlineStyledElements ?? 0) > 8) {
    add({
      axis: "hygiene",
      points: Math.min(10, Math.round((raw.inlineStyledElements ?? 0) / 4)),
      reason: `${raw.inlineStyledElements} عنصر يحمل style مضمّناً.`,
      fix: "انقل الأنماط إلى styles.css أو استخدم أصناف .u-*.",
    });
  }
  if (raw.usesUiLibrary === false) {
    add({
      axis: "hygiene",
      points: 8,
      reason: "الصفحة لا تستخدم مكوّنات Weaver UI (.u-*).",
      fix: "استدعِ ui_snippet واستعمل القصاصات الجاهزة بدل CSS يدوي.",
    });
  }
  if ((raw.styleTagCount ?? 0) > 1) {
    add({
      axis: "hygiene",
      points: 4,
      reason: `${raw.styleTagCount} وسم <style> داخل الصفحة.`,
      fix: "وحّد الأنماط في ملف CSS واحد.",
    });
  }

  const axes = Object.fromEntries(AXES.map((a) => [a, 0])) as Record<DesignPenalty["axis"], number>;
  for (const p of penalties) axes[p.axis] += p.points;

  const total = penalties.reduce((sum, p) => sum + p.points, 0);
  const score = Math.max(0, Math.round(100 - total));
  const pass = score >= threshold;

  const worst = [...penalties].sort((a, b) => b.points - a.points).slice(0, 3);
  const summary = pass
    ? `درجة التصميم ${score}/100 — اجتازت الحد ${threshold}.`
    : `درجة التصميم ${score}/100 (الحد ${threshold}). أهم الخصومات: ${
        worst.map((p) => `${p.reason} (-${p.points})`).join(" | ") || "لا شيء"
      }`;

  return { score, pass, threshold, penalties, axes, summary };
}

/** يدمج درجات عدة أجهزة/صفحات: النتيجة هي الأسوأ (البوابة لا تُجامل). */
export function aggregateDesignScores(
  entries: { label: string; score: DesignScore }[],
  threshold = DESIGN_SCORE_THRESHOLD,
): {
  score: number;
  pass: boolean;
  threshold: number;
  worstLabel: string;
  perTarget: { label: string; score: number; pass: boolean }[];
  topFixes: string[];
  summary: string;
} {
  if (!entries.length) {
    return {
      score: 0,
      pass: false,
      threshold,
      worstLabel: "—",
      perTarget: [],
      topFixes: ["شغّل browser_check أولاً للحصول على قياسات."],
      summary: "لا توجد قياسات تصميم.",
    };
  }
  const sorted = [...entries].sort((a, b) => a.score.score - b.score.score);
  const worst = sorted[0]!;
  const allPenalties = entries
    .flatMap((e) => e.score.penalties.map((p) => ({ ...p, label: e.label })))
    .sort((a, b) => b.points - a.points);

  const seen = new Set<string>();
  const topFixes: string[] = [];
  for (const p of allPenalties) {
    if (seen.has(p.fix)) continue;
    seen.add(p.fix);
    topFixes.push(`[${p.label}] ${p.reason} → ${p.fix}`);
    if (topFixes.length >= 6) break;
  }

  const pass = worst.score.score >= threshold;
  return {
    score: worst.score.score,
    pass,
    threshold,
    worstLabel: worst.label,
    perTarget: entries.map((e) => ({
      label: e.label,
      score: e.score.score,
      pass: e.score.pass,
    })),
    topFixes,
    summary: pass
      ? `بوابة الجودة: نجاح — أدنى درجة ${worst.score.score}/100 على ${worst.label}.`
      : `بوابة الجودة: رسوب — ${worst.label} حصل على ${worst.score.score}/100 والحد ${threshold}. أصلح الملاحظات ثم أعد الفحص.`,
  };
}
