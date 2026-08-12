import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/chat-auth.server";
import { createEventStream } from "@/lib/sse-events.server";

export const Route = createFileRoute("/api/events/$projectId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateRequest(request);
        if (!auth) {
          return new Response("Unauthorized", { status: 401 });
        }

        const stream = createEventStream(params.projectId, request.signal);

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
