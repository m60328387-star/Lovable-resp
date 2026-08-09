/**
 * وضع Sandbox لتنفيذ الأدوات والروابط: زمن أقصى، حدّ تزامن، سقف حجم للمخرجات،
 * وقاطع دائرة (circuit breaker) يوقف أي أداة تفشل بشكل متكرر بدل تعليق الجلسة.
 */

export type SandboxLimits = {
  timeoutMs: number;
  maxConcurrent: number;
  maxOutputChars: number;
  failureThreshold: number;
  cooldownMs: number;
};

const DEFAULTS: SandboxLimits = {
  timeoutMs: Number(process.env["WEAVER_TOOL_TIMEOUT_MS"] ?? 45_000),
  maxConcurrent: Number(process.env["WEAVER_TOOL_CONCURRENCY"] ?? 4),
  maxOutputChars: Number(process.env["WEAVER_TOOL_MAX_OUTPUT"] ?? 200_000),
  failureThreshold: 4,
  cooldownMs: 60_000,
};

/** حدود أطول للأدوات الثقيلة (بناء، فحص، تنفيذ أوامر). */
const PER_TOOL_TIMEOUT: Record<string, number> = {
  run_command: 120_000,
  run_checks: 90_000,
  fix_errors: 120_000,
  publish_site: 90_000,
  research: 90_000,
  semantic_index: 120_000,
  generate_image: 90_000,
  visual_audit: 90_000,
  deep_think: 90_000,
};

type Breaker = { failures: number; openedAt: number };
const breakers = new Map<string, Breaker>();

let running = 0;
const waiters: Array<() => void> = [];

async function acquire(maxConcurrent: number) {
  if (running < maxConcurrent) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  running += 1;
}

function release() {
  running = Math.max(0, running - 1);
  const next = waiters.shift();
  if (next) next();
}

export class SandboxError extends Error {
  constructor(
    message: string,
    readonly reason: "timeout" | "circuit_open",
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

function truncate(value: unknown, max: number): unknown {
  try {
    const text = JSON.stringify(value);
    if (!text || text.length <= max) return value;
    return {
      ok: true,
      truncated: true,
      note: `المخرجات تجاوزت ${max} محرفاً فاقتُطعت داخل الـ sandbox.`,
      preview: text.slice(0, max),
    };
  } catch {
    return value;
  }
}

/** يفتح/يغلق قاطع الدائرة لاسم أداة. */
export function noteFailure(name: string, limits: SandboxLimits = DEFAULTS) {
  const breaker = breakers.get(name) ?? { failures: 0, openedAt: 0 };
  breaker.failures += 1;
  if (breaker.failures >= limits.failureThreshold) breaker.openedAt = Date.now();
  breakers.set(name, breaker);
}

export function noteSuccess(name: string) {
  breakers.delete(name);
}

export function isCircuitOpen(name: string, limits: SandboxLimits = DEFAULTS) {
  const breaker = breakers.get(name);
  if (!breaker?.openedAt) return false;
  if (Date.now() - breaker.openedAt > limits.cooldownMs) {
    breakers.delete(name);
    return false;
  }
  return true;
}

export function sandboxStatus() {
  return {
    running,
    queued: waiters.length,
    limits: DEFAULTS,
    breakers: Array.from(breakers.entries()).map(([name, b]) => ({
      name,
      failures: b.failures,
      open: b.openedAt > 0 && Date.now() - b.openedAt <= DEFAULTS.cooldownMs,
    })),
  };
}

/**
 * ينفّذ عملية داخل الحدود: انتظار دور، مهلة قصوى، اقتطاع المخرجات، وتحديث قاطع الدائرة.
 * يرمي SandboxError عند المهلة أو عند فتح القاطع.
 */
export async function runInSandbox<T>(
  name: string,
  fn: () => Promise<T>,
  overrides: Partial<SandboxLimits> = {},
): Promise<T> {
  const limits: SandboxLimits = {
    ...DEFAULTS,
    ...(PER_TOOL_TIMEOUT[name] ? { timeoutMs: PER_TOOL_TIMEOUT[name] as number } : {}),
    ...overrides,
  };

  if (isCircuitOpen(name, limits)) {
    throw new SandboxError(
      `الأداة ${name} موقوفة مؤقتاً بعد فشل متكرر — أعد المحاولة بعد دقيقة أو استخدم بديلاً.`,
      "circuit_open",
    );
  }

  await acquire(limits.maxConcurrent);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new SandboxError(
                `تجاوز ${name} المهلة القصوى (${Math.round(limits.timeoutMs / 1000)}s) وأُوقف.`,
                "timeout",
              ),
            ),
          limits.timeoutMs,
        );
      }),
    ]);
    noteSuccess(name);
    return truncate(result, limits.maxOutputChars) as T;
  } catch (error) {
    noteFailure(name, limits);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    release();
  }
}
