import { createHash, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Session-only owner identity. No Supabase Auth; the passcode is the only gate.
 */
export type WeaverSession = {
  /** Owner identity derived from the configured owner email. */
  owner: {
    id: string;
    email: string;
  };
};

export function hashPassword(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = hashPassword(input);
  const b = hashPassword(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The database stores owner ids in `uuid` columns, so the deterministic id is
 * formatted as a RFC 4122 v5-style UUID derived from the email instead of a
 * raw sha256 hex digest (which Postgres rejects).
 */
export function getOwnerId(email: string): string {
  const hex = createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
  const version = "5";
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    version + hex.slice(13, 16),
    variant + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Cookies flagged `secure` are dropped by browsers on plain HTTP, which would
 * silently break the passcode session before a TLS certificate is installed.
 * Detect the actual request protocol behind the reverse proxy instead.
 */
function isSecureRequest(): boolean {
  try {
    const request = getRequest();
    const proto = request?.headers?.get("x-forwarded-proto");
    if (proto) return proto.split(",")[0]!.trim() === "https";
    if (request?.url) return new URL(request.url).protocol === "https:";
  } catch {
    // No request context (e.g. background jobs) — fall back to the env hint.
  }
  return (process.env["WEAVER_PUBLIC_URL"] ?? "").startsWith("https://");
}

export function getSessionConfig() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET is not set or too short.");
  }
  return {
    password,
    name: "weaver-session",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    cookie: {
      httpOnly: true,
      secure: isSecureRequest(),
      sameSite: "lax" as const,
      path: "/",
    },
  };
}
