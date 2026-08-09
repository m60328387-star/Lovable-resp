export type GhFile = { path: string; content: string };

export function parseRepo(url: string): { owner: string; repo: string } {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (!match) throw new Error("رابط المستودع غير صالح. الشكل المتوقع: https://github.com/user/repo");
  return { owner: match[1]!, repo: match[2]! };
}

export function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function gh(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "weaver-agent",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

