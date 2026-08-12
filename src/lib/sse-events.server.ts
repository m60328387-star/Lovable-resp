import { EventEmitter } from "node:events";
import type { AgentEvent } from "./sse-events";

export const projectEvents = new EventEmitter();

// Increase limit to avoid warnings if many clients connect
projectEvents.setMaxListeners(200);

export function broadcastProjectEvent(event: Omit<AgentEvent, "timestamp">) {
  const fullEvent: AgentEvent = {
    ...event,
    timestamp: Date.now(),
  };
  projectEvents.emit(`project:${event.projectId}`, fullEvent);
}

export function createEventStream(projectId: string, signal?: AbortSignal): ReadableStream {
  let listener: ((event: AgentEvent) => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream({
    start(controller) {
      listener = (event: AgentEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(new TextEncoder().encode(data));
        } catch (e) {
          // Stream might be closed
        }
      };

      projectEvents.on(`project:${projectId}`, listener);

      keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch (e) {
          // Stream might be closed
        }
      }, 30000);

      if (signal) {
        signal.addEventListener("abort", () => {
          if (keepalive) clearInterval(keepalive);
          if (listener) projectEvents.off(`project:${projectId}`, listener);
        });
      }
    },
    cancel() {
      if (keepalive) clearInterval(keepalive);
      if (listener) projectEvents.off(`project:${projectId}`, listener);
    }
  });
}
