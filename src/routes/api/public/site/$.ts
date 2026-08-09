import { createFileRoute } from "@tanstack/react-router";
import { serveSite } from "@/lib/serve-site.server";

export const Route = createFileRoute("/api/public/site/$")({
  server: {
    handlers: {
      GET: async ({ params }) => serveSite((params as { _splat?: string })._splat ?? ""),
    },
  },
});
