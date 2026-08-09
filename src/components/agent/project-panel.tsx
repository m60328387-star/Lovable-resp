import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CheckCircle2,
  CircleDashed,
  FileCode2,
  History,
  KeyRound,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Download,
  ExternalLink,
  GitBranch,
  Play,
  Rocket,
  Terminal,
  Trash2,
  Upload,
  TriangleAlert,
  Users,
  XCircle,
} from "lucide-react";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { buildPreviewDocument } from "@/lib/preview";
import { pushWorkspaceToGithub } from "@/lib/github.functions";
import { importWorkspaceFiles } from "@/lib/import.functions";
import { getConversation, getWorkspace } from "@/lib/projects.functions";
import { getPublishState, publishProject } from "@/lib/publish.functions";
import { getUsage } from "@/lib/usage.functions";
import { getSiteAnalytics } from "@/lib/analytics.functions";
import { listFileVersions, restoreFileVersion } from "@/lib/files.functions";
import {
  createCheckpoint,
  deleteCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from "@/lib/checkpoints.functions";

import {
  deleteProjectSecret,
  listProjectSecrets,
  setProjectSecret,
} from "@/lib/project-secrets.functions";
import { formatUsd } from "@/lib/pricing";

import { clearTerminal, useTerminalEvents, type TerminalEvent } from "@/lib/terminal-bus";
import { cn } from "@/lib/utils";
import { RuntimePanel } from "@/components/agent/runtime-panel";

type PreviewDevice = "desktop" | "tablet" | "mobile";

const PREVIEW_DEVICES: { id: PreviewDevice; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "سطح المكتب", icon: Monitor },
  { id: "tablet", label: "لوحي", icon: Tablet },
  { id: "mobile", label: "جوال", icon: Smartphone },
];

const PREVIEW_WIDTHS: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "820px",
  mobile: "390px",
};

type Tab =
  | "spec"
  | "tasks"
  | "files"
  | "preview"
  | "runtime"
  | "terminal"
  | "runs"
  | "checkpoints"
  | "usage"
  | "visitors"
  | "secrets";

const TABS: { id: Tab; label: string }[] = [
  { id: "spec", label: "المواصفات" },
  { id: "tasks", label: "المهام" },
  { id: "files", label: "الملفات" },
  { id: "preview", label: "المعاينة" },
  { id: "runtime", label: "بيئة التنفيذ" },
  { id: "terminal", label: "الطرفية" },
  { id: "runs", label: "السجل" },
  { id: "checkpoints", label: "الاسترجاع" },
  { id: "usage", label: "الاستهلاك" },
  { id: "visitors", label: "الزوار" },
  { id: "secrets", label: "المفاتيح" },
];

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  done: { icon: CheckCircle2, className: "text-primary" },
  running: { icon: Loader2, className: "text-primary animate-spin" },
  failed: { icon: XCircle, className: "text-destructive" },
  blocked: { icon: TriangleAlert, className: "text-amber-600" },
  pending: { icon: CircleDashed, className: "text-muted-foreground" },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ProjectPanel({
  projectId,
  refreshKey,
  live = false,
}: {
  projectId: string;
  refreshKey: number;
  live?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("tasks");
  const terminalEvents = useTerminalEvents();

  const [openFile, setOpenFile] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [previewDevice, setDevice] = useState<PreviewDevice>("desktop");
  const [previewKey, setPreviewKey] = useState(0);

  const conversation = useQuery({
    queryKey: ["conversation", projectId, refreshKey],
    queryFn: () => getConversation({ data: { projectId } }),
    ...(live ? { refetchInterval: 4000 } : {}),
  });
  const workspace = useQuery({
    queryKey: ["workspace", projectId, refreshKey],
    queryFn: () => getWorkspace({ data: { projectId } }),
    ...(live ? { refetchInterval: 3000 } : {}),
  });
  const usage = useQuery({
    queryKey: ["usage", projectId, refreshKey],
    queryFn: () => getUsage({ data: { projectId } }),
    enabled: tab === "usage",
  });
  const analytics = useQuery({
    queryKey: ["analytics", projectId, refreshKey],
    queryFn: () => getSiteAnalytics({ data: { projectId } }),
    enabled: tab === "visitors",
  });
  const secrets = useQuery({
    queryKey: ["project-secrets", projectId],
    queryFn: () => listProjectSecrets({ data: { projectId } }),
    enabled: tab === "secrets",
  });
  const checkpoints = useQuery({
    queryKey: ["checkpoints", projectId, refreshKey],
    queryFn: () => listCheckpoints({ data: { projectId } }),
    enabled: tab === "checkpoints",
  });

  const versions = useQuery({
    queryKey: ["file-versions", projectId, historyFor],
    queryFn: () => listFileVersions({ data: { projectId, path: historyFor as string } }),
    enabled: Boolean(historyFor),
  });

  const spec = conversation.data?.spec as Record<string, unknown> | null | undefined;
  const tasks = conversation.data?.tasks ?? [];
  const files = workspace.data?.files ?? [];
  const runs = workspace.data?.runs ?? [];

  const previewDoc = buildPreviewDocument(files);

  // فتح تبويب المعاينة تلقائياً أول مرة تصبح فيها معاينة متاحة
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !previewDoc) return;
    autoOpened.current = true;
    setTab("preview");
  }, [previewDoc]);

  const restore = async (versionId: string) => {
    if (!historyFor) return;
    try {
      const result = await restoreFileVersion({
        data: { projectId, path: historyFor, versionId },
      });
      toast.success(`تمت الاستعادة إلى الإصدار v${result.restoredFrom}`);
      await workspace.refetch();
      await versions.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشلت الاستعادة");
    }
  };

  const downloadZip = () => {
    if (files.length === 0) return;
    const entries: Record<string, Uint8Array> = {};
    for (const file of files) entries[file.path] = strToU8(file.content);
    const blob = new Blob([zipSync(entries) as unknown as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "weaver-workspace.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  const zipInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [replaceOnImport, setReplaceOnImport] = useState(false);

  const importZip = async (file: File) => {
    setImporting(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const entries = unzipSync(buffer);
      const payload: { path: string; content: string }[] = [];
      let skipped = 0;
      const names = Object.keys(entries);
      const roots = new Set(names.map((n) => n.split("/")[0] ?? ""));
      const strip = roots.size === 1 && names.every((n) => n.includes("/"));

      for (const [rawName, bytes] of Object.entries(entries)) {
        if (rawName.endsWith("/")) continue;
        let name = strip ? rawName.slice(rawName.indexOf("/") + 1) : rawName;
        name = name.replace(/^\/+/, "");
        if (!name) continue;
        if (/(^|\/)(node_modules|\.git|__MACOSX|\.DS_Store)(\/|$)/.test(name)) continue;
        const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
        const imageType: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
        };
        if (imageType[ext]) {
          if (bytes.length > 900_000) {
            skipped++;
            continue;
          }
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          payload.push({ path: name, content: `data:${imageType[ext]};base64,${btoa(binary)}` });
          continue;
        }
        if (bytes.length > 1_200_000) {
          skipped++;
          continue;
        }
        const text = strFromU8(bytes);
        if (text.includes("\u0000")) {
          skipped++;
          continue;
        }
        payload.push({ path: name, content: text });
      }

      if (payload.length === 0) throw new Error("لم يُعثر على ملفات قابلة للاستيراد داخل الأرشيف");
      if (payload.length > 400) throw new Error("الأرشيف يحتوي أكثر من 400 ملف — قسّمه أولاً");

      const result = await importWorkspaceFiles({
        data: {
          projectId,
          files: payload,
          mode: replaceOnImport ? "replace" : "merge",
        },
      });
      await workspace.refetch();
      setTab("files");
      toast.success(
        `تم الاستيراد: ${result.created} جديد و${result.updated} محدّث${skipped ? ` (تخطّي ${skipped})` : ""} — ${result.report.ok ? "الفحص نجح" : `${result.report.errors} خطأ و${result.report.warnings} تحذير`}`,
      );
      if (!result.report.ok) {
        toast.message("اطلب من Weaver: «أصلح مشاكل المشروع المستورد» ليعالجها تلقائياً.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل استيراد الأرشيف");
    } finally {
      setImporting(false);
    }
  };

  const [pushing, setPushing] = useState(false);

  const pushToGithub = async () => {
    setPushing(true);
    try {
      const result = await pushWorkspaceToGithub({ data: { projectId } });
      toast.success(`تم الرفع إلى ${result.repo} (${result.branch}) — ${result.count} ملف`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الرفع إلى GitHub");
    } finally {
      setPushing(false);
    }
  };

  const [publishing, setPublishing] = useState(false);
  const publishState = useQuery({
    queryKey: ["publish-state", projectId, refreshKey],
    queryFn: () => getPublishState({ data: { projectId } }),
  });
  const liveUrl =
    publishState.data?.published && publishState.data.slug ? `/s/${publishState.data.slug}` : null;

  const publish = async () => {
    setPublishing(true);
    try {
      const result = await publishProject({ data: { projectId } });
      await publishState.refetch();
      toast.success(`تم النشر: ${result.url}`);
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل النشر");
    } finally {
      setPublishing(false);
    }
  };

  const openPreviewWindow = () => {
    if (!previewDoc) return;
    const blob = new Blob([previewDoc], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  };

  const counts: Record<Tab, number> = {
    spec: spec ? 1 : 0,
    preview: previewDoc ? 1 : 0,
    tasks: tasks.length,
    files: files.length,
    runs: runs.length,
    terminal: terminalEvents.length,
    runtime: 0,
    checkpoints: checkpoints.data?.length ?? 0,

    usage: 0,
    visitors: analytics.data?.total ?? 0,
    secrets: secrets.data?.length ?? 0,
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-s bg-sidebar">
      <div className="flex flex-wrap gap-1 border-b px-2 py-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-colors",
              tab === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            {item.label}
            {counts[item.id] > 0 && (
              <span className="ms-1 font-mono text-[10px] opacity-70">{counts[item.id]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "spec" &&
          (spec ? <SpecView spec={spec} /> : <Empty label="لم تُكتب المواصفات بعد." />)}

        {tab === "tasks" &&
          (tasks.length === 0 ? (
            <Empty label="لا يوجد رسم مهام بعد." />
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => {
                const style = STATUS_STYLE[task.status] ?? STATUS_STYLE["pending"]!;
                const Icon = style.icon;
                return (
                  <li key={task.task_key} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start gap-2">
                      <Icon className={cn("mt-0.5 size-3.5 shrink-0", style.className)} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-snug">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {task.task_key}
                          </span>{" "}
                          {task.title}
                        </p>
                        {task.acceptance && (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {task.acceptance}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Chip>{task.layer}</Chip>
                          {task.depends_on.map((dep) => (
                            <Chip key={dep}>↳ {dep}</Chip>
                          ))}
                          {task.verification.map((v) => (
                            <Chip key={v}>{v}</Chip>
                          ))}
                        </div>
                        {task.note && (
                          <p className="mt-2 rounded-md bg-surface px-2 py-1 text-[11px] text-muted-foreground">
                            {task.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === "files" && (
          <div className="mb-2 flex items-center gap-2">
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importZip(file);
              }}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => zipInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold hover:bg-surface disabled:opacity-60"
            >
              <Upload className="size-3" />
              {importing ? "يستورد…" : "استيراد ZIP"}
            </button>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={replaceOnImport}
                onChange={(e) => setReplaceOnImport(e.target.checked)}
                className="size-3"
              />
              استبدال مساحة العمل
            </label>
          </div>
        )}

        {tab === "files" &&
          (files.length === 0 ? (
            <Empty label="مساحة العمل فارغة — لم يكتب الوكيل ملفات بعد." />
          ) : (
            <ul className="space-y-1">
              {files.map((file) => (
                <li key={file.path} className="rounded-lg border bg-card">
                  <div className="flex items-center gap-1 px-1">
                    <button
                      type="button"
                      onClick={() => setOpenFile(openFile === file.path ? null : file.path)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-start"
                    >
                      <FileCode2 className="size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" dir="ltr">
                        {file.path}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        v{file.version} · {formatBytes(file.bytes)}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="سجل الإصدارات"
                      onClick={() => setHistoryFor(historyFor === file.path ? null : file.path)}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md hover:bg-surface",
                        historyFor === file.path ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      <History className="size-3.5" />
                    </button>
                  </div>
                  {historyFor === file.path && (
                    <div className="border-t bg-surface/60 px-3 py-2">
                      {versions.isLoading ? (
                        <p className="text-[11px] text-muted-foreground">يحمّل…</p>
                      ) : (versions.data ?? []).length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">لا توجد إصدارات سابقة.</p>
                      ) : (
                        <ul className="space-y-1">
                          {(versions.data ?? []).map((version) => (
                            <li key={version.id} className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                v{version.version} · {formatBytes(version.bytes)} ·{" "}
                                {new Date(version.createdAt).toLocaleString("ar")}
                              </span>
                              <button
                                type="button"
                                onClick={() => void restore(version.id)}
                                className="ms-auto rounded-md border bg-card px-2 py-0.5 text-[10px] font-semibold hover:bg-surface"
                              >
                                استعادة
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {openFile === file.path &&
                    (file.content.startsWith("data:image/") ? (
                      <div className="border-t bg-surface p-3">
                        <img
                          src={file.content}
                          alt={file.path}
                          className="mx-auto max-h-72 rounded-lg"
                        />
                      </div>
                    ) : (
                      <pre
                        dir="ltr"
                        className="max-h-72 overflow-auto border-t bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed"
                      >
                        {file.content}
                      </pre>
                    ))}
                </li>
              ))}
            </ul>
          ))}

        {tab === "preview" &&
          (previewDoc ? (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPreviewWindow}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold hover:bg-surface"
                >
                  <ExternalLink className="size-3" />
                  فتح في نافذة
                </button>
                <button
                  type="button"
                  onClick={downloadZip}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold hover:bg-surface"
                >
                  <Download className="size-3" />
                  تنزيل ZIP
                </button>
                <button
                  type="button"
                  onClick={() => void pushToGithub()}
                  disabled={pushing}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold hover:bg-surface disabled:opacity-60"
                >
                  <GitBranch className="size-3" />
                  {pushing ? "يرفع…" : "رفع إلى GitHub"}
                </button>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={publishing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  <Rocket className="size-3" />
                  {publishing ? "ينشر…" : liveUrl ? "إعادة النشر" : "نشر الموقع"}
                </button>
                {liveUrl && (
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-surface"
                  >
                    <ExternalLink className="size-3" />
                    الرابط المباشر
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1">
                {PREVIEW_DEVICES.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => setDevice(device.id)}
                    aria-label={device.label}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold",
                      previewDevice === device.id
                        ? "border-primary/50 bg-accent text-accent-foreground"
                        : "bg-card hover:bg-surface",
                    )}
                  >
                    <device.icon className="size-3" />
                    {device.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPreviewKey((key) => key + 1)}
                  className="ms-auto inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold hover:bg-surface"
                >
                  <RefreshCw className="size-3" />
                  إعادة تحميل
                </button>
              </div>

              <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-lg border bg-surface p-2">
                <iframe
                  key={previewKey}
                  title="معاينة المشروع"
                  srcDoc={previewDoc}
                  sandbox="allow-scripts allow-forms allow-popups"
                  style={{ width: PREVIEW_WIDTHS[previewDevice] }}
                  className="min-h-[420px] w-full max-w-full flex-1 rounded-md border bg-white shadow-soft"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-surface p-4 text-[12px] text-muted-foreground">
              {files.length === 0 ? (
                <p>لا توجد ملفات بعد. اطلب من الوكيل بناء الموقع لتظهر المعاينة الحية هنا.</p>
              ) : (
                <>
                  <p className="mb-2 font-semibold text-foreground">
                    لا توجد صفحة HTML قابلة للعرض في مساحة العمل.
                  </p>
                  <p className="mb-2">
                    المعاينة تحتاج ملف <code dir="ltr">index.html</code> (أو أي ملف .html، أو ناتج
                    بناء في <code dir="ltr">dist/</code>). الملفات الحالية:
                  </p>
                  <ul className="space-y-1 font-mono text-[11px]" dir="ltr">
                    {files.slice(0, 12).map((f) => (
                      <li key={f.path}>{f.path}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}

        {tab === "terminal" && <TerminalView events={terminalEvents} />}

        {tab === "runtime" && <RuntimePanel projectId={projectId} />}

        {tab === "runs" &&
          (runs.length === 0 ? (
            <Empty label="لا توجد أوامر مسجّلة بعد." />
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => {
                const input = run.input as { command?: string; reason?: string } | null;
                return (
                  <li key={run.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2">
                      {run.status === "no_executor" ? (
                        <TriangleAlert className="size-3.5 text-amber-600" />
                      ) : (
                        <Terminal className="size-3.5 text-primary" />
                      )}
                      <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {input?.command ?? run.kind}
                      </code>
                      <Chip>{run.status === "no_executor" ? "بانتظار منفّذ" : run.status}</Chip>
                    </div>
                    {run.output && run.kind === "check" && <CheckOutput output={run.output} />}
                    {input?.reason && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {input.reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === "checkpoints" && (
          <CheckpointsView
            projectId={projectId}
            items={checkpoints.data ?? []}
            loading={checkpoints.isLoading}
            onChanged={() => {
              void checkpoints.refetch();
              void workspace.refetch();
              setPreviewKey((key) => key + 1);
            }}
          />
        )}

        {tab === "usage" && <UsageView data={usage.data} loading={usage.isLoading} />}

        {tab === "visitors" && (
          <VisitorsView data={analytics.data} loading={analytics.isLoading} liveUrl={liveUrl} />
        )}

        {tab === "secrets" && (
          <SecretsView
            projectId={projectId}
            items={secrets.data ?? []}
            loading={secrets.isLoading}
            onChanged={() => void secrets.refetch()}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <Play className="size-3" />
        الفحص الآلي يعمل داخل المنصة؛ أوامر npm/git تحتاج منفّذاً خارجياً.
      </div>
    </div>
  );
}

function CheckOutput({ output }: { output: string }) {
  let report: {
    ok?: boolean;
    summary?: string;
    issues?: { path: string; severity: string; message: string; line?: number }[];
  } | null = null;
  try {
    report = JSON.parse(output);
  } catch {
    return null;
  }
  if (!report) return null;

  return (
    <div className="mt-2 space-y-1">
      <p
        className={cn("text-[11px] font-semibold", report.ok ? "text-primary" : "text-destructive")}
      >
        {report.summary}
      </p>
      {(report.issues ?? []).slice(0, 8).map((issue, i) => (
        <p key={i} className="rounded-md bg-surface px-2 py-1 text-[11px] leading-relaxed">
          <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">
            {issue.path}
            {issue.line ? `:${issue.line}` : ""}
          </span>{" "}
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed bg-surface/60 px-3 py-6 text-center text-[12px] text-muted-foreground">
      {label}
    </p>
  );
}

function SpecView({ spec }: { spec: Record<string, unknown> }) {
  const sections: [string, string][] = [
    ["objective", "الهدف"],
    ["users", "المستخدمون"],
    ["functional", "متطلبات وظيفية"],
    ["nonFunctional", "متطلبات غير وظيفية"],
    ["architecture", "المعمارية"],
    ["risks", "المخاطر"],
    ["acceptance", "معايير القبول"],
    ["openQuestions", "أسئلة مفتوحة"],
  ];

  return (
    <div className="space-y-3">
      {typeof spec["title"] === "string" && (
        <h3 className="text-[14px] font-bold">{spec["title"]}</h3>
      )}
      {sections.map(([key, label]) => {
        const value = spec[key];
        if (!value || (Array.isArray(value) && value.length === 0)) return null;
        return (
          <div key={key} className="rounded-lg border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {Array.isArray(value) ? (
              <ul className="mt-1.5 space-y-1">
                {(value as unknown[]).map((item, i) => (
                  <li key={i} className="text-[12px] leading-relaxed">
                    • {String(item)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12px] leading-relaxed">{String(value)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

type UsageData = {
  project: { tokens: number; cost: number; calls: number };
  account: { tokens: number; cost: number };
  byModel: { model: string; tokens: number; cost: number; calls: number }[];
  events: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    createdAt: string;
  }[];
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-[15px] font-bold">{value}</p>
    </div>
  );
}

type CheckpointRow = {
  id: string;
  label: string;
  file_count: number;
  created_at: string;
};

function CheckpointsView({
  projectId,
  items,
  loading,
  onChanged,
}: {
  projectId: string;
  items: CheckpointRow[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const save = async () => {
    setBusy("new");
    try {
      const result = await createCheckpoint({ data: { projectId, label: "نقطة يدوية" } });
      if (result.ok) toast.success(`تم حفظ نقطة استرجاع (${result.fileCount} ملف)`);
      else toast.error(result.error ?? "تعذّر الحفظ");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر الحفظ");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (checkpointId: string) => {
    if (!window.confirm("سيتم استبدال ملفات المشروع الحالية بمحتوى هذه النقطة. متابعة؟")) return;
    setBusy(checkpointId);
    try {
      const result = await restoreCheckpoint({ data: { projectId, checkpointId } });
      if (result.ok) toast.success(`تم استرجاع ${result.restored} ملف`);
      else toast.error(result.error ?? "تعذّر الاسترجاع");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر الاسترجاع");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (checkpointId: string) => {
    setBusy(checkpointId);
    try {
      await deleteCheckpoint({ data: { checkpointId } });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          تُحفظ نقطة تلقائياً قبل كل رسالة، فيمكنك التراجع عن جولة كاملة بضغطة واحدة.
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy === "new"}
          className="shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] hover:bg-accent disabled:opacity-50"
        >
          حفظ نقطة الآن
        </button>
      </div>

      {loading && <p className="text-xs text-muted-foreground">جارٍ التحميل…</p>}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">لا توجد نقاط استرجاع بعد.</p>
      )}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border bg-background p-2.5">
            <p className="truncate text-xs font-medium">{item.label || "بدون وصف"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {item.file_count} ملف · {new Date(item.created_at).toLocaleString("ar")}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void restore(item.id)}
                disabled={busy === item.id}
                className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
              >
                استرجاع
              </button>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                disabled={busy === item.id}
                className="rounded-md border px-2 py-1 text-[11px] text-destructive hover:bg-accent disabled:opacity-50"
              >
                حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsageView({ data, loading }: { data: UsageData | undefined; loading: boolean }) {
  if (loading) return <Empty label="يحسب الاستهلاك…" />;
  if (!data || data.project.calls === 0)
    return <Empty label="لا يوجد استهلاك مسجّل لهذا المشروع بعد." />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="توكنات المشروع" value={data.project.tokens.toLocaleString("en")} />
        <Stat label="تكلفة المشروع" value={formatUsd(data.project.cost)} />
        <Stat label="عدد الطلبات" value={String(data.project.calls)} />
        <Stat label="تكلفة الحساب كاملاً" value={formatUsd(data.account.cost)} />
      </div>

      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <BarChart3 className="size-3" /> حسب النموذج
        </p>
        <ul className="space-y-1">
          {data.byModel.map((row) => (
            <li key={row.model} className="flex items-center gap-2 text-[11px]">
              <code dir="ltr" className="min-w-0 flex-1 truncate font-mono">
                {row.model}
              </code>
              <span className="font-mono text-muted-foreground">
                {row.tokens.toLocaleString("en")}
              </span>
              <span className="font-mono font-semibold">{formatUsd(row.cost)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">آخر الطلبات</p>
        <ul className="space-y-1">
          {data.events.map((event, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-[10px] text-muted-foreground">
                {new Date(event.createdAt).toLocaleTimeString("ar")}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px]" dir="ltr">
                {event.inputTokens}→{event.outputTokens}
              </span>
              <span className="font-mono">{formatUsd(event.cost)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        التكلفة تقديرية حسب أسعار OpenRouter المعلنة لكل نموذج.
      </p>
    </div>
  );
}

type AnalyticsData = {
  total: number;
  today: number;
  pages: { key: string; count: number }[];
  referrers: { key: string; count: number }[];
  days: { day: string; count: number }[];
};

function VisitorsView({
  data,
  loading,
  liveUrl,
}: {
  data: AnalyticsData | undefined;
  loading: boolean;
  liveUrl: string | null;
}) {
  if (loading) return <Empty label="يحمّل التحليلات…" />;
  if (!liveUrl) return <Empty label="انشر الموقع أولاً لتبدأ تحليلات الزوار." />;
  if (!data || data.total === 0) return <Empty label="لا توجد زيارات مسجّلة بعد." />;

  const max = Math.max(...data.days.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="زيارات 30 يومًا" value={data.total.toLocaleString("en")} />
        <Stat label="زيارات اليوم" value={data.today.toLocaleString("en")} />
      </div>

      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Users className="size-3" /> آخر 14 يومًا
        </p>
        <div className="flex h-24 items-end gap-1">
          {data.days.map((day) => (
            <div
              key={day.day}
              title={`${day.day}: ${day.count}`}
              style={{ height: `${Math.max(6, (day.count / max) * 100)}%` }}
              className="flex-1 rounded-t bg-primary/70"
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">أكثر الصفحات</p>
        <ul className="space-y-1">
          {data.pages.map((page) => (
            <li key={page.key} className="flex items-center gap-2 text-[11px]">
              <code dir="ltr" className="min-w-0 flex-1 truncate font-mono">
                {page.key}
              </code>
              <span className="font-mono">{page.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">مصادر الزيارات</p>
        <ul className="space-y-1">
          {data.referrers.map((ref) => (
            <li key={ref.key} className="flex items-center gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate">{ref.key}</span>
              <span className="font-mono">{ref.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SecretsView({
  projectId,
  items,
  loading,
  onChanged,
}: {
  projectId: string;
  items: { id: string; name: string; masked: string; updatedAt: string }[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !value.trim()) return;
    setSaving(true);
    try {
      await setProjectSecret({ data: { projectId, name: name.trim(), value: value.trim() } });
      setName("");
      setValue("");
      onChanged();
      toast.success("تم حفظ المفتاح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteProjectSecret({ data: { projectId, id } });
      onChanged();
    } catch {
      toast.error("تعذّر الحذف");
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <KeyRound className="size-3" /> مفتاح جديد لهذا المشروع
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          dir="ltr"
          placeholder="STRIPE_PUBLIC_KEY"
          className="w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring/40"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          dir="ltr"
          type="password"
          placeholder="القيمة"
          className="mt-2 w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !name.trim() || !value.trim()}
          className="mt-2 w-full rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "يحفظ…" : "حفظ"}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          يستطيع الوكيل قراءة هذه المفاتيح أثناء البناء عبر env_get لاستخدامها في كود الموقع.
        </p>
      </div>

      {loading ? (
        <Empty label="يحمّل…" />
      ) : items.length === 0 ? (
        <Empty label="لا توجد مفاتيح محفوظة لهذا المشروع." />
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[11px]"
            >
              <code dir="ltr" className="min-w-0 flex-1 truncate font-mono">
                {item.name}
              </code>
              <span className="font-mono text-[10px] text-muted-foreground">{item.masked}</span>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="حذف"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** طرفية حيّة تعرض كل نشاط أدوات الوكيل لحظة بلحظة. */
function TerminalView({ events }: { events: TerminalEvent[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  if (events.length === 0) {
    return <Empty label="الطرفية فارغة — ستظهر هنا كل خطوة ينفّذها الوكيل مباشرة." />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{events.length} حدث في هذه الجلسة</p>
        <button
          type="button"
          onClick={clearTerminal}
          className="rounded-md border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-surface"
        >
          تفريغ
        </button>
      </div>
      <div
        dir="ltr"
        className="max-h-[60vh] overflow-y-auto rounded-lg border bg-card p-3 font-mono text-[11px] leading-relaxed"
      >
        {events.map((event) => (
          <div key={event.id} className="flex gap-2 border-b border-dashed py-1 last:border-0">
            <span className="shrink-0 text-muted-foreground">
              {new Date(event.at).toLocaleTimeString("en-GB", { hour12: false })}
            </span>
            <span
              className={cn(
                "shrink-0",
                event.status === "error"
                  ? "text-destructive"
                  : event.status === "running"
                    ? "text-amber-600"
                    : "text-primary",
              )}
            >
              {event.status === "error" ? "✗" : event.status === "running" ? "…" : "✓"}
            </span>
            <span className="shrink-0 font-semibold">{event.tool}</span>
            {event.detail && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{event.detail}</span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
