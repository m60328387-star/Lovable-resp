// External executor agent for Weaver.
// Polls the central app for queued commands, runs them locally, and returns the output.

const API_URL = process.env["EXECUTOR_API_URL"] ?? "http://localhost:3000";
const TOKEN = process.env["EXECUTOR_TOKEN"];
const WORKDIR = process.env["EXECUTOR_WORKDIR"] ?? "/opt/weaver/work";
const POLL_INTERVAL_MS = Number(process.env["EXECUTOR_POLL_INTERVAL_MS"] ?? 4000);

if (!TOKEN || TOKEN.length < 20) {
  console.error("EXECUTOR_TOKEN is missing or too short.");
  process.exit(1);
}

import { mkdir, writeFile, rm } from "node:fs/promises";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

async function api(path, body) {
  const res = await fetch(`${API_URL}/api/public/executor/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function heartbeat() {
  await api("heartbeat", {
    meta: {
      node: process.version,
      platform: process.platform,
      workdir: WORKDIR,
    },
  });
}

async function writeProjectFiles(files) {
  for (const f of files) {
    const path = join(WORKDIR, f.path.replace(/^\/+/, ""));
    if (path.includes("..")) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, f.content, "utf-8");
  }
}

async function runCommand(command) {
  return new Promise((resolve) => {
    if (!existsSync(WORKDIR)) mkdir(WORKDIR, { recursive: true });
    const child = exec(command, {
      cwd: WORKDIR,
      timeout: 300_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: "production" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      resolve({ output: stdout + stderr, exitCode: code ?? 0 });
    });
    child.on("error", (err) => {
      resolve({ output: String(err), exitCode: 1 });
    });
  });
}

async function collectChangedFiles() {
  // In a real executor we would diff the workdir. For now, return nothing
  // so the agent can read files from the database directly if it needs to.
  return [];
}

async function poll() {
  const { run } = await api("poll", {});
  if (!run) return;

  console.log(`[run ${run.id}] ${run.command}`);
  await writeProjectFiles(run.files ?? []);
  const { output, exitCode } = await runCommand(run.command);
  const files = await collectChangedFiles();

  await api("result", { runId: run.id, output, exitCode, files });
  console.log(`[run ${run.id}] finished with exit code ${exitCode}`);
}

async function main() {
  await heartbeat();
  setInterval(heartbeat, 30_000);

  while (true) {
    try {
      await poll();
    } catch (err) {
      console.error("Poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
