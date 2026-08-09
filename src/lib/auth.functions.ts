import { createServerFn } from "@tanstack/react-start";
import { useSession, updateSession, clearSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { getOwnerId, getSessionConfig, passwordMatches } from "./auth.server";

export const checkSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<{
    owner?: { id: string; email: string };
  }>(getSessionConfig());

  if (!session.data?.owner) {
    return { ok: false as const };
  }

  return { ok: true as const, owner: session.data.owner };
});

export const enterWithPasscode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ passcode: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const expected = process.env["WEAVER_PASSCODE"];
    const ownerEmail = process.env["WEAVER_OWNER_EMAIL"];

    if (!expected || !ownerEmail) {
      throw new Error("Owner credentials are not configured.");
    }

    if (!passwordMatches(data.passcode.trim(), expected.trim())) {
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false as const };
    }

    const owner = { id: getOwnerId(ownerEmail), email: ownerEmail };

    await updateSession(getSessionConfig(), { owner });
    return { ok: true as const, owner };
  });

export const exitSession = createServerFn({ method: "POST" }).handler(async () => {
  await clearSession(getSessionConfig());
  return { ok: true as const };
});
