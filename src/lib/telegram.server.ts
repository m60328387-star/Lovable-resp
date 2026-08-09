/** تكامل تيليغرام: استدعاء Bot API مباشرة بتوكن البوت المخزّن لكل مشروع. */

const API = "https://api.telegram.org";

async function call(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram ${method} فشل [${response.status}]: ${data.description ?? "خطأ غير معروف"}`,
    );
  }
  return data.result;
}

export function tgGetMe(token: string) {
  return call(token, "getMe", {}) as Promise<{
    id: number;
    username?: string;
    first_name?: string;
  }>;
}

export function tgSetWebhook(token: string, url: string, secret: string) {
  return call(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: true,
  });
}

export function tgWebhookInfo(token: string) {
  return call(token, "getWebhookInfo", {}) as Promise<Record<string, unknown>>;
}

export function tgSendMessage(token: string, chatId: number | string, text: string) {
  return call(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

export function tgSendChatAction(token: string, chatId: number | string) {
  return call(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => null);
}

/** سرّ الـWebhook مشتق من التوكن حتى لا نحتاج تخزيناً إضافياً. */
export async function webhookSecret(token: string) {
  const bytes = new TextEncoder().encode(`weaver-tg:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 48);
}
