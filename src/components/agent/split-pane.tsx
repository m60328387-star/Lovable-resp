import { useCallback, useEffect, useRef, useState } from "react";

const MIN = 300;
const MAX = 900;

/** عرض قابل للسحب مع حفظ التفضيل محلياً (RTL: اللوحة على اليسار) */
export function useResizablePanel(storageKey: string, initial = 380) {
  const [width, setWidth] = useState(initial);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) setWidth(Math.min(MAX, Math.max(MIN, parsed)));
    }
    setCollapsed(window.localStorage.getItem(`${storageKey}-collapsed`) === "1");
  }, [storageKey]);

  const persist = useCallback(
    (value: number) => {
      if (typeof window !== "undefined") window.localStorage.setItem(storageKey, String(value));
    },
    [storageKey],
  );

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined")
        window.localStorage.setItem(`${storageKey}-collapsed`, next ? "1" : "0");
      return next;
    });
  }, [storageKey]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      setDragging(true);

      const move = (e: PointerEvent) => {
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          // اللوحة على يسار الشاشة في الوضع RTL
          const next = Math.min(MAX, Math.max(MIN, e.clientX));
          setWidth(next);
        });
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setWidth((current) => {
          persist(current);
          return current;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [persist],
  );

  const nudge = useCallback(
    (delta: number) => {
      setWidth((current) => {
        const next = Math.min(MAX, Math.max(MIN, current + delta));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { width, collapsed, dragging, toggle, onPointerDown, nudge };
}

export function ResizeHandle({
  onPointerDown,
  nudge,
  dragging,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  nudge: (delta: number) => void;
  dragging: boolean;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="تغيير عرض لوحة المشروع"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") nudge(-24);
        if (e.key === "ArrowRight") nudge(24);
      }}
      className={
        "group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none lg:block " +
        (dragging ? "bg-primary/60" : "bg-border/60 hover:bg-primary/40")
      }
    >
      <span className="absolute inset-y-0 -inset-x-1.5 block" />
    </div>
  );
}
