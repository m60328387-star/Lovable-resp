import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Globe, Loader2, Lock, MousePointerClick, Power, RefreshCw } from "lucide-react";
import {
  closeBrowserSession,
  getBrowserFrame,
  openBrowserSession,
  sendBrowserInput,
} from "@/lib/browser.functions";
import { cn } from "@/lib/utils";

/**
 * متصفح حيّ داخل Weaver: يعرض جلسة Chromium الدائمة للمشروع،
 * ويمرّر نقراتك وكتابتك إليها — فتسجّل دخولك بنفسك ثم يكمل الوكيل أمامك.
 */
export function BrowserPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  const [address, setAddress] = useState("https://ads.google.com");
  const [typing, setTyping] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);

  const frame = useQuery({
    queryKey: ["browser-frame", projectId],
    queryFn: () => getBrowserFrame({ data: { projectId } }),
    enabled: live,
    refetchInterval: live ? 1200 : false,
    retry: false,
  });

  useEffect(() => {
    if (frame.error) setLive(false);
  }, [frame.error]);

  const open = useMutation({
    mutationFn: () => openBrowserSession({ data: { projectId, url: address } }),
    onSuccess: () => {
      setLive(true);
      toast.success("جلسة المتصفح جاهزة");
      void qc.invalidateQueries({ queryKey: ["browser-frame", projectId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const close = useMutation({
    mutationFn: () => closeBrowserSession({ data: { projectId } }),
    onSuccess: () => {
      setLive(false);
      toast.success("أُغلقت الجلسة");
    },
  });

  const input = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      sendBrowserInput({ data: { projectId, ...payload } as never }),
    onSuccess: () => void frame.refetch(),
    onError: (err: Error) => toast.error(err.message),
  });

  const onClickFrame = (event: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    const data = frame.data;
    if (!img || !data) return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * data.width);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * data.height);
    input.mutate({ kind: "click", x, y });
  };

  const busy = open.isPending || close.isPending || input.isPending;

  return (
    <div className="flex h-full flex-col gap-3 p-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (live ? close.mutate() : open.mutate())}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
            live
              ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {open.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Power className="size-3.5" />
          )}
          {live ? "إغلاق الجلسة" : "تشغيل المتصفح"}
        </button>

        <div className="flex min-w-[220px] flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (live) input.mutate({ kind: "goto", url: address });
              else open.mutate();
            }}
            placeholder="عنوان الموقع"
            dir="ltr"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>

        <button
          type="button"
          disabled={!live}
          onClick={() => input.mutate({ kind: "back" })}
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="رجوع"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!live}
          onClick={() => input.mutate({ kind: "reload" })}
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="تحديث"
        >
          <RefreshCw className={cn("size-3.5", frame.isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="relative flex-1 overflow-auto rounded-lg border border-border bg-muted/30">
        {!live ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
            <Lock className="size-5" />
            <p className="max-w-sm leading-relaxed">
              شغّل المتصفح لتفتح جلسة دائمة خاصة بهذا المشروع. سجّل دخولك بنفسك هنا — كلمات السر لا
              تُرسل إلى النموذج، والجلسة تبقى محفوظة للجولات القادمة.
            </p>
          </div>
        ) : frame.data ? (
          <img
            ref={imgRef}
            src={frame.data.image}
            alt="جلسة المتصفح الحيّة"
            onClick={onClickFrame}
            className="w-full cursor-crosshair select-none"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> جارٍ التقاط الشاشة…
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <MousePointerClick className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={typing}
          disabled={!live}
          onChange={(e) => setTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !typing) return;
            input.mutate({ kind: "type", text: typing });
            setTyping("");
          }}
          placeholder="اكتب هنا ثم Enter — يُرسَل إلى الحقل المحدَّد في الصفحة"
          className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={!live}
          onClick={() => input.mutate({ kind: "press", key: "Enter" })}
          className="rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Enter
        </button>
        <button
          type="button"
          disabled={!live}
          onClick={() => input.mutate({ kind: "scroll", dy: 600 })}
          className="rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          تمرير ↓
        </button>
      </div>
    </div>
  );
}
