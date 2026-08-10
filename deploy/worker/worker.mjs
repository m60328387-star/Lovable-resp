// عامل Weaver الخلفي الدائم:
// يسحب مهام الوكيل من الطابور عبر نقطة /api/public/worker/tick وينفّذها على الخادم،
// فيكمل البناء حتى لو أُغلق المتصفح.

import { writeFileSync } from "node:fs";

const HEARTBEAT = "/tmp/worker-alive";
const beat = () => {
  try {
    writeFileSync(HEARTBEAT, String(Date.now()));
  } catch {
    /* نبضة الحياة لا تُفشل العامل */
  }
};

const API_URL = process.env["WORKER_API_URL"] ?? "http://app:3000";
const TOKEN = process.env["WEAVER_WORKER_TOKEN"];
const IDLE_MS = Number(process.env["WORKER_IDLE_INTERVAL_MS"] ?? 5000);
const BUSY_MS = Number(process.env["WORKER_BUSY_INTERVAL_MS"] ?? 500);
const CONCURRENCY = Number(process.env["WORKER_CONCURRENCY"] ?? 1);
const INTEGRITY_INTERVAL_MS = Number(process.env["MESSAGE_INTEGRITY_INTERVAL_MS"] ?? 900000);

if (!TOKEN || TOKEN.length < 16) {
  console.error("[worker] WEAVER_WORKER_TOKEN is missing or too short.");
  process.exit(1);
}

let backoff = IDLE_MS;

async function tick() {
  const res = await fetch(`${API_URL}/api/public/worker/tick`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function loop(lane) {
  for (;;) {
    try {
      const out = await tick();
      beat();
      backoff = IDLE_MS;
      if (out?.idle) {
        await sleep(IDLE_MS);
      } else {
        console.log(`[worker:${lane}]`, JSON.stringify(out).slice(0, 300));
        await sleep(BUSY_MS);
      }
    } catch (error) {
      console.error(`[worker:${lane}]`, error?.message ?? error);
      backoff = Math.min(backoff * 2, 60_000);
      await sleep(backoff);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyMessageIntegrity() {
  try {
    const res = await fetch(`${API_URL}/api/public/hooks/message-integrity`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    console.log("[worker:message-integrity]", body.slice(0, 500));
  } catch (error) {
    console.error("[worker:message-integrity]", error?.message ?? error);
  }
}

beat();
setInterval(beat, 15_000);
setInterval(() => void verifyMessageIntegrity(), INTEGRITY_INTERVAL_MS);
void verifyMessageIntegrity();
console.log(`[worker] started → ${API_URL} (lanes: ${CONCURRENCY})`);
for (let i = 1; i <= CONCURRENCY; i += 1) loop(i);
