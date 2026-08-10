import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, ScanEye, Square, TerminalSquare, Trash2 } from "lucide-react";
import {
  getRuntimeLogs,
  getRuntimeStatus,
  runRuntimeBrowserCheck,
  runRuntimeCommand,
  startRuntimeDev,
  stopRuntimeDev,
  syncRuntimeWorkspace,
} from "@/lib/runtime.functions";
import { cn } from "@/lib/utils";

type Line = { id: number; text: string; kind: "cmd" | "out" | "err" };

let lineId = 0;

/** لوحة بيئة التنفيذ: طرفية حقيقية + خادم تطوير + معاينة حيّة. */
export function RuntimePanel({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [command, setCommand] = useState("npm install");
  const [previewKey, setPreviewKey] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: ["runtime-status", projectId],
    queryFn: () => getRuntimeStatus({ data: { projectId } }),
    refetchInterval: 8000,
  });

  const available = status.data?.available === true;
  const dev = status.data?.dev as
    { running?: boolean; ready?: boolean; mode?: string; port?: number } | undefined;
  const previewSrc = useMemo(
    () => `/api/public/rt/${projectId}/?k=${previewKey}`,
    [projectId, previewKey],
  );

  const append = (text: string, kind: Line["kind"] = "out") => {
    lineId += 1;
    setLines((prev) => [...prev.slice(-600), { id: lineId, text, kind }]);
  };

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines]);

  const logs = useQuery({
    queryKey: ["runtime-logs", projectId],
    queryFn: () => getRuntimeLogs({ data: { projectId, limit: 200 } }),
    refetchInterval: dev?.running ? 4000 : false,
    enabled: available && Boolean(dev?.running),
  });

  const exec = useMutation({
    mutationFn: (value: string) => runRuntimeCommand({ data: { projectId, command: value } }),
    onMutate: (value) => append(`$ ${value}`, "cmd"),
    onSuccess: (result) => {
      append(result.output || "(بدون مخرجات)", result.ok ? "out" : "err");
      append(
        `↳ رمز الخروج ${result.exitCode} — ${(result.durationMs / 1000).toFixed(1)}s`,
        result.ok ? "out" : "err",
      );
    },
    onError: (err: Error) => append(err.message, "err"),
  });

  const start = useMutation({
    mutationFn: () => startRuntimeDev({ data: { projectId } }),
    onMutate: () => append("$ تشغيل خادم التطوير…", "cmd"),
    onSuccess: (result) => {
      append(
        result.ready
          ? `خادم التطوير يعمل (${result.mode}${result.port ? ` على المنفذ ${result.port}` : ""}).`
          : "لم يجهز خادم التطوير — راجع السجل أدناه.",
        result.ready ? "out" : "err",
      );
      for (const line of result.logs ?? []) append(line, "out");
      setPreviewKey((k) => k + 1);
      void status.refetch();
    },
    onError: (err: Error) => append(err.message, "err"),
  });

  const stop = useMutation({
    mutationFn: () => stopRuntimeDev({ data: { projectId } }),
    onSuccess: () => {
      append("تم إيقاف خادم التطوير.", "out");
      void status.refetch();
    },
  });

  const sync = useMutation({
    mutationFn: () => syncRuntimeWorkspace({ data: { projectId } }),
    onSuccess: (result) => {
      append(`تمت مزامنة ${result.synced} ملفاً إلى مساحة العمل.`, "out");
      setPreviewKey((k) => k + 1);
      toast.success("تمت مزامنة الملفات مع بيئة التنفيذ");
    },
    onError: (err: Error) => append(err.message, "err"),
  });

  const checkBrowser = useMutation({
    mutationFn: () => runRuntimeBrowserCheck({ data: { projectId } }),
    onMutate: () => append("$ فحص المتصفح الحقيقي…", "cmd"),
    onSuccess: (result) => {
      if (result.ok) {
        append("فحص المتصفح نظيف — لا أخطاء كونسول أو شبكة أو وصولية.", "out");
        toast.success("فحص المتصفح نجح");
      } else {
        for (const err of result.errors.slice(0, 20)) append(`✗ ${err}`, "err");
        toast.error(`${result.errors.length} خطأ في المتصفح`);
      }
      for (const warn of (result.warnings ?? []).slice(0, 10)) append(`! ${warn}`, "out");
    },
    onError: (err: Error) => append(err.message, "err"),
  });

  if (status.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> جارٍ فحص بيئة التنفيذ…
      </div>
    );
  }

  if (!available) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        بيئة التنفيذ غير مفعّلة على هذه النسخة. شغّل حاوية <code dir="ltr">runtime</code> على خادمك
        عبر <code dir="ltr">deploy/deploy.sh</code> لتحصل على طرفية حقيقية ومعاينة حيّة.
        {!runtimeConfigured() && (
          <div className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">
            <strong>ملاحظة:</strong> EXECUTOR_TOKEN غير مهيأ أو قصير جداً. تحقق من ملف deploy/.env
            وتأكد من وجود رمز أمان بطول 32 حرفاً على الأقل.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => start.mutate()}
          disabled={start.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {start.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          تشغيل خادم التطوير
        </button>
        <button
          type="button"
          onClick={() => stop.mutate()}
          disabled={stop.isPending || !dev?.running}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <Square className="size-3.5" /> إيقاف
        </button>
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} /> مزامنة الملفات
        </button>
        <button
          type="button"
          onClick={() => exec.mutate("npm install")}
          disabled={exec.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          تثبيت الحزم
        </button>
        <button
          type="button"
          onClick={() => checkBrowser.mutate()}
          disabled={checkBrowser.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {checkBrowser.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ScanEye className="size-3.5" />
          )}
          فحص المتصفح
        </button>
        <span className="ms-auto text-[11px] text-muted-foreground">
          {dev?.running ? `يعمل • ${dev.mode ?? ""} ${dev.port ? `:${dev.port}` : ""}` : "متوقف"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-[11px]">
          <span>المعاينة الحيّة</span>
          <button
            type="button"
            onClick={() => setPreviewKey((k) => k + 1)}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="size-3" /> تحديث
          </button>
        </div>
        <iframe
          key={previewSrc}
          src={previewSrc}
          title="المعاينة الحيّة"
          className="h-[420px] w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!command.trim() || exec.isPending) return;
          exec.mutate(command.trim());
        }}
        className="flex items-center gap-2"
      >
        <TerminalSquare className="size-4 text-muted-foreground" />
        <input
          dir="ltr"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="npm run build"
          className="flex-1 rounded-md border bg-background px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={exec.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {exec.isPending ? "جارٍ التنفيذ…" : "تنفيذ"}
        </button>
        <button
          type="button"
          onClick={() => setLines([])}
          className="rounded-md border p-1.5 text-muted-foreground"
          aria-label="مسح الطرفية"
        >
          <Trash2 className="size-3.5" />
        </button>
      </form>

      <div
        ref={outputRef}
        dir="ltr"
        className="h-64 overflow-auto rounded-lg bg-foreground/95 p-3 font-mono text-[11px] leading-relaxed text-background"
      >
        {lines.length === 0 && <p className="opacity-60">الطرفية جاهزة — نفّذ أمراً للبدء.</p>}
        {lines.map((line) => (
          <pre
            key={line.id}
            className={cn(
              "whitespace-pre-wrap",
              line.kind === "cmd" && "text-primary",
              line.kind === "err" && "text-red-400",
            )}
          >
            {line.text}
          </pre>
        ))}
        {(logs.data?.logs ?? []).map((line, index) => (
          <pre key={`log-${index}`} className="whitespace-pre-wrap opacity-80">
            {line}
          </pre>
        ))}
      </div>
    </div>
  );
}
