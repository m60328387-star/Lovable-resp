import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const result = await checkSession();
    if (!result.ok || !result.owner) throw redirect({ to: "/auth" });
    return { user: result.owner };
  },
  component: () => <Outlet />,
});
