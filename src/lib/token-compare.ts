import { timingSafeEqual } from "node:crypto";

/**
 * مقارنة ثابتة الزمن للرموز السرّية.
 * المقارنة العادية (===) تخرج عند أول حرف مختلف، ما يسرّب طول البادئة الصحيحة
 * عبر توقيت الاستجابة ويجعل التخمين التدريجي ممكناً.
 */
export function secretEquals(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** يستخرج قيمة رمز Bearer من ترويسة Authorization. */
export function bearerToken(header: string | null): string {
  return (header ?? "").replace(/^Bearer\s+/i, "").trim();
}
