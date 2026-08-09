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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = Number(process.env.DEPLOY_HOOK_PORT || 8790);
const TOKEN = process.env.EXECUTOR_TOKEN || "";

function run(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: ROOT, env: process.env });
    let log = "";
    const push = (chunk) => {
      log += chunk.toString();
      if (log.length > 200_000) log = log.slice(-200_000);
    };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("close", (code) => resolveRun({ code: code ?? 1, log }));
    child.on("error", (error) => resolveRun({ code: 1, log: `${log}\n${error.message}` }));
  });
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end("method not allowed");
    return;
  }
  const auth = req.headers.authorization || "";
  if (TOKEN && auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end("unauthorized");
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
  const script = action === "rollback" ? "deploy/rollback.sh" : "deploy/deploy.sh";
  const result = await run("bash", [script]);

  res.writeHead(result.code === 0 ? 200 : 500, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`[${action}] exit=${result.code}\n${result.log}`);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[weaver] deploy hook listening on 127.0.0.1:${PORT}`);
});
