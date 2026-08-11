// فحص المتصفح الحقيقي داخل حاوية بيئة التنفيذ (Playwright + Chromium).
// يفتح المعاينة على أحجام شاشة متعددة، يلتقط لقطات، ويجمع أخطاء الكونسول
// والشبكة وملاحظات وصولية أساسية — ليغذّي حلقة الإصلاح الذاتي.

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

let chromiumPromise = null;

async function getChromium() {
  if (!chromiumPromise) {
    chromiumPromise = import("playwright").then((m) => m.chromium);
  }
  return chromiumPromise;
}

const AUDIT_SCRIPT = `(() => {
  const out = { issues: [], title: document.title || "", lang: document.documentElement.lang || "" };
  const push = (level, message) => out.issues.push({ level, message });
  if (!out.title) push("error", "الصفحة بلا <title>.");
  if (!document.querySelector('meta[name="description"]')) push("warn", "لا يوجد meta description.");
  if (!out.lang) push("warn", "لا توجد سمة lang على <html>.");
  const h1 = document.querySelectorAll("h1");
  if (h1.length === 0) push("error", "لا يوجد عنوان h1.");
  if (h1.length > 1) push("warn", "يوجد أكثر من h1 (" + h1.length + ").");
  const imgs = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt"));
  if (imgs.length) push("error", imgs.length + " صورة بلا alt.");
  const links = [...document.querySelectorAll("a")].filter((a) => !a.textContent.trim() && !a.getAttribute("aria-label"));
  if (links.length) push("warn", links.length + " رابط بلا نص أو aria-label.");
  const btns = [...document.querySelectorAll("button")].filter((b) => !b.textContent.trim() && !b.getAttribute("aria-label"));
  if (btns.length) push("warn", btns.length + " زر بلا تسمية.");
  if (document.documentElement.scrollWidth > window.innerWidth + 2) {
    push("error", "تمرير أفقي: عرض المحتوى " + document.documentElement.scrollWidth + "px مقابل شاشة " + window.innerWidth + "px.");
  }
  const cjk = /[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff]/;
  if (cjk.test(document.body.innerText || "")) push("error", "توجد أحرف صينية/يابانية في محتوى الصفحة.");
  if ((document.body.innerText || "").trim().length < 80) push("error", "الصفحة شبه فارغة من المحتوى.");
  const broken = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0);
  if (broken.length) push("error", broken.length + " صورة لم تُحمَّل.");
  return out;
})()`;

// قياس حتمي لجودة التصميم من DOM الحقيقي — أرقام لا أحكام لغوية.
const METRICS_SCRIPT = `(() => {
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const toRgb = (c) => {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length > 3 && p[3] === 0) return null;
    return [p[0], p[1], p[2]];
  };
  const lum = (rgb) => {
    const a = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = toRgb(getComputedStyle(node).backgroundColor);
      if (c) return c;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  const all = [...document.querySelectorAll("body *")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const fontSizes = new Set();
  const colors = new Set();
  const radii = new Set();
  const spacingValues = [];
  let offScale = 0;
  let lowContrast = 0;
  let contrastChecked = 0;
  const contrastSamples = [];

  for (const el of all) {
    const cs = getComputedStyle(el);
    fontSizes.add(Math.round(px(cs.fontSize)));
    const col = toRgb(cs.color);
    if (col) colors.add(col.join(","));
    if (px(cs.borderTopLeftRadius) > 0) radii.add(Math.round(px(cs.borderTopLeftRadius)));

    for (const prop of ["marginTop","marginBottom","paddingTop","paddingBottom","paddingLeft","paddingRight","gap","rowGap","columnGap"]) {
      const v = px(cs[prop]);
      if (v > 0 && v < 200) {
        spacingValues.push(v);
        if (Math.abs(v % 4) > 0.6 && Math.abs((v % 4) - 4) > 0.6) offScale++;
      }
    }

    const text = (el.textContent || "").trim();
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (ownText && text.length > 1 && col) {
      contrastChecked++;
      const r = ratio(col, bgOf(el));
      const size = px(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (r < need) {
        lowContrast++;
        if (contrastSamples.length < 6) {
          contrastSamples.push({ tag: el.tagName.toLowerCase(), text: text.slice(0, 40), ratio: Math.round(r * 100) / 100, need });
        }
      }
    }
  }

  // الإيقاع الرأسي بين الأقسام الرئيسية
  const sections = [...document.querySelectorAll("main > section, body > section, main > div > section")];
  const sectionPads = sections.map((s) => Math.round(px(getComputedStyle(s).paddingTop)));
  const uniqueSectionPads = new Set(sectionPads.filter((v) => v > 0)).size;

  // عرض المحتوى الأقصى
  const containers = [...document.querySelectorAll(".container, main > *")].map((el) => el.getBoundingClientRect().width);
  const maxContent = containers.length ? Math.round(Math.max(...containers)) : 0;

  // العناصر التفاعلية بلا focus-visible مرئي يُقاس بوجود قاعدة outline/box-shadow
  const interactive = [...document.querySelectorAll("a[href], button, input, select, textarea")];

  // كثافة النص مقابل الفراغ في أول شاشة
  const vh = window.innerHeight;
  const aboveFold = all.filter((el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0; });

  const styleTagCount = document.querySelectorAll("style").length;
  const inlineStyled = all.filter((el) => el.getAttribute("style") && /color|background|font-size|padding|margin/.test(el.getAttribute("style"))).length;

  return {
    fontSizeCount: fontSizes.size,
    fontSizes: [...fontSizes].sort((a, b) => a - b),
    colorCount: colors.size,
    radiusCount: radii.size,
    spacingSamples: spacingValues.length,
    spacingOffScale: offScale,
    spacingOffScaleRatio: spacingValues.length ? Math.round((offScale / spacingValues.length) * 1000) / 1000 : 0,
    contrastChecked: contrastChecked,
    lowContrast: lowContrast,
    contrastSamples: contrastSamples,
    sectionCount: sections.length,
    sectionPadVariants: uniqueSectionPads,
    maxContentWidth: maxContent,
    viewportWidth: window.innerWidth,
    interactiveCount: interactive.length,
    aboveFoldElements: aboveFold.length,
    styleTagCount: styleTagCount,
    inlineStyledElements: inlineStyled,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    usesUiLibrary: document.querySelectorAll('[class*="u-"]').length > 4,
    externalScripts: [...document.querySelectorAll("script[src]")].filter((s) => /^https?:/.test(s.getAttribute("src") || "")).length,
    imagesWithoutDimensions: [...document.querySelectorAll("img")].filter((i) => !i.getAttribute("width") || !i.getAttribute("height")).length,
  };
})()`;

/**
 * يفحص صفحة داخل المعاينة المحلية للمشروع.
 * @param {string} baseUrl عنوان المعاينة داخل الحاوية
 * @param {{ path?: string, devices?: string[], screenshots?: boolean, waitMs?: number }} options
 */
export async function browserCheck(baseUrl, options = {}) {
  const chromium = await getChromium();
  const devices = (options.devices?.length ? options.devices : ["desktop", "mobile"]).filter(
    (d) => VIEWPORTS[d],
  );
  const target = new URL(
    options.path?.replace(/^\//, "") || "",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env["CHROMIUM_PATH"] ? { executablePath: process.env["CHROMIUM_PATH"] } : {}),
  });
  const results = [];
  try {
    for (const device of devices) {
      const context = await browser.newContext({
        viewport: VIEWPORTS[device],
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const networkErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
      });
      page.on("pageerror", (err) =>
        consoleErrors.push(`pageerror: ${String(err?.message ?? err).slice(0, 500)}`),
      );
      page.on("requestfailed", (req) =>
        networkErrors.push(
          `${req.method()} ${req.url().slice(0, 300)} — ${req.failure()?.errorText ?? "failed"}`,
        ),
      );
      page.on("response", (res) => {
        if (res.status() >= 400) networkErrors.push(`${res.status()} ${res.url().slice(0, 300)}`);
      });

      let status = 0;
      let navError = null;
      try {
        const response = await page.goto(target, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
        status = response?.status() ?? 0;
        await page.waitForTimeout(Math.min(Math.max(options.waitMs ?? 1500, 300), 8000));
      } catch (err) {
        navError = String(err?.message ?? err).slice(0, 500);
      }

      let audit = { issues: [], title: "", lang: "" };
      if (!navError) {
        try {
          audit = await page.evaluate(AUDIT_SCRIPT);
        } catch (err) {
          audit.issues.push({
            level: "warn",
            message: `تعذّر تشغيل فحص DOM: ${String(err?.message ?? err)}`,
          });
        }
      }

      let metrics = null;
      if (!navError) {
        try {
          metrics = await page.evaluate(METRICS_SCRIPT);
        } catch {
          metrics = null;
        }
      }

      let screenshot = null;
      if (options.screenshots !== false && !navError) {
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 62, fullPage: false });
          screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;
        } catch {
          screenshot = null;
        }
      }

      results.push({
        device,
        url: target,
        status,
        navError,
        title: audit.title,
        lang: audit.lang,
        issues: audit.issues,
        metrics,
        consoleErrors: consoleErrors.slice(0, 25),
        networkErrors: [...new Set(networkErrors)].slice(0, 25),
        screenshot,
      });

      await context.close();
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const errors = results.flatMap((r) => [
    ...(r.navError ? [`[${r.device}] فشل الفتح: ${r.navError}`] : []),
    ...(r.status >= 400 ? [`[${r.device}] استجابة HTTP ${r.status}`] : []),
    ...r.issues.filter((i) => i.level === "error").map((i) => `[${r.device}] ${i.message}`),
    ...r.consoleErrors.map((e) => `[${r.device}] console: ${e}`),
    ...r.networkErrors.map((e) => `[${r.device}] network: ${e}`),
  ]);
  const warnings = results.flatMap((r) =>
    r.issues.filter((i) => i.level === "warn").map((i) => `[${r.device}] ${i.message}`),
  );

  return { ok: errors.length === 0, errors, warnings, results };
}
