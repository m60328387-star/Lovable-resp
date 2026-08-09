#!/usr/bin/env node
/**
 * Weaver Visual Auditor
 * مدقّق بصري حقيقي — يعمل على منفّذ Weaver (Contabo/VPS) ويشغّل متصفحاً فعلياً.
 *
 * الاستخدام:
 *   node weaver-audit.mjs                  # يدقّق مجلد المشروع الحالي
 *   node weaver-audit.mjs --page about.html
 *   node weaver-audit.mjs --url https://example.com   # لقطة مرجعية من موقع خارجي
 *
 * المخرجات (تُكتب داخل مجلد المشروع فيلتقطها Weaver تلقائياً):
 *   .weaver/audit.json          تقرير كامل (وصولية + أخطاء + روابط مكسورة + أداء)
 *   .weaver/shot-desktop.txt    لقطة PNG بصيغة base64 (1280)
 *   .weaver/shot-tablet.txt     (820)
 *   .weaver/shot-mobile.txt     (390)
 *   .weaver/reference.txt       لقطة الموقع المرجعي عند استخدام --url
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const argOf = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};

const ROOT = resolve(argOf("root", process.cwd()));
const PAGE = argOf("page", "index.html");
const EXTERNAL = argOf("url", "");
const MAX_SHOT = 380_000; // حد حجم base64 لكل لقطة

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

function log(...a) {
  console.log("[audit]", ...a);
}

async function ensurePlaywright() {
  try {
    return await import("playwright");
  } catch {
    log("تثبيت playwright لأول مرة…");
    execSync("npm i --no-save playwright@1.49.1", { stdio: "inherit", cwd: ROOT });
    try {
      execSync("npx --yes playwright@1.49.1 install --with-deps chromium", { stdio: "inherit" });
    } catch {
      execSync("npx --yes playwright@1.49.1 install chromium", { stdio: "inherit" });
    }
    return await import(join(ROOT, "node_modules", "playwright", "index.js"));
  }
}

function startServer(root) {
  return new Promise((done) => {
    const server = createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
      let file = join(root, rel);
      try {
        const info = await stat(file);
        if (info.isDirectory()) file = join(file, "index.html");
      } catch {
        res.writeHead(404).end("not found");
        return;
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => done({ server, port: server.address().port }));
  });
}

const AXE_CDN = "https://unpkg.com/axe-core@4.10.2/axe.min.js";

async function main() {
  const outDir = join(ROOT, ".weaver");
  await mkdir(outDir, { recursive: true });

  const { chromium } = await ensurePlaywright();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  const report = {
    generatedAt: new Date().toISOString(),
    page: EXTERNAL || PAGE,
    viewports: [],
    consoleErrors: [],
    failedRequests: [],
    accessibility: { violations: [], total: 0, serious: 0 },
    performance: {},
    score: 0,
    ok: false,
  };

  let target = EXTERNAL;
  let server = null;
  if (!EXTERNAL) {
    const started = await startServer(ROOT);
    server = started.server;
    target = `http://127.0.0.1:${started.port}/${PAGE.replace(/^\/+/, "")}`;
  }

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      page.on("console", (msg) => {
        if (msg.type() === "error" && report.consoleErrors.length < 25) {
          report.consoleErrors.push(`${vp.name}: ${msg.text().slice(0, 300)}`);
        }
      });
      page.on("response", (res) => {
        if (res.status() >= 400 && report.failedRequests.length < 25) {
          report.failedRequests.push(`${res.status()} ${res.url().slice(0, 200)}`);
        }
      });

      await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(700);

      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const paint = performance.getEntriesByType("paint");
        const bytes = performance
          .getEntriesByType("resource")
          .reduce((sum, r) => sum + (r.transferSize || 0), 0);
        const docWidth = document.documentElement.scrollWidth;
        return {
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          firstPaint: paint.length ? Math.round(paint[0].startTime) : null,
          transferKb: Math.round(bytes / 1024),
          scrollWidth: docWidth,
          innerWidth: window.innerWidth,
          dir: document.documentElement.getAttribute("dir"),
          lang: document.documentElement.getAttribute("lang"),
          images: document.images.length,
          fonts: [...document.fonts].length,
        };
      });

      const overflow = metrics.scrollWidth > metrics.innerWidth + 2;
      report.viewports.push({ ...vp, ...metrics, horizontalOverflow: overflow });
      if (vp.name === "desktop") report.performance = metrics;

      const shot = await page.screenshot({ fullPage: vp.name === "desktop", type: "jpeg", quality: 62 });
      const b64 = shot.toString("base64");
      const name = EXTERNAL ? "reference" : `shot-${vp.name}`;
      await writeFile(join(outDir, `${name}.txt`), b64.slice(0, MAX_SHOT), "utf8");

      if (vp.name === "desktop") {
        try {
          await page.addScriptTag({ url: AXE_CDN });
          const axe = await page.evaluate(async () => {
            const result = await window.axe.run(document, {
              resultTypes: ["violations"],
              runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
            });
            return result.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.length,
              sample: (v.nodes[0]?.html || "").slice(0, 160),
            }));
          });
          report.accessibility.violations = axe.slice(0, 25);
          report.accessibility.total = axe.length;
          report.accessibility.serious = axe.filter(
            (v) => v.impact === "serious" || v.impact === "critical",
          ).length;
        } catch (error) {
          report.accessibility.error = String(error).slice(0, 200);
        }
      }

      await context.close();
    }

    let score = 100;
    score -= report.accessibility.serious * 8;
    score -= Math.max(0, report.accessibility.total - report.accessibility.serious) * 3;
    score -= report.consoleErrors.length * 5;
    score -= report.failedRequests.length * 4;
    score -= report.viewports.filter((v) => v.horizontalOverflow).length * 10;
    if ((report.performance.transferKb ?? 0) > 2500) score -= 10;
    report.score = Math.max(0, Math.min(100, score));
    report.ok =
      report.score >= 80 &&
      report.accessibility.serious === 0 &&
      report.consoleErrors.length === 0 &&
      !report.viewports.some((v) => v.horizontalOverflow);
  } finally {
    await browser.close().catch(() => {});
    server?.close();
  }

  await writeFile(join(outDir, "audit.json"), JSON.stringify(report, null, 2), "utf8");
  log(`score=${report.score} a11y=${report.accessibility.total} errors=${report.consoleErrors.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[audit] فشل التدقيق:", error);
  process.exit(1);
});
