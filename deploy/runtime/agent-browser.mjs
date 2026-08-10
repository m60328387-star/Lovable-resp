// جلسات متصفح دائمة لكل مشروع (Computer Use).
// كل مشروع يحصل على ملف تعريف Chromium مستقل على القرص، فتبقى الكوكيز
// وتسجيل الدخول محفوظة بين الجولات، ولا تختلط حسابات المشاريع/العملاء.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.env["RUNTIME_ROOT"] ?? "/workspaces";
const IDLE_MS = Number(process.env["BROWSER_IDLE_MS"] ?? 45 * 60 * 1000);
const VIEWPORT = { width: 1366, height: 820 };
const MAX_LOG = 300;

/** كلمات تدل على خطوة لا رجعة فيها — يمنعها الوكيل بلا موافقة صريحة. */
const RISKY =
  /(دفع|ادفع|اشتر|شراء|تأكيد الدفع|إطلاق|انشر|نشر الحملة|حذف|إلغاء الاشتراك|pay|purchase|checkout|subscribe|confirm and pay|place order|launch campaign|publish|delete|remove account)/i;

let chromiumPromise = null;
async function getChromium() {
  if (!chromiumPromise) chromiumPromise = import("playwright").then((m) => m.chromium);
  return chromiumPromise;
}

/** @type {Map<string, any>} */
const sessions = new Map();

const safeId = (v) =>
  String(v ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);

function pushLog(session, entry) {
  session.log.push({ at: Date.now(), ...entry });
  if (session.log.length > MAX_LOG) session.log.splice(0, session.log.length - MAX_LOG);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function allowed(session, url) {
  if (!session.allowlist?.length) return true;
  const host = hostOf(url);
  return session.allowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

// ---------------------------------------------------------------- lifecycle

export async function openSession(projectId, options = {}) {
  const id = safeId(projectId);
  let session = sessions.get(id);
  if (session && !session.context.pages().length) {
    await closeSession(id).catch(() => {});
    session = null;
  }
  if (!session) {
    const chromium = await getChromium();
    const profileDir = join(ROOT, id, ".browser-profile");
    await mkdir(profileDir, { recursive: true });
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: VIEWPORT,
      locale: options.locale ?? "ar",
      timezoneId: options.timezone ?? "Asia/Beirut",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    session = {
      id,
      context,
      page,
      log: [],
      allowlist: Array.isArray(options.allowlist) ? options.allowlist.map(String) : [],
      lastUsed: Date.now(),
      startedAt: Date.now(),
    };
    sessions.set(id, session);
  }
  if (Array.isArray(options.allowlist) && options.allowlist.length) {
    session.allowlist = options.allowlist.map(String);
  }
  session.lastUsed = Date.now();
  if (options.url) await navigate(session, String(options.url));
  return state(session);
}

export async function closeSession(projectId) {
  const session = sessions.get(safeId(projectId));
  if (!session) return { ok: true, closed: false };
  sessions.delete(session.id);
  await session.context.close().catch(() => {});
  return { ok: true, closed: true };
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({
    projectId: s.id,
    url: s.page.url(),
    startedAt: s.startedAt,
    lastUsed: s.lastUsed,
    allowlist: s.allowlist,
  }));
}

function require_(projectId) {
  const session = sessions.get(safeId(projectId));
  if (!session) throw new Error("لا توجد جلسة متصفح مفتوحة — نفّذ browser_open أولاً.");
  session.lastUsed = Date.now();
  return session;
}

setInterval(() => {
  const now = Date.now();
  for (const session of [...sessions.values()]) {
    if (now - session.lastUsed > IDLE_MS) void closeSession(session.id);
  }
}, 60_000).unref?.();

// ---------------------------------------------------------------- helpers

async function navigate(session, url) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  if (!allowed(session, target))
    throw new Error(`النطاق غير مسموح في هذه الجلسة: ${hostOf(target)}`);
  await session.page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
  pushLog(session, { action: "goto", url: target });
}

function state(session) {
  return {
    ok: true,
    url: session.page.url(),
    allowlist: session.allowlist,
    startedAt: session.startedAt,
    log: session.log.slice(-40),
  };
}

const SNAPSHOT = `(() => {
  const out = [];
  const seen = new Set();
  const sel = 'a,button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="menuitem"],[contenteditable="true"]';
  const nodes = [...document.querySelectorAll(sel)];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.05) continue;
    if (r.bottom < -200 || r.top > window.innerHeight + 2000) continue;
    const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\\s+/g,' ').slice(0,90);
    const key = el.tagName + '|' + label + '|' + Math.round(r.x) + ',' + Math.round(r.y);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      i: out.length,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || el.getAttribute('role') || '',
      label,
      value: (el.value ?? '').toString().slice(0, 60),
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    });
    if (out.length >= 120) break;
  }
  return {
    title: document.title || '',
    url: location.href,
    text: (document.body?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 6000),
    elements: out,
  };
})()`;

/** لقطة نصية/بنيوية للصفحة يقرأها النموذج قبل كل خطوة. */
export async function readPage(projectId) {
  const session = require_(projectId);
  const data = await session.page.evaluate(SNAPSHOT);
  return { ok: true, ...data };
}

/** إطار مرئي (JPEG base64) للبث الحيّ داخل واجهة Weaver. */
export async function frame(projectId, quality = 55) {
  const session = require_(projectId);
  const buf = await session.page.screenshot({ type: "jpeg", quality, fullPage: false });
  return {
    ok: true,
    url: session.page.url(),
    title: await session.page.title().catch(() => ""),
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    image: `data:image/jpeg;base64,${buf.toString("base64")}`,
  };
}

// ---------------------------------------------------------------- actions

/**
 * ينفّذ إجراءً واحداً على الصفحة.
 * actor: "agent" (الوكيل) أو "human" (تدخّل بشري من الواجهة الحيّة).
 */
export async function act(projectId, action = {}) {
  const session = require_(projectId);
  const page = session.page;
  const kind = String(action.kind ?? "");
  const actor = action.actor === "human" ? "human" : "agent";
  const approved = action.approved === true;

  const guard = (label) => {
    if (actor === "human" || approved) return;
    if (RISKY.test(String(label ?? ""))) {
      throw new Error(
        `خطوة حسّاسة ("${label}") — تحتاج موافقة صريحة. اسأل المستخدم عبر ask_user ثم أعد الإجراء بـ approved=true.`,
      );
    }
  };

  switch (kind) {
    case "goto":
      await navigate(session, String(action.url ?? ""));
      break;
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      break;
    case "reload":
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      break;
    case "click": {
      if (action.selector) {
        const el = page.locator(String(action.selector)).first();
        guard(await el.innerText().catch(() => action.selector));
        await el.click({ timeout: 15_000 });
      } else if (action.text) {
        guard(action.text);
        await page
          .getByText(String(action.text), { exact: false })
          .first()
          .click({ timeout: 15_000 });
      } else {
        guard(action.label ?? "");
        await page.mouse.click(Number(action.x ?? 0), Number(action.y ?? 0));
      }
      break;
    }
    case "dblclick":
      await page.mouse.dblclick(Number(action.x ?? 0), Number(action.y ?? 0));
      break;
    case "type": {
      const text = String(action.text ?? "");
      if (action.selector) {
        const el = page.locator(String(action.selector)).first();
        await el.fill("");
        await el.type(text, { delay: 18 });
      } else {
        if (action.x != null) await page.mouse.click(Number(action.x), Number(action.y ?? 0));
        if (action.clear) await page.keyboard.press("Control+A");
        await page.keyboard.type(text, { delay: 18 });
      }
      break;
    }
    case "press":
      await page.keyboard.press(String(action.key ?? "Enter"));
      break;
    case "scroll":
      await page.mouse.wheel(0, Number(action.dy ?? 600));
      break;
    case "select":
      await page.selectOption(String(action.selector ?? ""), String(action.value ?? ""));
      break;
    case "upload":
      await page.setInputFiles(String(action.selector ?? "input[type=file]"), action.files ?? []);
      break;
    case "wait":
      await page.waitForTimeout(Math.min(Number(action.ms ?? 1200), 20_000));
      break;
    case "wait_for":
      await page.waitForSelector(String(action.selector ?? "body"), { timeout: 30_000 });
      break;
    default:
      throw new Error(`إجراء غير معروف: ${kind}`);
  }

  await page.waitForTimeout(Number(action.settleMs ?? 500));
  pushLog(session, {
    action: kind,
    actor,
    detail: action.text ?? action.url ?? action.selector ?? "",
  });

  if (!allowed(session, page.url())) {
    throw new Error(`الصفحة انتقلت إلى نطاق غير مسموح: ${hostOf(page.url())}`);
  }
  return { ok: true, url: page.url(), title: await page.title().catch(() => "") };
}
