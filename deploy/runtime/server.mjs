// Weaver Runtime — بيئة تنفيذ حقيقية لكل مشروع.
// تدير مساحة عمل على القرص لكل مشروع، تشغّل أوامر shell فعلية،
// تشغّل خادم تطوير (Vite/Next/أي npm script) وتبثّ المعاينة الحيّة عبر بروكسي.

import http from "node:http";
import net from "node:net";
import { createHash } from "node:crypto";
import { spawn, exec } from "node:child_process";
import { mkdir, writeFile, readFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { dirname, join, resolve, extname, relative } from "node:path";

const PORT = Number(process.env["RUNTIME_PORT"] ?? 4100);
const TOKEN = process.env["EXECUTOR_TOKEN"] ?? "";
const ROOT = process.env["RUNTIME_ROOT"] ?? "/workspaces";
const PORT_BASE = Number(process.env["RUNTIME_PORT_BASE"] ?? 5200);
const PORT_RANGE = Number(process.env["RUNTIME_PORT_RANGE"] ?? 40);
const MAX_EXEC_MS = Number(process.env["RUNTIME_MAX_EXEC_MS"] ?? 300_000);
const MAX_OUTPUT = 200_000;
const LOG_LINES = 800;
const PREVIEW_PREFIX = "/api/public/rt";

if (!TOKEN || TOKEN.length < 16) {
  console.error("[runtime] EXECUTOR_TOKEN مفقود أو قصير — أوقف التشغيل.");
  process.exit(1);
}

/** @type {Map<string, any>} */
const servers = new Map();

// ====== ضبط الموارد على خادم واحد ======
// الهدف: ألا يخنق أي مشروع المنصةَ نفسها. ثلاث آليات:
// 1) طابور للأوامر الثقيلة (npm install/build) بحد أقصى واحد في اللحظة.
// 2) سقف لعدد خوادم التطوير الحيّة مع إخراج الأقدم خمولاً.
// 3) حاصد يوقف الخوادم الخاملة ويحذف مساحات العمل المهجورة.
const HEAVY_CONCURRENCY = Math.max(1, Number(process.env["RUNTIME_HEAVY_CONCURRENCY"] ?? 1));
const MAX_SERVERS = Math.max(1, Number(process.env["RUNTIME_MAX_SERVERS"] ?? 3));
const IDLE_STOP_MS = Number(process.env["RUNTIME_IDLE_STOP_MS"] ?? 20 * 60_000);
const WORKSPACE_TTL_MS = Number(process.env["RUNTIME_WORKSPACE_TTL_MS"] ?? 14 * 86_400_000);
const NPM_CACHE = process.env["RUNTIME_NPM_CACHE"] ?? "/workspaces/.npm-cache";

const heavyQueue = [];
let heavyRunning = 0;

const isHeavy = (command) => /\b(npm|pnpm|yarn|bun|npx|vite|tsc|next|webpack|esbuild)\b/i.test(command);

/** ينفّذ المهام الثقيلة بالتتابع حتى لا تلتهم الذاكرة دفعة واحدة. */
function withHeavySlot(task) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      heavyRunning += 1;
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      } finally {
        heavyRunning -= 1;
        const next = heavyQueue.shift();
        if (next) next();
      }
    };
    if (heavyRunning < HEAVY_CONCURRENCY) run();
    else heavyQueue.push(run);
  });
}

const touch = (id) => {
  const entry = servers.get(id);
  if (entry) entry.lastSeen = Date.now();
};

const safeId = (value) =>
  String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
const workspaceDir = (projectId) => join(ROOT, safeId(projectId));


function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function pushLog(entry, line) {
  for (const part of String(line).split(/\r?\n/)) {
    if (!part) continue;
    entry.logs.push(part.slice(0, 2000));
  }
  if (entry.logs.length > LOG_LINES) entry.logs.splice(0, entry.logs.length - LOG_LINES);
}

async function portFree(port) {
  return new Promise((done) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      done(false);
    });
    socket.on("error", () => done(true));
    setTimeout(() => {
      socket.destroy();
      done(true);
    }, 400);
  });
}

async function allocatePort() {
  const used = new Set([...servers.values()].map((s) => s.port));
  for (let i = 0; i < PORT_RANGE; i += 1) {
    const port = PORT_BASE + i;
    if (used.has(port)) continue;
    if (await portFree(port)) return port;
  }
  throw new Error("لا توجد منافذ متاحة لخوادم التطوير.");
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portFree(port))) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

// ---------------------------------------------------------------- workspace

async function syncFiles(projectId, files, clean) {
  const dir = workspaceDir(projectId);
  if (clean && existsSync(dir)) await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const file of files ?? []) {
    const target = resolve(dir, String(file.path).replace(/^\/+/, ""));
    if (!target.startsWith(dir)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, String(file.content ?? ""), "utf-8");
    written += 1;
  }
  return { dir, written };
}

async function listWorkspace(projectId, limit = 500) {
  const dir = workspaceDir(projectId);
  if (!existsSync(dir)) return [];
  const out = [];
  const skip = new Set(["node_modules", ".git", ".next", ".cache", "dist/.vite"]);
  async function walk(current) {
    if (out.length >= limit) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (skip.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const info = await stat(full).catch(() => null);
        out.push({ path: relative(dir, full).replace(/\\/g, "/"), bytes: info?.size ?? 0 });
      }
    }
  }
  await walk(dir);
  return out;
}

async function readWorkspaceFile(projectId, path) {
  const dir = workspaceDir(projectId);
  const target = resolve(dir, String(path).replace(/^\/+/, ""));
  if (!target.startsWith(dir) || !existsSync(target)) return null;
  const info = await stat(target);
  if (info.size > 2_000_000) return null;
  return readFile(target, "utf-8");
}

// ---------------------------------------------------------------- exec

async function runCommand(projectId, command, timeoutMs) {
  const dir = workspaceDir(projectId);
  await mkdir(dir, { recursive: true });
  const heavy = isHeavy(command);
  const exec1 = () =>
    new Promise((done) => {
      const started = Date.now();
      // الأوامر الثقيلة تعمل بأولوية منخفضة (nice) حتى تبقى المنصة مستجيبة.
      const child = exec(heavy ? `nice -n 15 sh -c ${JSON.stringify(command)}` : command, {
        cwd: dir,
        timeout: Math.min(timeoutMs || MAX_EXEC_MS, MAX_EXEC_MS),
        maxBuffer: MAX_OUTPUT,
        env: {
          ...process.env,
          CI: "1",
          npm_config_fund: "false",
          npm_config_audit: "false",
          npm_config_cache: NPM_CACHE,
          npm_config_progress: "false",
          NODE_OPTIONS: process.env["NODE_OPTIONS"] ?? "--max-old-space-size=1024",
        },
      });

      let output = "";
      const append = (chunk) => {
        if (output.length < MAX_OUTPUT) output += chunk;
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      child.on("close", (code, signal) =>
        done({
          ok: code === 0,
          exitCode: code ?? (signal ? 124 : 1),
          signal: signal ?? null,
          output: output.slice(-MAX_OUTPUT),
          durationMs: Date.now() - started,
        }),
      );
      child.on("error", (err) =>
        done({
          ok: false,
          exitCode: 1,
          output: `${output}\n${String(err)}`,
          durationMs: Date.now() - started,
        }),
      );
    });
  return heavy ? withHeavySlot(exec1) : exec1();
}


// ---------------------------------------------------------------- dev server

async function detectStart(projectId, port) {
  const dir = workspaceDir(projectId);
  const pkgPath = join(dir, "package.json");
  const base = `${PREVIEW_PREFIX}/${safeId(projectId)}/`;
  if (!existsSync(pkgPath)) return { mode: "static", command: null, base };

  const pkg = JSON.parse(await readFile(pkgPath, "utf-8").catch(() => "{}"));
  const scripts = pkg.scripts ?? {};
  const script = scripts.dev ? "dev" : scripts.start ? "start" : null;
  if (!script) return { mode: "static", command: null, base };

  const raw = String(scripts[script]);
  const isVite = /vite/.test(raw);
  const flags = isVite
    ? ` -- --host 0.0.0.0 --port ${port} --strictPort --base ${base}`
    : ` -- --port ${port}`;
  return { mode: isVite ? "vite" : "npm", command: `npm run ${script}${flags}`, base };
}

async function stopDev(projectId) {
  const entry = servers.get(safeId(projectId));
  if (!entry) return { ok: true, stopped: false };
  try {
    process.kill(-entry.proc.pid, "SIGTERM");
  } catch {
    entry.proc.kill("SIGTERM");
  }
  servers.delete(safeId(projectId));
  return { ok: true, stopped: true };
}

/** يُخرج أقدم الخوادم خمولاً عند بلوغ السقف — الذاكرة محدودة على خادم واحد. */
async function enforceServerCap(exceptId) {
  const live = [...servers.entries()]
    .filter(([id, e]) => id !== exceptId && e.port > 0 && e.exitCode === null)
    .sort((a, b) => (a[1].lastSeen ?? a[1].startedAt) - (b[1].lastSeen ?? b[1].startedAt));
  while (live.length >= MAX_SERVERS) {
    const victim = live.shift();
    if (!victim) break;
    await stopDev(victim[0]);
  }
}

async function startDev(projectId, overrideCommand) {
  const id = safeId(projectId);
  await stopDev(id);
  await enforceServerCap(id);
  const dir = workspaceDir(id);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });


  // المشاريع المعتمدة على npm يجب أن تصبح قابلة للمعاينة دون خطوة يدوية.
  // npm install تزايدي: يعيد استخدام node_modules والحجم المخبأ في مساحة المشروع.
  const pkgPath = join(dir, "package.json");
  const lockPath = ["package-lock.json", "npm-shrinkwrap.json"]
    .map((name) => join(dir, name))
    .find((path) => existsSync(path));
  const installStampPath = join(dir, "node_modules", ".weaver-install-hash");
  const installLogs = [];
  if (existsSync(pkgPath)) {
    const dependencyHash = createHash("sha256")
      .update(await readFile(pkgPath))
      .update(lockPath ? await readFile(lockPath) : "")
      .digest("hex");
    const installedHash = await readFile(installStampPath, "utf-8").catch(() => "");
    const needsInstall = installedHash !== dependencyHash;
    const installed = needsInstall
      ? await runCommand(
          id,
          lockPath ? "npm ci --no-audit --no-fund" : "npm install --no-audit --no-fund",
          MAX_EXEC_MS,
        )
      : { ok: true, exitCode: 0, output: "[runtime] الاعتماديات محدثة — تم تخطي npm install." };
    if (installed.output) installLogs.push(installed.output);
    if (!installed.ok) {
      const entry = {
        proc: { pid: 0, kill() {} },
        port: 0,
        command: "npm install --no-audit --no-fund",
        mode: "install",
        logs: installLogs,
        startedAt: Date.now(),
        ready: false,
        exitCode: installed.exitCode,
      };
      servers.set(id, entry);
      return {
        ok: false,
        mode: "install",
        port: 0,
        previewPath: `${PREVIEW_PREFIX}/${id}/`,
        ready: false,
        exitCode: installed.exitCode,
        logs: installLogs.slice(-120),
      };
    }
    if (needsInstall) await writeFile(installStampPath, dependencyHash, "utf-8");
  }

  const port = await allocatePort();
  const detected = await detectStart(id, port);
  const command = overrideCommand || detected.command;

  if (!command) {
    const entry = {
      proc: { pid: 0, kill() {} },
      port: 0,
      command: "static",
      mode: "static",
      logs: [...installLogs, "[runtime] لا يوجد package.json — تُخدَم الملفات الثابتة مباشرة."],
      startedAt: Date.now(),
      ready: true,
      exitCode: null,
    };
    servers.set(id, entry);
    return {
      ok: true,
      mode: "static",
      port: 0,
      previewPath: `${PREVIEW_PREFIX}/${id}/`,
      ready: true,
    };
  }

  const proc = spawn("sh", ["-c", command], {
    cwd: dir,
    detached: true,
    env: { ...process.env, PORT: String(port), HOST: "0.0.0.0", BROWSER: "none", CI: "1" },
  });

  const entry = {
    proc,
    port,
    command,
    mode: detected.mode,
    // خوادم Vite تعمل تحت مسار أساس (base) فيجب إعادة إضافته عند التمرير.
    base: detected.mode === "vite" && !overrideCommand ? `${PREVIEW_PREFIX}/${id}` : "",
    logs: [...installLogs, `[runtime] $ ${command}`],
    startedAt: Date.now(),
    ready: false,
    exitCode: null,
  };
  servers.set(id, entry);

  proc.stdout?.on("data", (d) => pushLog(entry, d.toString()));
  proc.stderr?.on("data", (d) => pushLog(entry, d.toString()));
  proc.on("close", (code) => {
    entry.exitCode = code ?? 0;
    entry.ready = false;
    pushLog(entry, `[runtime] توقف خادم التطوير برمز ${code}`);
  });

  const ready = await waitForPort(port, 90_000);
  entry.ready = ready && entry.exitCode === null;

  return {
    ok: entry.ready,
    mode: entry.mode,
    port,
    previewPath: `${PREVIEW_PREFIX}/${id}/`,
    ready: entry.ready,
    exitCode: entry.exitCode,
    logs: entry.logs.slice(-120),
  };
}

function devStatus(projectId) {
  const entry = servers.get(safeId(projectId));
  if (!entry) return { running: false };
  return {
    running: entry.exitCode === null,
    ready: entry.ready,
    mode: entry.mode,
    port: entry.port,
    command: entry.command,
    uptimeMs: Date.now() - entry.startedAt,
    exitCode: entry.exitCode,
    previewPath: `${PREVIEW_PREFIX}/${safeId(projectId)}/`,
  };
}

/** يلتقط أخطاء البناء من سجلّ خادم التطوير — أساس حلقة الإصلاح الذاتي. */
function devErrors(projectId) {
  const entry = servers.get(safeId(projectId));
  if (!entry) return [];
  return entry.logs.filter((line) =>
    /(error|failed|cannot find|is not defined|unexpected token|ENOENT|Module not found)/i.test(
      line,
    ),
  );
}

// ---------------------------------------------------------------- static serve

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(projectId, rest, res) {
  const dir = workspaceDir(projectId);
  const candidates = [];
  const clean = rest.split("?")[0] ?? "";
  if (!clean || clean.endsWith("/")) candidates.push(join(clean, "index.html"));
  else candidates.push(clean, `${clean}.html`, join(clean, "index.html"));
  candidates.push("index.html");

  for (const candidate of candidates) {
    const target = resolve(dir, candidate.replace(/^\/+/, ""));
    if (!target.startsWith(dir) || !existsSync(target)) continue;
    const info = await stat(target);
    if (!info.isFile()) continue;
    res.writeHead(200, {
      "Content-Type": MIME[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(target).pipe(res);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>لا توجد ملفات في مساحة العمل بعد</h1>");
}

// ---------------------------------------------------------------- preview proxy

function proxyToDev(entry, rest, req, res) {
  const proxyReq = http.request(
    {
      host: "127.0.0.1",
      port: entry.port,
      path: `${entry.base ?? ""}${rest.startsWith("/") ? rest : `/${rest}`}`,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${entry.port}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`تعذّر الوصول إلى خادم التطوير: ${String(err)}`);
  });
  req.pipe(proxyReq);
}

// ---------------------------------------------------------------- http server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://runtime");
  const path = url.pathname;

  if (path === "/health")
    return json(res, {
      ok: true,
      servers: servers.size,
      maxServers: MAX_SERVERS,
      heavyRunning,
      heavyQueued: heavyQueue.length,
      at: Date.now(),
    });


  // المعاينة عامة (تُستهلك داخل iframe) — تُقيَّد بمعرّف المشروع فقط.
  if (path.startsWith("/p/")) {
    const [, , projectId, ...restParts] = path.split("/");
    const id = safeId(projectId);
    const rest = `/${restParts.join("/")}${url.search}`;
    const entry = servers.get(id);
    touch(id);
    if (entry && entry.port > 0 && entry.exitCode === null)
      return proxyToDev(entry, rest, req, res);

    return serveStatic(id, rest, res);
  }

  const token = (req.headers["x-weaver-token"] ?? "").toString();
  if (token !== TOKEN) return json(res, { error: "unauthorized" }, 401);

  const body = await new Promise((done) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 40_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        done(raw ? JSON.parse(raw) : {});
      } catch {
        done({});
      }
    });
  });

  try {
    const projectId = safeId(body.projectId ?? url.searchParams.get("projectId"));
    switch (path) {
      case "/sync":
        return json(res, { ok: true, ...(await syncFiles(projectId, body.files, body.clean)) });
      case "/exec":
        return json(
          res,
          await runCommand(projectId, String(body.command ?? ""), Number(body.timeoutMs ?? 0)),
        );
      case "/dev/start":
        return json(res, await startDev(projectId, body.command ? String(body.command) : null));
      case "/dev/stop":
        return json(res, await stopDev(projectId));
      case "/dev/status":
        touch(projectId);
        return json(res, devStatus(projectId));

      case "/dev/logs": {
        const entry = servers.get(projectId);
        return json(res, {
          logs: entry ? entry.logs.slice(-Number(body.limit ?? 200)) : [],
          errors: devErrors(projectId),
          status: devStatus(projectId),
        });
      }
      case "/files/list":
        return json(res, { files: await listWorkspace(projectId, Number(body.limit ?? 500)) });
      case "/files/read":
        return json(res, { content: await readWorkspaceFile(projectId, String(body.path ?? "")) });
      case "/browser/check": {
        const { browserCheck } = await import("./browser.mjs");
        const result = await browserCheck(`http://127.0.0.1:${PORT}/p/${projectId}/`, {
          path: body.path ? String(body.path) : "",
          devices: Array.isArray(body.devices) ? body.devices.map(String) : undefined,
          screenshots: body.screenshots !== false,
          waitMs: Number(body.waitMs ?? 1500),
        });
        return json(res, result);
      }
      case "/browser/session/open": {
        const ab = await import("./agent-browser.mjs");
        return json(res, await ab.openSession(projectId, body));
      }
      case "/browser/session/act": {
        const ab = await import("./agent-browser.mjs");
        return json(res, await ab.act(projectId, body.action ?? {}));
      }
      case "/browser/session/read": {
        const ab = await import("./agent-browser.mjs");
        return json(res, await ab.readPage(projectId));
      }
      case "/browser/session/frame": {
        const ab = await import("./agent-browser.mjs");
        return json(res, await ab.frame(projectId, Number(body.quality ?? 55)));
      }
      case "/browser/session/close": {
        const ab = await import("./agent-browser.mjs");
        return json(res, await ab.closeSession(projectId));
      }
      case "/browser/session/list": {
        const ab = await import("./agent-browser.mjs");
        return json(res, { sessions: ab.listSessions() });
      }
      case "/workspace/reset":
        await stopDev(projectId);
        await rm(workspaceDir(projectId), { recursive: true, force: true });
        return json(res, { ok: true });
      default:
        return json(res, { error: "not_found" }, 404);
    }
  } catch (err) {
    return json(res, { ok: false, error: String(err?.message ?? err) }, 500);
  }
});

// ترقية WebSocket (HMR) إلى خادم التطوير الخاص بالمشروع.
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://runtime");
  if (!url.pathname.startsWith("/p/")) return socket.destroy();
  const [, , projectId, ...restParts] = url.pathname.split("/");
  const entry = servers.get(safeId(projectId));
  if (!entry || entry.port <= 0) return socket.destroy();

  const upstream = net.connect(entry.port, "127.0.0.1", () => {
    const rest = `/${restParts.join("/")}${url.search}`;
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\r\n");
    upstream.write(`GET ${entry.base ?? ""}${rest} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

// ---------------------------------------------------------------- الحاصد
// يوقف خوادم التطوير الخاملة (ذاكرة) ويحذف مساحات العمل المهجورة (قرص).
async function reap() {
  const now = Date.now();
  for (const [id, entry] of servers) {
    if (entry.port <= 0 || entry.exitCode !== null) continue;
    const idleMs = now - (entry.lastSeen ?? entry.startedAt);
    if (idleMs > IDLE_STOP_MS) {
      await stopDev(id);
      console.log(`[runtime] أوقفت خادم ${id} بعد ${Math.round(idleMs / 60000)} دقيقة خمول.`);
    }
  }
  const entries = await readdir(ROOT, { withFileTypes: true }).catch(() => []);
  for (const dirent of entries) {
    if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
    if (servers.has(dirent.name)) continue;
    const full = join(ROOT, dirent.name);
    const info = await stat(full).catch(() => null);
    if (info && now - info.mtimeMs > WORKSPACE_TTL_MS) {
      await rm(full, { recursive: true, force: true }).catch(() => {});
      console.log(`[runtime] حذفت مساحة عمل مهجورة: ${dirent.name}`);
    }
  }
}
setInterval(() => {
  reap().catch(() => {});
}, 120_000).unref?.();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[runtime] يعمل على المنفذ ${PORT} — مساحات العمل في ${ROOT}`);
});

