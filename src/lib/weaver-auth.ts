import { createMiddleware } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { getSessionConfig } from "./auth.server";

export const requireWeaverAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await useSession<{
    owner?: { id: string; email: string };
  }>(getSessionConfig());

  if (!session.data?.owner) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const userId = session.data.owner.id;

  // Local Postgres-backed drop-in for the previous Supabase client so
  // existing `context.supabase` call-sites keep working after independence.
  const { getSql } = await import("./db");
  const { makeLocalSupabase } = await import("./local-supabase");
  const supabase = makeLocalSupabase(getSql(), userId);

  return next({
    context: {
      userId,
      owner: session.data.owner,
      supabase,
      claims: { sub: userId, email: session.data.owner.email },
    },
  });
});

/** Backwards-compatible alias used by modules migrated off Supabase Auth. */
export const requireSupabaseAuth = requireWeaverAuth;
