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
