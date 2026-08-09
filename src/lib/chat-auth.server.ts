import { useSession } from "@tanstack/react-start/server";
import { getSessionConfig } from "@/lib/auth.server";
import { getSql } from "@/lib/db";
import { makeLocalSupabase } from "@/lib/local-supabase";

export type AuthedContext = {
  supabase: ReturnType<typeof makeLocalSupabase>;
  userId: string;
};

/** يتحقق من جلسة التخويل المحلية (باسكود) ويبني عميل قاعدة بيانات محلي مقيّد بالمستخدم. */
export async function authenticateRequest(_request?: Request): Promise<AuthedContext | null> {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- useSession هنا أداة جلسة من TanStack Start وليست React hook
  const session = await useSession<{ owner?: { id: string; email: string } }>(getSessionConfig());
  const userId = session.data?.owner?.id;
  if (!userId) return null;

  const sql = getSql();
  return { supabase: makeLocalSupabase(sql, userId), userId };
}
