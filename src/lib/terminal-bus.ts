import { useSyncExternalStore } from "react";

export type TerminalEvent = {
  id: string;
  at: number;
  tool: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "error";
};

const MAX_EVENTS = 400;

let events: TerminalEvent[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** يسجّل أو يحدّث حدث أداة في الطرفية الحيّة (نفس المعرّف يُحدَّث بدل التكرار). */
export function pushTerminalEvent(event: TerminalEvent) {
  const index = events.findIndex((item) => item.id === event.id);
  if (index >= 0) {
    const existing = events[index]!;
    if (
      existing.status === event.status &&
      existing.detail === event.detail &&
      existing.label === event.label
    ) {
      return;
    }
    events = [...events.slice(0, index), { ...existing, ...event }, ...events.slice(index + 1)];
  } else {
    events = [...events, event].slice(-MAX_EVENTS);
  }
  emit();
}

export function clearTerminal() {
  events = [];
  emit();
}

const EMPTY: TerminalEvent[] = [];

export function useTerminalEvents(): TerminalEvent[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => events,
    () => EMPTY,
  );
}
