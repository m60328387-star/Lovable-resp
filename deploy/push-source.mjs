#!/usr/bin/env node
/**
 * دفع كود Weaver مباشرة إلى GitHub ثم تشغيل النشر على كونتابو — بلا git يدوي.
 *
 * الاستخدام:
 *   GITHUB_TOKEN=... GITHUB_REPO_URL=... EXECUTOR_TOKEN=... \
 *   node deploy/push-source.mjs "رسالة الالتزام" [--no-deploy]
 *
 * يرفع كل ملفات المشروع (باستثناء الملفات المؤقتة والأسرار) عبر Git Data API،
 * ثم يستدعي خطّاف النشر على الخادم ويتابع حالة المهمة حتى تنتهي.
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";

const ROOT = resolve(process.cwd());
const TOKEN = process.env.GITHUB_TOKEN || "";
const REPO_URL = process.env.GITHUB_REPO_URL || "";
const HOOK_URL = process.env.PLATFORM_DEPLOY_URL || "http://194.163.155.52:8790/deploy";
const HOOK_TOKEN = process.env.EXECUTOR_TOKEN || "";
const MESSAGE = process.argv[2] || `weaver: sync ${new Date().toISOString()}`;
const SKIP_DEPLOY = process.argv.includes("--no-deploy");

if (!TOKEN || !REPO_URL) {
  console.error("GITHUB_TOKEN و GITHUB_REPO_URL مطلوبان");
  process.exit(1);
}

const slug = REPO_URL.replace(/^https?:\/\/(www\.)?github\.com\//, "")
  .replace(/\.git$/, "")
  .replace(/\/+$/, "");

const EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  ".output",
  "dist",
  ".vinxi",
  ".nitro",
  ".cache",
  ".turbo",
  "coverage",
  "playwright-report",
  "test-results",
  ".workspace",
  ".agents",
  ".claude",
  ".lovable",
]);
const EXCLUDE_FILES = new Set([
  "deploy/.env",
  ".env",
  ".env.local",
  "bun.lockb",
  ".git",
  ".gitmodules",
]);
const MAX_BYTES = 4 * 1024 * 1024;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDE_FILES.has(rel)) continue;
    if (statSync(abs).size > MAX_BYTES) continue;
    out.push(rel);
  }
  return out;
}

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const repo = await gh(`/repos/${slug}`);
  const branch = repo.default_branch || "main";

  let baseSha = "";
  try {
    const ref = await gh(`/repos/${slug}/git/ref/heads/${branch}`);
    baseSha = ref.object.sha;
  } catch {
    baseSha = "";
  }

  const files = walk(ROOT);
  console.log(`== رفع ${files.length} ملفاً إلى ${slug}@${branch} ==`);

  const tree = [];
  const binary = [];
  for (const rel of files) {
    const buf = readFileSync(join(ROOT, rel));
    const text = buf.toString("utf8");
    if (Buffer.from(text, "utf8").equals(buf)) {
      tree.push({ path: rel, mode: "100644", type: "blob", content: text });
    } else {
      binary.push({ rel, buf });
    }
  }
  // الملفات الثنائية فقط تحتاج blobs مستقلة (مع تهدئة لتفادي حدود GitHub).
  for (const item of binary) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const blob = await gh(`/repos/${slug}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: item.buf.toString("base64"), encoding: "base64" }),
        });
        tree.push({ path: item.rel, mode: "100644", type: "blob", sha: blob.sha });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      }
    }
  }
  console.log(`  نصية: ${files.length - binary.length} | ثنائية: ${binary.length}`);

  const newTree = await gh(`/repos/${slug}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree }),
  });
  const commit = await gh(`/repos/${slug}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: MESSAGE,
      tree: newTree.sha,
      parents: baseSha ? [baseSha] : [],
    }),
  });
  if (baseSha) {
    await gh(`/repos/${slug}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await gh(`/repos/${slug}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }
  console.log(`== تم الالتزام ${commit.sha.slice(0, 7)} ==`);

  if (SKIP_DEPLOY) return;
  if (!HOOK_TOKEN) {
    console.log("EXECUTOR_TOKEN غير متوفر — تخطّي تشغيل النشر.");
    return;
  }

  const res = await fetch(HOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${HOOK_TOKEN}` },
    body: JSON.stringify({ action: "deploy", ref: branch }),
  });
  const payload = await res.text();
  console.log(`== خطّاف النشر ${res.status}: ${payload.slice(0, 300)} ==`);
  let jobId = "";
  try {
    jobId = JSON.parse(payload).jobId || "";
  } catch {
    /* استجابة غير JSON من نسخة قديمة من الخطّاف */
  }
  if (!jobId) return;

  const statusUrl = HOOK_URL.replace(/\/deploy\/?$/, "/status/");
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const s = await fetch(`${statusUrl}${jobId}`, {
        headers: { Authorization: `Bearer ${HOOK_TOKEN}` },
      });
      if (!s.ok) continue;
      const state = await s.json();
      if (state.status === "running") {
        process.stdout.write(".");
        continue;
      }
      console.log(`\n== النشر: ${state.status} ==`);
      console.log(String(state.log || "").slice(-4000));
      process.exit(state.status === "success" ? 0 : 1);
    } catch {
      process.stdout.write("?");
    }
  }
  console.log("\nانتهت مهلة المتابعة؛ راجع لوحة النشر داخل Weaver.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
