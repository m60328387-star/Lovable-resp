#!/usr/bin/env node
/**
 * Weaver Executor Agent
 * وكيل التنفيذ — يعمل على خادمك الخاص (Contabo / أي VPS) ويشغّل أوامر Weaver فعلياً.
 *
 * التشغيل:
 *   WEAVER_URL=https://buildbuddy-ai-55.lovable.app \
 *   WEAVER_TOKEN=<رمز المنفّذ> \
 *   node weaver-agent.mjs
 *
 * المتطلبات: Node.js 18+ فقط (بلا حزم خارجية).
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const BASE = (process.env.WEAVER_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.WEAVER_TOKEN || "";
const WORKDIR = process.env.WEAVER_WORKDIR || "/opt/weaver/work";
const POLL_MS = Number(process.env.WEAVER_POLL_MS || 4000);
const TIMEOUT_MS = Number(process.env.WEAVER_TIMEOUT_MS || 15 * 60 * 1000);
const MAX_FILE = 400_000;

if (!BASE || !TOKEN) {
  console.error("WEAVER_URL و WEAVER_TOKEN مطلوبان.");
  process.exit(1);
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".cache",
  ".turbo", "coverage", "vendor", ".venv", "__pycache__",
]);
const TEXT_EXT = /\.(html?|css|scss|js|mjs|cjs|jsx|ts|tsx|json|md|txt|svg|yml|yaml|env|toml|xml|csv|sql|sh|py)$/i;

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function api(action, body) {
  const res = await fetch(`${BASE}/api/public/executor/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${action} → ${res.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

/** يكتب ملفات المشروع في مجلد عمل معزول لكل مشروع. */
async function materialize(projectId, files) {
  const root = join(WORKDIR, projectId);
  await mkdir(root, { recursive: true });
  for (const f of files) {
    const rel = String(f.path).replace(/^\/+/, "");
    if (rel.includes("..")) continue;
    const dest = join(root, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, f.content ?? "", "utf8");
  }
  return root;
}

/** يجمع الملفات النصية بعد التنفيذ لإرجاع التعديلات. */
async function collect(root) {
  const out = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".env.example") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(full);
        continue;
      }
      if (!TEXT_EXT.test(e.name)) continue;
      const info = await stat(full).catch(() => null);
      if (!info || info.size > MAX_FILE) continue;
      out.push({ path: relative(root, full).split(sep).join("/"), content: await readFile(full, "utf8") });
      if (out.length >= 80) return;
    }
  }
  await walk(root);
  return out;
}

function exec(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let out = "";
    const push = (chunk) => {
      out += chunk.toString();
      if (out.length > 200_000) out = out.slice(-200_000);
    };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    const timer = setTimeout(() => {
      out += `\n[weaver] تجاوز المهلة (${TIMEOUT_MS / 1000}s) — أُنهي الأمر.`;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ output: out.trim(), exitCode: code ?? -1 });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ output: `${out}\n[weaver] ${err.message}`.trim(), exitCode: -1 });
    });
  });
}

async function tick() {
  const { run, files } = await api("poll", {});
  if (!run) return false;

  log(`▶ أمر ${run.id}: ${run.command}`);
  const root = await materialize(run.projectId, files ?? []);
  const before = new Map((files ?? []).map((f) => [f.path, f.content]));
  const { output, exitCode } = await exec(run.command, root);
  const after = await collect(root);
  const changed = after.filter((f) => before.get(f.path) !== f.content);

  await api("result", { runId: run.id, output, exitCode, files: changed });
  log(`■ انتهى ${run.id} — الخروج ${exitCode}، ملفات محدّثة ${changed.length}`);
  return true;
}

async function main() {
  await mkdir(WORKDIR, { recursive: true });
  const info = await api("heartbeat", {
    meta: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      workdir: WORKDIR,
    },
  });
  log(`متصل كمنفّذ: ${info?.executor?.name ?? "?"} — مجلد العمل ${WORKDIR}`);

  let beat = 0;
  for (;;) {
    try {
      const worked = await tick();
      if (!worked && ++beat % 15 === 0) {
        await api("heartbeat", { meta: { node: process.version, platform: `${process.platform}/${process.arch}` } });
      }
    } catch (err) {
      log("خطأ:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
void rm; // محجوز للتنظيف المستقبلي
main();
