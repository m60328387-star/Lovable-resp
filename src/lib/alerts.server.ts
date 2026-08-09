/**
 * تنبيهات فورية خارج الواجهة: Telegram و/أو بريد (Resend) عند فشل متغيّرات حرجة.
 * يعتمد جدول alert_state لمنع التكرار (throttling) لكل مفتاح تنبيه.
 */

const THROTTLE_MS = Number(process.env["WEAVER_ALERT_THROTTLE_MS"] ?? 30 * 60 * 1000);

function digestOf(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return String(hash);
}

async function shouldSend(key: string, digest: string): Promise<boolean> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    const rows = await sql`
      SELECT digest, last_sent_at FROM public.alert_state WHERE key = ${key}
    `;
    const row = (rows as unknown as { digest: string; last_sent_at: string }[])[0];
    if (row && row.digest === digest && Date.now() - new Date(row.last_sent_at).getTime() < THROTTLE_MS) {
      return false;
    }
    await sql`
      INSERT INTO public.alert_state (key, digest, last_sent_at, send_count)
      VALUES (${key}, ${digest}, now(), 1)
      ON CONFLICT (key) DO UPDATE
        SET digest = EXCLUDED.digest, last_sent_at = now(), send_count = public.alert_state.send_count + 1
    `;
    return true;
  } catch {
    return true; // بلا قاعدة بيانات: أرسل على أي حال
  }
}

async function sendTelegram(text: string) {
  const token = (process.env["WEAVER_ALERT_TELEGRAM_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"] ?? "").trim();
  const chatId = (process.env["WEAVER_ALERT_TELEGRAM_CHAT_ID"] ?? "").trim();
  if (!token || !chatId) return { channel: "telegram", sent: false, reason: "مفاتيح تيليجرام غير مضبوطة" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return { channel: "telegram", sent: response.ok, reason: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { channel: "telegram", sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function sendEmail(subject: string, text: string) {
  const key = (process.env["RESEND_API_KEY"] ?? "").trim();
  const to = (process.env["WEAVER_ALERT_EMAIL"] ?? "").trim();
  const from = (process.env["WEAVER_ALERT_EMAIL_FROM"] ?? "Weaver <onboarding@resend.dev>").trim();
  if (!key || !to) return { channel: "email", sent: false, reason: "RESEND_API_KEY أو WEAVER_ALERT_EMAIL غير مضبوط" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return { channel: "email", sent: response.ok, reason: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { channel: "email", sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export type AlertResult = {
  dispatched: boolean;
  throttled: boolean;
  channels: { channel: string; sent: boolean; reason: string | null }[];
};

/** يرسل تنبيهاً عبر كل القنوات المضبوطة مع منع التكرار. */
export async function sendAlert(key: string, title: string, lines: string[]): Promise<AlertResult> {
  const body = [`🚨 Weaver — ${title}`, ...lines.map((line) => `• ${line}`), `الوقت: ${new Date().toISOString()}`].join(
    "\n",
  );
  const digest = digestOf(body.replace(/الوقت:.*/g, ""));
  if (!(await shouldSend(key, digest))) {
    return { dispatched: false, throttled: true, channels: [] };
  }
  const channels = await Promise.all([sendTelegram(body), sendEmail(`Weaver — ${title}`, body)]);
  const dispatched = channels.some((c) => c.sent);
  try {
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      kind: "alert",
      name: key,
      ok: dispatched,
      durationMs: 0,
      detail: `${title} | ${channels.map((c) => `${c.channel}:${c.sent ? "ok" : c.reason}`).join(", ")}`,
    });
  } catch {
    /* تجاهل */
  }
  return { dispatched, throttled: false, channels };
}

/** يفحص المتغيّرات الحرجة ويطلق تنبيهاً عند أي نقص. */
export async function alertOnCriticalEnv(extra: string[] = []): Promise<AlertResult | null> {
  const required = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "WEAVER_PASSCODE",
    "WEAVER_WORKER_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
  ];
  const missing = required.filter((name) => !(process.env[name] ?? "").trim());
  const token = (process.env["WEAVER_WORKER_TOKEN"] ?? "").trim();
  const problems = [
    ...missing.map((name) =>
      name.startsWith("SUPABASE")
        ? `${name} مفقود — لن تُحقن VITE_${name} وقت البناء وستفشل الواجهة.`
        : `${name} مفقود.`,
    ),
    ...(token && token.length < 16 ? ["WEAVER_WORKER_TOKEN قصير جداً — العامل الخلفي سيرفض العمل."] : []),
    ...extra,
  ];
  if (problems.length === 0) return null;
  return sendAlert("env_critical", "متغيّرات بيئة حرجة", problems);
}
