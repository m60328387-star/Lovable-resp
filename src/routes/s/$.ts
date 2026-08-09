import { createFileRoute } from "@tanstack/react-router";
import { serveSite } from "@/lib/serve-site.server";

export const Route = createFileRoute("/s/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        serveSite((params as { _splat?: string })._splat ?? "", request),
    },
  },
});
