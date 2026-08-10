#!/usr/bin/env node
/**
 * خطّاف النشر: خدمة صغيرة تعمل على الـVPS وتستقبل أمر النشر/التراجع من واجهة Weaver
 * فتشغّل deploy/deploy.sh وتعيد السجل. شغّلها بـ:
 *   node deploy/deploy-hook.mjs
 * وتُضبط في deploy/.env:
 *   DEPLOY_HOOK_PORT=8790
 *   EXECUTOR_TOKEN=<نفس الرمز المستخدم في التطبيق>
 *   PLATFORM_DEPLOY_URL=http://127.0.0.1:8790/deploy
 */
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);

/** ينفّذ أمر تشخيص قصير ويعيد مخرجاته بلا رمي استثناء. */
async function sh(cmd, args, timeout = 8000) {
  try {
    const { stdout, stderr } = await run(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, out: `${stdout || ""}${stderr || ""}`.trim() };
  } catch (error) {
    return { ok: false, out: String(error?.stdout || error?.message || error).trim() };
  }
}

/** آخر مهمة نشر مسجّلة على القرص مع آخر 200 سطر من سجلّها. */
function lastDeployJob(lines = 200) {
  try {
    const files = readdirSync(JOB_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => ({ name, at: statSync(resolve(JOB_DIR, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    const newest = files[0];
    if (!newest) return null;
    const id = newest.name.replace(/\.json$/, "");
    const state = JSON.parse(readFileSync(jobPath(id, "json"), "utf8"));
    let log = "";
    try {
      log = readFileSync(jobPath(id, "log"), "utf8");
    } catch {
      log = "";
    }
    const tail = log.split("\n").slice(-lines).join("\n");
    const failures = tail
      .split("\n")
      .filter((line) => /error|fatal|failed|exit=[1-9]|npm ERR!|denied|not found/i.test(line))
      .slice(-12);
    return { ...state, log: tail, failures };
  } catch {
    return null;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = Number(process.env.DEPLOY_HOOK_PORT || 8790);
const BIND = process.env.DEPLOY_HOOK_HOST || "0.0.0.0";
const TOKEN = process.env.EXECUTOR_TOKEN || "";
const JOB_DIR = process.env.DEPLOY_JOB_DIR || "/tmp/weaver-deploy-jobs";
let activeJob = null;
let activeSince = 0;
const STALE_MS = Number(process.env.DEPLOY_JOB_STALE_MS || 70 * 60 * 1000);

mkdirSync(JOB_DIR, { recursive: true });

function jobPath(id, suffix) {
  return resolve(JOB_DIR, `${id}.${suffix}`);
}

function startJob(id, action, script, args, extraEnv = {}) {
  const log = createWriteStream(jobPath(id, "log"), { flags: "a" });
  writeFileSync(
    jobPath(id, "json"),
    JSON.stringify({ id, action, status: "running", startedAt: new Date().toISOString() }),
  );
  activeJob = id;
  activeSince = Date.now();
  const child = spawn("bash", args, { cwd: ROOT, env: { ...process.env, ...extraEnv } });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("close", (code) => {
    const status = code === 0 ? "success" : "failed";
    writeFileSync(
      jobPath(id, "json"),
      JSON.stringify({ id, action, status, code: code ?? 1, finishedAt: new Date().toISOString() }),
    );
    log.end(`\n[${action}] exit=${code ?? 1}\n`);
    activeJob = null;
    activeSince = 0;
  });
  child.on("error", (error) => {
    writeFileSync(
      jobPath(id, "json"),
      JSON.stringify({
        id,
        action,
        status: "failed",
        code: 1,
        error: error.message,
        finishedAt: new Date().toISOString(),
      }),
    );
    log.end(`\n${error.message}\n`);
    activeJob = null;
    activeSince = 0;
  });
}

/** مقارنة ثابتة الزمن تمنع استنتاج الرمز عبر توقيت الاستجابة. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * قفل تصاعدي ضد تخمين رمز التنفيذ: الخطّاف يشغّل سكربتات بصلاحيات عالية،
 * لذا نمنع أي عنوان بعد 5 محاولات فاشلة لمدة 15 دقيقة.
 */
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function clientKey(req) {
  return req.socket.remoteAddress || "unknown";
}

function isBlocked(key) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    failures.delete(key);
    return false;
  }
  return entry.count >= FAIL_LIMIT;
}

function noteFailure(key) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now > entry.until) {
    failures.set(key, { count: 1, until: now + FAIL_WINDOW_MS });
    return;
  }
  entry.count += 1;
  entry.until = now + FAIL_WINDOW_MS;
}

const server = createServer(async (req, res) => {
  const key = clientKey(req);
  if (isBlocked(key)) {
    res.writeHead(429).end("too many attempts");
    return;
  }

  const auth = req.headers.authorization || "";
  if (!TOKEN || TOKEN.length < 24 || !safeEqual(auth, `Bearer ${TOKEN}`)) {
    noteFailure(key);
    res.writeHead(401).end("unauthorized");
    return;
  }
  failures.delete(key);

  const statusMatch = req.url?.match(/^\/status\/([a-zA-Z0-9-]+)$/);
  if (req.method === "GET" && statusMatch) {
    try {
      const id = statusMatch[1];
      const state = JSON.parse(readFileSync(jobPath(id, "json"), "utf8"));
      const log = readFileSync(jobPath(id, "log"), "utf8").slice(-20000);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ...state, log }));
    } catch {
      res.writeHead(404).end("job not found");
    }
    return;
  }

  if (req.method === "POST" && req.url === "/cancel") {
    const previous = activeJob;
    activeJob = null;
    activeSince = 0;
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, cleared: previous }));
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, activeJob, activeSince, time: new Date().toISOString() }));
    return;
  }

  // تشخيص شامل: حالة الخدمات على كونتابو + آخر مهمة نشر مع آخر 200 سطر.
  if (req.method === "GET" && req.url?.startsWith("/diag")) {
    const [nginx, runtime, app, worker, disk, uptime] = await Promise.all([
      sh("docker", ["inspect", "-f", "{{.State.Status}}", "weaver-nginx"]),
      sh("docker", ["inspect", "-f", "{{.State.Status}}", "weaver-runtime"]),
      sh("docker", ["inspect", "-f", "{{.State.Status}}", "weaver-app"]),
      sh("docker", ["inspect", "-f", "{{.State.Status}}", "weaver-worker"]),
      sh("df", ["-h", "/"]),
      sh("uptime", ["-p"]),
    ]);
    const container = (probe) => ({
      ok: probe.ok && /^running/.test(probe.out),
      detail: probe.out.slice(0, 400) || "غير متاح",
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        time: new Date().toISOString(),
        hook: { ok: true, activeJob, activeSince, uptime: uptime.out },
        containers: {
          nginx: container(nginx),
          runtime: container(runtime),
          app: container(app),
          worker: container(worker),
        },
        disk: disk.out.split("\n").slice(0, 3).join("\n"),
        lastDeploy: lastDeployJob(200),
      }),
    );
    return;
  }

  // إعادة تشغيل خدمة محدّدة عند ظهور 502/503 من البوابة.
  if (req.method === "POST" && req.url === "/restart") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let input = {};
    try {
      input = raw ? JSON.parse(raw) : {};
    } catch {
      input = {};
    }
    const service = String(input.service || "");
    const allowed = { nginx: "weaver-nginx", runtime: "weaver-runtime", app: "weaver-app", worker: "weaver-worker" };
    if (service === "deploy-hook") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service, detail: "سيُعاد تشغيل خطّاف النشر خلال ثانية." }));
      setTimeout(() => {
        void sh("systemctl", ["restart", "weaver-deploy-hook"], 15000).then(() => process.exit(0));
      }, 800);
      return;
    }
    const container = allowed[service];
    if (!container) {
      res.writeHead(400).end("unknown service");
      return;
    }
    const result = await sh("docker", ["restart", container], 90000);
    res.writeHead(result.ok ? 200 : 500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: result.ok, service, detail: result.out.slice(0, 2000) }));
    return;
  }


  // ربط دومين مخصّص بموقع منشور: يشغّل deploy/add-domain.sh (nginx + certbot).
  if (req.method === "POST" && req.url === "/domain") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let input = {};
    try {
      input = raw ? JSON.parse(raw) : {};
    } catch {
      input = {};
    }
    const domain = String(input.domain || "").toLowerCase();
    const slug = String(input.slug || "").toLowerCase();
    const email = String(input.email || "");
    if (email && !/^[^\s@]{1,64}@[a-z0-9.-]{3,190}\.[a-z]{2,20}$/i.test(email)) {
      res.writeHead(400).end("invalid email");
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      res.writeHead(400).end("invalid domain");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) {
      res.writeHead(400).end("invalid slug");
      return;
    }
    const domainJob = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, accepted: true, jobId: domainJob, action: "domain" }));
    setImmediate(() =>
      startJob(domainJob, "domain", "deploy/add-domain.sh", ["deploy/add-domain.sh"], {
        DOMAIN: domain,
        SLUG: slug,
        LE_EMAIL: email,
      }),
    );
    return;
  }

  if (req.method !== "POST" || req.url !== "/deploy") {
    res.writeHead(405).end("method not allowed");
    return;
  }

  if (activeJob && Date.now() - activeSince > STALE_MS) {
    // مهمة معلّقة منذ وقت طويل (سكربت لم ينتهِ) — نحرّر القفل بدل تعطيل النشر للأبد.
    activeJob = null;
    activeSince = 0;
  }

  if (activeJob) {
    res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "deployment already running", jobId: activeJob }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }

  const action = payload.action === "rollback" ? "rollback" : "deploy";
  const script = action === "rollback" ? "deploy/server-rollback.sh" : "deploy/server-deploy.sh";
  const args =
    action === "deploy" && typeof payload.ref === "string" && /^[\w./-]{1,80}$/.test(payload.ref)
      ? [script, payload.ref]
      : [script];
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  activeJob = id;
  activeSince = Date.now();

  // Respond before rebuilding the app container. Otherwise the caller is killed
  // with its own HTTP request still open and reports a false deployment failure.
  res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, accepted: true, jobId: id, action }));
  setImmediate(() => startJob(id, action, script, args));
});

server.listen(PORT, BIND, () => {
  console.log(`[weaver] deploy hook listening on ${BIND}:${PORT}`);
});
