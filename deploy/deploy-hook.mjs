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
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = Number(process.env.DEPLOY_HOOK_PORT || 8790);
const BIND = process.env.DEPLOY_HOOK_HOST || "0.0.0.0";
const TOKEN = process.env.EXECUTOR_TOKEN || "";
const JOB_DIR = process.env.DEPLOY_JOB_DIR || "/tmp/weaver-deploy-jobs";
let activeJob = null;

mkdirSync(JOB_DIR, { recursive: true });

function jobPath(id, suffix) {
  return resolve(JOB_DIR, `${id}.${suffix}`);
}

function startJob(id, action, script, args) {
  const log = createWriteStream(jobPath(id, "log"), { flags: "a" });
  writeFileSync(
    jobPath(id, "json"),
    JSON.stringify({ id, action, status: "running", startedAt: new Date().toISOString() }),
  );
  const child = spawn("bash", args, { cwd: ROOT, env: process.env });
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
  });
}

const server = createServer(async (req, res) => {
  const auth = req.headers.authorization || "";
  if (!TOKEN || auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end("unauthorized");
    return;
  }

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

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, activeJob, time: new Date().toISOString() }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/deploy") {
    res.writeHead(405).end("method not allowed");
    return;
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

  // Respond before rebuilding the app container. Otherwise the caller is killed
  // with its own HTTP request still open and reports a false deployment failure.
  res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, accepted: true, jobId: id, action }));
  setImmediate(() => startJob(id, action, script, args));
});

server.listen(PORT, BIND, () => {
  console.log(`[weaver] deploy hook listening on ${BIND}:${PORT}`);
});
