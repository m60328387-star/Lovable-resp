/**
 * مولّد الهوية البصرية (Brand Kit) — يبني لوحة ألوان متماسكة رياضياً، وزوج خطوط،
 * ورموز SVG، وملف tokens.css، ودليل هوية — بلا أي اعتماديات خارجية.
 */

import { uiLibraryFiles } from "@/lib/design/ui-library";

export interface BrandKitInput {
  brandName: string;
  /** كلمة/كلمتان تصفان طابع العلامة: technical, warm, luxury, playful, natural, medical, editorial */
  personality?: string;
  /** لون أساسي بصيغة hex؛ إن لم يُعطَ يُشتق من اسم العلامة والطابع */
  baseColor?: string;
  /** لغة المحتوى الأساسية */
  locale?: "ar" | "en";
  /** نمط الشعار */
  logoStyle?: "monogram" | "geometric" | "wordmark";
  /** الوضع الافتراضي للواجهة */
  scheme?: "light" | "dark";
}

export interface BrandFile {
  path: string;
  content: string;
}

export interface BrandKitResult {
  files: BrandFile[];
  palette: Record<string, string>;
  fonts: { head: string; body: string; mono: string; linkSnippet: string };
  summary: string;
}

/* ------------------------------ أدوات اللون ------------------------------ */

function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s);
  const lig = clamp(l);
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg]!;
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r0) h = 60 * (((g0 - b0) / d) % 6);
  else if (max === g0) h = 60 * ((b0 - r0) / d + 2);
  else h = 60 * ((r0 - g0) / d + 4);
  return [((h % 360) + 360) % 360, s, l];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** يعيد أبيض أو أسود بحسب أفضل تباين فوق اللون المعطى. */
function readableOn(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#0b0f14") ? "#ffffff" : "#0b0f14";
}

/** يجعل اللون يحقق تبايناً لا يقل عن النسبة المطلوبة أمام الخلفية بتعديل الإضاءة. */
function ensureContrast(color: string, bg: string, min: number): string {
  const [h, s] = rgbToHsl(color);
  let [, , l] = rgbToHsl(color);
  const darkenTarget = luminance(bg) > 0.4;
  for (let i = 0; i < 60; i++) {
    const candidate = hslToHex(h, s, l);
    if (contrastRatio(candidate, bg) >= min) return candidate;
    l = clamp(darkenTarget ? l - 0.015 : l + 0.015);
  }
  return hslToHex(h, s, darkenTarget ? 0.12 : 0.95);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/* --------------------------- الطابع والخطوط --------------------------- */

type Personality =
  "technical" | "warm" | "luxury" | "playful" | "natural" | "medical" | "editorial";

const PERSONALITY_HUES: Record<Personality, [number, number]> = {
  technical: [195, 230],
  warm: [15, 40],
  luxury: [275, 320],
  playful: [330, 20],
  natural: [95, 160],
  medical: [175, 205],
  editorial: [205, 245],
};

const PERSONALITY_SAT: Record<Personality, number> = {
  technical: 0.62,
  warm: 0.68,
  luxury: 0.42,
  playful: 0.78,
  natural: 0.5,
  medical: 0.55,
  editorial: 0.38,
};

const FONT_PAIRS: Record<Personality, { ar: string; en: string }> = {
  technical: { ar: "IBM Plex Sans Arabic", en: "Space Grotesk" },
  warm: { ar: "Tajawal", en: "Sora" },
  luxury: { ar: "Almarai", en: "Cormorant Garamond" },
  playful: { ar: "Cairo", en: "Outfit" },
  natural: { ar: "Rubik", en: "Manrope" },
  medical: { ar: "IBM Plex Sans Arabic", en: "Inter" },
  editorial: { ar: "Readex Pro", en: "Fraunces" },
};

function resolvePersonality(raw?: string): Personality {
  const value = (raw ?? "").toLowerCase();
  const map: [string[], Personality][] = [
    [["tech", "تقني", "برمج", "saas", "ai", "ذكاء"], "technical"],
    [["warm", "دافئ", "مطعم", "قهوة", "food", "cafe"], "warm"],
    [["lux", "فاخر", "فخم", "premium", "مجوهرات", "عقار"], "luxury"],
    [["play", "مرح", "أطفال", "kids", "game", "لعب"], "playful"],
    [["nature", "طبيعي", "بيئ", "زراع", "eco", "صحي"], "natural"],
    [["med", "طب", "عياد", "clinic", "health", "صيدل"], "medical"],
    [["edit", "مجلة", "أخبار", "news", "مدونة", "blog"], "editorial"],
  ];
  for (const [keys, personality] of map) {
    if (keys.some((k) => value.includes(k))) return personality;
  }
  return "technical";
}

/* ------------------------------ اللوحة ------------------------------ */

function buildPalette(input: BrandKitInput, personality: Personality) {
  const dark = input.scheme === "dark";
  let primary: string;
  if (input.baseColor && /^#?[0-9a-fA-F]{3,6}$/.test(input.baseColor.trim())) {
    const hex = input.baseColor.trim();
    primary = hex.startsWith("#") ? hex : `#${hex}`;
  } else {
    const [lo, hi] = PERSONALITY_HUES[personality];
    const span = hi >= lo ? hi - lo : 360 - lo + hi;
    const hue = (lo + (hashString(input.brandName) % Math.max(span, 1))) % 360;
    primary = hslToHex(hue, PERSONALITY_SAT[personality], dark ? 0.56 : 0.42);
  }

  const [h, s] = rgbToHsl(primary);
  const [, , pl] = rgbToHsl(primary);
  // لون تمييز واحد فقط، بزاوية 150° لتجنّب التصادم
  const accent = hslToHex(h + 152, clamp(s * 0.92, 0.35, 0.85), dark ? 0.62 : 0.5);
  // محايدات مشبعة قليلاً بلون العلامة حتى لا تبدو رمادية ميتة
  const neutralSat = 0.08;

  const bg = dark ? hslToHex(h, neutralSat + 0.04, 0.07) : hslToHex(h, neutralSat * 0.6, 0.985);
  const surface = dark ? hslToHex(h, neutralSat + 0.03, 0.11) : "#ffffff";
  const surface2 = dark ? hslToHex(h, neutralSat + 0.03, 0.15) : hslToHex(h, neutralSat, 0.965);
  const border = dark ? hslToHex(h, neutralSat, 0.22) : hslToHex(h, neutralSat, 0.9);
  const text = dark ? hslToHex(h, 0.05, 0.96) : hslToHex(h, 0.22, 0.11);
  const muted = ensureContrast(hslToHex(h, 0.12, dark ? 0.68 : 0.42), bg, 4.5);

  const primaryOn = readableOn(primary);
  const primaryText = ensureContrast(primary, bg, 4.5);

  return {
    primary,
    "primary-600": hslToHex(h, s, clamp(pl - 0.08)),
    "primary-700": hslToHex(h, s, clamp(pl - 0.16)),
    "primary-100": hslToHex(h, clamp(s * 0.5), dark ? 0.22 : 0.94),
    "primary-on": primaryOn,
    "primary-text": primaryText,
    accent,
    "accent-on": readableOn(accent),
    bg,
    surface,
    "surface-2": surface2,
    border,
    text,
    muted,
    success: ensureContrast(hslToHex(152, 0.55, dark ? 0.5 : 0.34), bg, 4.5),
    warning: ensureContrast(hslToHex(38, 0.85, dark ? 0.55 : 0.42), bg, 4.5),
    danger: ensureContrast(hslToHex(2, 0.7, dark ? 0.58 : 0.45), bg, 4.5),
    info: ensureContrast(hslToHex(212, 0.6, dark ? 0.6 : 0.44), bg, 4.5),
  } satisfies Record<string, string>;
}

/* ------------------------------ الشعارات ------------------------------ */

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "W";
  if (words.length === 1) return words[0]!.slice(0, 2);
  return `${words[0]![0]}${words[1]![0]}`;
}

function markSvg(input: BrandKitInput, palette: Record<string, string>, size = 64): string {
  const style = input.logoStyle ?? "monogram";
  const p = palette["primary"]!;
  const a = palette["accent"]!;
  const on = palette["primary-on"]!;
  const grad = `<defs><linearGradient id="bkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>`;

  if (style === "geometric") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${input.brandName}">${grad}<rect width="64" height="64" rx="16" fill="url(#bkg)"/><path d="M18 42 L32 18 L46 42" fill="none" stroke="${on}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="46" r="3.5" fill="${on}"/></svg>`;
  }
  if (style === "wordmark") {
    const label = input.brandName.slice(0, 18);
    const width = Math.max(120, label.length * 15);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 48" width="${width}" height="48" role="img" aria-label="${label}">${grad}<rect x="0" y="10" width="6" height="28" rx="3" fill="url(#bkg)"/><text x="16" y="34" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="${palette["text"]}">${label}</text></svg>`;
  }
  const mono = initials(input.brandName).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${input.brandName}">${grad}<rect width="64" height="64" rx="16" fill="url(#bkg)"/><text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="${on}">${mono}</text></svg>`;
}

/* ------------------------------ البناء ------------------------------ */

export function buildBrandKit(input: BrandKitInput): BrandKitResult {
  const personality = resolvePersonality(input.personality);
  const palette = buildPalette(input, personality);
  const locale = input.locale ?? "ar";
  const pair = FONT_PAIRS[personality];
  const head = locale === "ar" ? pair.ar : pair.en;
  const body = locale === "ar" ? pair.ar : pair.en;
  const secondary = locale === "ar" ? pair.en : pair.ar;
  const mono = "JetBrains Mono";

  const families = Array.from(new Set([head, secondary, mono]))
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;700`)
    .join("&");
  const linkSnippet = [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`,
  ].join("\n");

  const tokens = `/* ${input.brandName} — Brand Tokens (مولّدة آلياً، لا تكتب ألواناً مباشرة خارج هذا الملف) */
:root {
  /* الألوان */
${Object.entries(palette)
  .map(([k, v]) => `  --color-${k}: ${v};`)
  .join("\n")}

  /* الخطوط */
  --font-head: "${head}", "${secondary}", system-ui, sans-serif;
  --font-body: "${body}", system-ui, sans-serif;
  --font-mono: "${mono}", ui-monospace, monospace;

  /* المقياس الطباعي */
  --text-xs: 0.8125rem;
  --text-sm: 0.9375rem;
  --text-base: 1.0625rem;
  --text-lg: 1.1875rem;
  --text-xl: clamp(1.25rem, 1.6vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 2.5vw, 2.25rem);
  --text-3xl: clamp(2rem, 4vw, 3.25rem);
  --leading-body: 1.75;
  --leading-head: 1.2;

  /* المسافات (مقياس 4px) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px; --space-20: 80px; --space-24: 96px;

  /* الأشكال والظلال */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px; --radius-xl: 28px; --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04);
  --shadow-lg: 0 18px 40px rgba(0,0,0,.12), 0 6px 12px rgba(0,0,0,.06);
  --ring: 0 0 0 3px color-mix(in srgb, var(--color-primary) 35%, transparent);

  --container: 1200px;
  --transition: 200ms cubic-bezier(.2,.7,.3,1);
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-body);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4 { font-family: var(--font-head); line-height: var(--leading-head); margin: 0 0 var(--space-4); }
h1 { font-size: var(--text-3xl); } h2 { font-size: var(--text-2xl); } h3 { font-size: var(--text-xl); }
a { color: var(--color-primary-text); text-underline-offset: 3px; }
:focus-visible { outline: none; box-shadow: var(--ring); border-radius: var(--radius-sm); }
.container { width: min(100% - var(--space-8), var(--container)); margin-inline: auto; }
.section { padding-block: clamp(48px, 8vw, 112px); }
.surface { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-6); border-radius: var(--radius-full);
  font-weight: 600; border: 1px solid transparent; cursor: pointer;
  transition: transform var(--transition), background var(--transition), box-shadow var(--transition);
}
.btn-primary { background: var(--color-primary); color: var(--color-primary-on); box-shadow: var(--shadow-sm); }
.btn-primary:hover { background: var(--color-primary-600); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-primary:active { background: var(--color-primary-700); transform: translateY(0); }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.btn-ghost { background: transparent; color: var(--color-primary-text); border-color: var(--color-border); }
.btn-ghost:hover { background: var(--color-surface-2); }
.muted { color: var(--color-muted); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;

  const logo = markSvg(input, palette, 64);
  const wordmark = markSvg({ ...input, logoStyle: "wordmark" }, palette);
  const favicon = markSvg(input, palette, 32);

  const contrastText = contrastRatio(palette["text"]!, palette["bg"]!);
  const contrastMuted = contrastRatio(palette["muted"]!, palette["bg"]!);
  const contrastBtn = contrastRatio(palette["primary-on"]!, palette["primary"]!);

  const guide = `# دليل الهوية البصرية — ${input.brandName}

الطابع: ${personality} · الوضع: ${input.scheme ?? "light"} · اللغة: ${locale}

## الألوان
| الرمز | القيمة | الاستخدام |
| --- | --- | --- |
${Object.entries(palette)
  .map(([k, v]) => `| \`--color-${k}\` | \`${v}\` | ${k} |`)
  .join("\n")}

تباين WCAG المحسوب: النص/الخلفية ${contrastText}:1 · النص الثانوي ${contrastMuted}:1 · نص الزر الأساسي ${contrastBtn}:1 (الحد الأدنى المقبول 4.5:1).

## الخطوط
- العناوين: ${head}
- المتن: ${body}
- الأحادي: ${mono}
- وزنان فقط لكل عائلة (400 و 700)، و display=swap.

## القواعد
1. ممنوع أي قيمة لون أو مسافة مباشرة خارج \`brand/tokens.css\`.
2. كل عنصر تفاعلي: default / hover / focus-visible / active / disabled.
3. كل قائمة بيانات: skeleton / فارغ / خطأ / محتوى.
4. RTL: استخدم margin-inline و padding-inline و inset-inline.
5. الشعار: هامش حماية لا يقل عن نصف ارتفاع الرمز، ولا تُشوَّه نسبه.
`;

  const usage = `<!-- ألصق هذا في <head> كل صفحة -->
${linkSnippet}
<link rel="stylesheet" href="brand/tokens.css">
<link rel="stylesheet" href="brand/ui.css">
<link rel="icon" href="brand/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="${palette["primary"]}">
<!-- وقبل </body>: -->
<!-- <script src="brand/ui.js" defer></script> -->
`;

  return {
    files: [
      { path: "brand/tokens.css", content: tokens },
      ...uiLibraryFiles(),
      { path: "brand/logo.svg", content: logo },
      { path: "brand/wordmark.svg", content: wordmark },
      { path: "brand/favicon.svg", content: favicon },
      { path: "brand/BRAND.md", content: guide },
      { path: "brand/head.html", content: usage },
    ],

    palette,
    fonts: { head, body, mono, linkSnippet },
    summary: `هوية «${input.brandName}» بطابع ${personality}: أساسي ${palette["primary"]} وتمييز ${palette["accent"]} وخط ${head}. تباين النص ${contrastText}:1.`,
  };
}
