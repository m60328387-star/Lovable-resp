import { useState, useEffect, useRef } from "react";

export type AgentEvent = {
  projectId: string;
  type:
    | "agent:step"
    | "agent:terminal"
    | "agent:file-change"
    | "agent:status"
    | "agent:error"
    | "agent:progress";
  payload: unknown;
  timestamp: number;
};

export function useProjectEvents(projectId: string) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!projectId) return;

    let evtSource: EventSource;

    function connect() {
      evtSource = new EventSource(`/api/events/${projectId}`);

      evtSource.onopen = () => {
        setIsConnected(true);
      };

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as AgentEvent;
          setEvents((prev) => [...prev, data]);
          setLastEvent(data);
        } catch (err) {
          console.error("Failed to parse SSE message", err);
        }
      };

      evtSource.onerror = () => {
        setIsConnected(false);
        evtSource.close();
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      evtSource?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [projectId]);

  return { events, lastEvent, isConnected };
}
