import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  DatabaseBackup,
  Code2,
  FileCode,
  GitBranch,
  Eye,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  GitCompare,
  CheckCircle2,
  XCircle,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/agent/app-shell";
import { diffLines, diffStats } from "@/lib/diff";
import {
  activatePromptVersion,
  approvePlatformChange,
  exportBackup,
  getDeployStatus,
  getStagePreview,
  getStageDiff,
  runSmokeTests,
  rollbackToStable,
  stagePlatform,
  listPlatformErrors,
  restoreBackup,
  deployPlatform,
  getPlatformSettings,
  listDeploys,
  listPlatformChanges,
  listPlatformFiles,
  listPromptVersions,
  proposePlatformChange,
  readPlatformFile,
  rejectPlatformChange,
  revertPlatformChange,
  savePlatformSettings,
  savePromptVersion,
  type PlatformChangeView,
} from "@/lib/platform.functions";
import { MODEL_OPTIONS } from "@/lib/model-settings";
import { MODE_STORAGE_KEY } from "@/lib/modes";
import { createProject } from "@/lib/projects.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({
    meta: [
      { title: "تطوير المنصة — Weaver" },
      {
        name: "description",
        content:
          "عدّل كود Weaver نفسه بمراجعة Diff، اعتمد التغييرات، انشر وتراجع، واضبط الإعدادات والتعليمات بلا كود.",
      },
      { property: "og:title", content: "تطوير المنصة — Weaver" },
      {
        property: "og:description",
        content: "استقلال كامل: تعديل ونشر وتراجع داخل Weaver بدون مبرمج.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlatformPage,
});

type TabKey = "files" | "changes" | "deploy" | "settings" | "prompt" | "backup";

const TABS: { key: TabKey; label: string; icon: typeof Code2 }[] = [
  { key: "files", label: "الكود", icon: FileCode },
  { key: "changes", label: "التغييرات", icon: GitBranch },
  { key: "deploy", label: "النشر", icon: Rocket },
  { key: "settings", label: "الإعدادات", icon: Settings2 },
  { key: "prompt", label: "التعليمات", icon: Code2 },
  { key: "backup", label: "النسخ والأخطاء", icon: DatabaseBackup },
];

function DiffView({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const stats = diffStats(lines);
  if (lines.length === 0) {
    return <p className="p-3 text-[12.5px] text-muted-foreground">لا يوجد فرق.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-1.5 font-mono text-[11px]">
        <span className="text-emerald-600">+{stats.added}</span>
        <span className="text-rose-600">−{stats.removed}</span>
      </div>
      <pre
        className="max-h-[420px] overflow-auto bg-card font-mono text-[11.5px] leading-5"
        dir="ltr"
      >
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              "px-3",
              line.kind === "add" && "bg-emerald-500/10 text-emerald-700",
              line.kind === "del" && "bg-rose-500/10 text-rose-700",
            )}
          >
            <span className="me-2 inline-block w-10 select-none text-muted-foreground">
              {line.oldNo ?? line.newNo ?? ""}
            </span>
            {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "} {line.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

function FilesTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");

  const files = useQuery({
    queryKey: ["platform-files"],
    queryFn: () => listPlatformFiles({ data: { prefix: "" } }),
  });

  const file = useQuery({
    queryKey: ["platform-file", path],
    queryFn: async () => {
      const result = await readPlatformFile({ data: { path: path! } });
      setDraft(result.content);
      return result;
    },
    enabled: Boolean(path),
  });

  const propose = useMutation({
    mutationFn: () =>
      proposePlatformChange({
        data: {
          title: title || `تعديل ${path}`,
          description: "",
          files: [{ path: path!, after: draft }],
        },
      }),
    onSuccess: () => {
      toast.success("تم إنشاء التغيير — راجعه في تبويب التغييرات");
      setTitle("");
      void queryClient.invalidateQueries({ queryKey: ["platform-changes"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر إنشاء التغيير"),
  });

  const list = (files.data ?? []).filter((f) =>
    query.trim() ? f.path.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-2xl border bg-card p-3 shadow-soft">
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن ملف…"
            className="w-full bg-transparent text-[12.5px] outline-none"
          />
        </div>
        <div className="mt-2 max-h-[520px] overflow-auto">
          {files.isLoading ? (
            <p className="p-3 text-[12.5px] text-muted-foreground">جارٍ التحميل…</p>
          ) : (
            list.slice(0, 300).map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setPath(f.path)}
                dir="ltr"
                className={cn(
                  "block w-full truncate rounded-lg px-2 py-1.5 text-start font-mono text-[11.5px] hover:bg-accent",
                  path === f.path && "bg-accent font-semibold",
                )}
              >
                {f.path}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        {!path ? (
          <p className="text-[13px] text-muted-foreground">اختر ملفاً من القائمة لعرضه وتعديله.</p>
        ) : file.isLoading ? (
          <p className="text-[13px] text-muted-foreground">جارٍ قراءة الملف…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="font-mono text-[12px] font-semibold">
                {path}
              </span>
              {file.data?.sensitive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="size-3" /> ملف حسّاس
                </span>
              ) : null}
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              dir="ltr"
              spellCheck={false}
              className="mt-3 h-[380px] w-full resize-y rounded-xl border bg-background p-3 font-mono text-[11.5px] leading-5 outline-none focus:border-primary"
            />
            {draft !== (file.data?.content ?? "") ? (
              <div className="mt-3">
                <DiffView before={file.data?.content ?? ""} after={draft} />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="عنوان التغيير"
                className="min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-[12.5px] outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={propose.isPending || draft === (file.data?.content ?? "")}
                onClick={() => propose.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {propose.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                أرسل للمراجعة
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChangeCard({ change }: { change: PlatformChangeView }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const sensitive = change.files.some((f) => /auth|db|deploy|platform\./i.test(f.path));

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["platform-changes"] });

  const approve = useMutation({
    mutationFn: () =>
      approvePlatformChange({ data: { changeId: change.id, confirmSensitive: true } }),
    onSuccess: () => {
      toast.success("تم اعتماد التغيير وكتابته");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الاعتماد"),
  });
  const reject = useMutation({
    mutationFn: () => rejectPlatformChange({ data: { changeId: change.id } }),
    onSuccess: invalidate,
  });
  const revert = useMutation({
    mutationFn: () => revertPlatformChange({ data: { changeId: change.id } }),
    onSuccess: () => {
      toast.success("تم التراجع");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر التراجع"),
  });

  const badge =
    change.status === "approved"
      ? "bg-emerald-500/15 text-emerald-700"
      : change.status === "rejected"
        ? "bg-muted text-muted-foreground"
        : change.status === "reverted"
          ? "bg-amber-500/15 text-amber-700"
          : change.status === "failed"
            ? "bg-rose-500/15 text-rose-700"
            : "bg-primary/15 text-primary";

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold">{change.title}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">
            {change.files.map((f) => f.path).join(" · ")}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", badge)}>
          {change.status}
        </span>
      </div>

      {change.error ? <p className="mt-2 text-[12px] text-rose-600">{change.error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold hover:bg-accent"
        >
          {open ? "إخفاء الفرق" : "عرض الفرق"}
        </button>
        {change.status === "pending" ? (
          <>
            <button
              type="button"
              disabled={approve.isPending}
              onClick={() => {
                if (sensitive && !window.confirm("هذا التغيير يمسّ ملفات حسّاسة. متابعة؟")) return;
                approve.mutate();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {approve.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              اعتماد
            </button>
            <button
              type="button"
              onClick={() => reject.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold hover:bg-accent"
            >
              <X className="size-3.5" /> رفض
            </button>
          </>
        ) : null}
        {change.status === "approved" ? (
          <button
            type="button"
            disabled={revert.isPending}
            onClick={() => revert.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold hover:bg-accent disabled:opacity-50"
          >
            <Undo2 className="size-3.5" /> تراجع
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          {change.files.map((f) => (
            <div key={f.path}>
              <p className="mb-1 font-mono text-[11px] text-muted-foreground" dir="ltr">
                {f.path}
              </p>
              <DiffView before={f.before} after={f.after} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChangesTab() {
  const changes = useQuery({
    queryKey: ["platform-changes"],
    queryFn: () => listPlatformChanges(),
  });
  if (changes.isLoading) return <p className="text-[13px] text-muted-foreground">جارٍ التحميل…</p>;
  if ((changes.data ?? []).length === 0) {
    return <p className="text-[13px] text-muted-foreground">لا توجد تغييرات بعد.</p>;
  }
  return (
    <div className="space-y-3">
      {changes.data!.map((change) => (
        <ChangeCard key={change.id} change={change} />
      ))}
    </div>
  );
}

function StagePreviewCard() {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["stage-preview"],
    queryFn: () => getStagePreview(),
    refetchInterval: (query) => (query.state.data?.stage.status === "running" ? 5_000 : 20_000),
  });
  const stage = preview.data?.stage;
  const head = preview.data?.head;

  const act = useMutation({
    mutationFn: (action: "up" | "down") => stagePlatform({ data: { action } }),
    onSuccess: (result) => {
      if (result.ok) toast.info(result.log);
      else toast.error(result.log);
      void queryClient.invalidateQueries({ queryKey: ["stage-preview"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-deploys"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّرت المعاينة"),
  });

  const running = stage?.status === "running";
  const label =
    stage?.status === "success"
      ? stage.matchesHead
        ? "جاهزة ومطابقة لآخر إصدار"
        : "جاهزة لكن لإصدار أقدم"
      : stage?.status === "running"
        ? "قيد البناء…"
        : stage?.status === "failed"
          ? "فشل البناء"
          : "لم تُبنَ بعد";

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <Eye className="size-4" /> معاينة قبل النشر
        </h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
            stage?.status === "success" && stage.matchesHead
              ? "bg-emerald-500/15 text-emerald-700"
              : stage?.status === "failed"
                ? "bg-rose-500/15 text-rose-700"
                : running
                  ? "bg-sky-500/15 text-sky-700"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {label}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        تُبنى نسخة كاملة من الإصدار المرشّح على الخادم بمنفذ مستقل، تشترك مع الإنتاج في قاعدة
        البيانات وبيئة التنفيذ فقط. افحصها بنفسك، وعندها فقط يُسمح بتبديل الإنتاج.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            إصدار المعاينة
          </p>
          <p className="mt-1 font-mono text-[12px]" dir="ltr">
            {stage?.ref ? stage.ref.slice(0, 12) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
            HEAD: {head?.sha ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            رابط المعاينة
          </p>
          {stage?.url ? (
            <a
              href={stage.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-[12px] text-primary hover:underline"
              dir="ltr"
            >
              {stage.url}
            </a>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">
              اضبط PLATFORM_STAGE_URL أو WEAVER_SERVER_IP لعرض الرابط.
            </p>
          )}
          {stage?.finishedAt ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {new Date(stage.finishedAt).toLocaleString("ar")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={act.isPending || running}
          onClick={() => act.mutate("up")}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {act.isPending || running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlayCircle className="size-4" />
          )}
          بناء المعاينة
        </button>
        {stage?.url && stage.status === "success" ? (
          <a
            href={stage.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold hover:bg-accent"
          >
            <Eye className="size-4" /> فتح المعاينة
          </a>
        ) : null}
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate("down")}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
        >
          <X className="size-4" /> إيقاف المعاينة
        </button>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["stage-preview"] })}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold hover:bg-accent"
        >
          <RefreshCw className="size-4" /> تحديث
        </button>
      </div>

      {stage?.log ? (
        <pre
          className="mt-3 max-h-56 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[11px]"
          dir="ltr"
        >
          {stage.log}
        </pre>
      ) : null}
    </div>
  );
}

function SmokeTestsCard() {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["stage-preview"],
    queryFn: () => getStagePreview(),
    refetchInterval: (query) => (query.state.data?.stage.status === "running" ? 5_000 : 20_000),
  });
  const smoke = preview.data?.smoke ?? null;
  const run = useMutation({
    mutationFn: () => runSmokeTests(),
    onSuccess: (report) => {
      if (report.ok) toast.success("نجحت اختبارات الدخان على المعاينة");
      else toast.error("فشلت بعض اختبارات الدخان — راجع النتائج");
      void queryClient.invalidateQueries({ queryKey: ["stage-preview"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الاختبار"),
  });

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <ShieldCheck className="size-4" /> اختبارات الدخان على المعاينة
        </h2>
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => run.mutate()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-accent disabled:opacity-50"
        >
          {run.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PlayCircle className="size-3.5" />
          )}
          إعادة الاختبار
        </button>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        تُنفَّذ تلقائياً فور اكتمال بناء المعاينة، ولا يُسمح بالتبديل إلى الإنتاج قبل نجاحها كلها.
      </p>

      {!smoke ? (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          لا توجد نتائج بعد — ابنِ المعاينة أولاً.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {smoke.checks.map((check) => (
              <div
                key={check.path + check.name}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
                  check.ok
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-rose-500/30 bg-rose-500/5",
                )}
              >
                {check.ok ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="size-3.5 text-rose-600" />
                )}
                <span className="font-semibold">{check.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {check.path} · HTTP {check.status} · {check.ms}ms
                </span>
                {check.error ? (
                  <span className="text-[11px] text-rose-600" dir="ltr">
                    {check.error}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            آخر تشغيل: {smoke.at ? new Date(smoke.at).toLocaleString("ar") : "—"} — الإصدار:{" "}
            <span className="font-mono" dir="ltr">
              {smoke.ref?.slice(0, 12) ?? "—"}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function StageDiffCard() {
  const diff = useQuery({ queryKey: ["stage-diff"], queryFn: () => getStageDiff() });
  const [open, setOpen] = useState<string | null>(null);
  const data = diff.data;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <GitCompare className="size-4" /> المعاينة مقابل الإنتاج
        </h2>
        <button
          type="button"
          onClick={() => void diff.refetch()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-accent"
        >
          <RefreshCw className={cn("size-3.5", diff.isFetching && "animate-spin")} /> تحديث
        </button>
      </div>

      {diff.isPending ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">جارٍ الحساب…</p>
      ) : !data?.available ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">{data?.reason ?? "غير متاح"}</p>
      ) : (
        <>
          <p className="mt-2 text-[12.5px] text-muted-foreground" dir="ltr">
            {data.base?.slice(0, 7)} → {data.head?.slice(0, 7)} · +{data.aheadBy} commits ·{" "}
            {data.files.length} ملف
          </p>
          {data.files.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-emerald-700">
              لا فرق — المعاينة مطابقة تماماً لما يعمل على الإنتاج.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {data.files.map((file) => (
                <div key={file.path} className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setOpen(open === file.path ? null : file.path)}
                    className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-right text-[12px] hover:bg-accent"
                  >
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold">
                      {file.status}
                    </span>
                    <span className="font-mono" dir="ltr">
                      {file.path}
                    </span>
                    <span className="ms-auto font-mono text-[11px]" dir="ltr">
                      <span className="text-emerald-600">+{file.additions}</span>{" "}
                      <span className="text-rose-600">-{file.deletions}</span>
                    </span>
                  </button>
                  {open === file.path && file.patch ? (
                    <pre
                      className="max-h-72 overflow-auto border-t bg-muted/40 p-2 font-mono text-[11px]"
                      dir="ltr"
                    >
                      {file.patch}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SafeRollbackCard() {
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);
  const rollback = useMutation({
    mutationFn: () => rollbackToStable({ data: { confirm: true, confirmAgain: true } }),
    onSuccess: (result) => {
      setArmed(false);
      if (result.ok)
        toast.success(`بدأ التراجع إلى ${result.target?.slice(0, 7) ?? "الإصدار السابق"}`);
      else toast.error(result.log);
      void queryClient.invalidateQueries({ queryKey: ["platform-deploys"] });
      void queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر التراجع"),
  });

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Undo2 className="size-4" /> تراجع آمن إلى آخر إنتاج مستقر
      </h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        يعيد الخادم إلى آخر إصدار نُشر بنجاح، ثم يتحقّق من صحته. يتطلّب تأكيدين متتاليين.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!armed ? (
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold hover:bg-accent"
          >
            <Undo2 className="size-4" /> تجهيز التراجع
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={rollback.isPending}
              onClick={() => {
                if (!window.confirm("تأكيد نهائي: إرجاع الإنتاج إلى آخر إصدار مستقر؟")) return;
                rollback.mutate();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {rollback.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
              تأكيد التراجع الآن
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold hover:bg-accent"
            >
              <X className="size-4" /> إلغاء
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DeployTab() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["deploy-status"],
    queryFn: () => getDeployStatus(),
    refetchInterval: 10_000,
  });
  const deploys = useQuery({
    queryKey: ["platform-deploys"],
    queryFn: () => listDeploys(),
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "running") ? 5_000 : false,
  });
  const [skipStage, setSkipStage] = useState(false);
  const run = useMutation({
    mutationFn: (action: "deploy" | "rollback") =>
      deployPlatform({ data: { action, force: action === "deploy" ? skipStage : true } }),
    onSuccess: (result) => {
      if ((result as { blockedByStage?: boolean }).blockedByStage) toast.error(result.log);
      else if (result.pending)
        toast.info("بدأ الدفع إلى كونتابو — ستظهر النتيجة النهائية تلقائياً");
      else if (result.ok) toast.success("تم الاتصال بالخادم");
      else toast.error("فشل الاتصال بكونتابو — راجع السجل");
      void queryClient.invalidateQueries({ queryKey: ["platform-deploys"] });
      void queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الدفع"),
  });

  const hook = status.data?.hook;
  const head = status.data?.head;
  const last = status.data?.last;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="text-[15px] font-bold">Push to Contabo</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          اضغط الزر لدفع أحدث نسخة من Weaver إلى الخادم على كونتابو (194.163.155.52). النشر يجري عبر
          خطّاف آمن داخل الشبكة، ويعيد بناء الحاويات وتحقق من صحة الموقع.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              خطّاف كونتابو
            </p>
            <div className="mt-1 flex items-center gap-2 text-[12.5px]">
              <span
                className={cn(
                  "size-2 rounded-full",
                  hook?.configured
                    ? hook?.reachable
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                    : "bg-amber-500",
                )}
              />
              {hook?.configured ? (hook?.reachable ? "متصل" : "غير متصل") : "غير مضبوط"}
            </div>
            {hook?.error ? (
              <p className="mt-1 text-[11px] text-rose-600" dir="ltr">
                {hook.error}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              GitHub
            </p>
            <div className="mt-1 flex items-center gap-2 text-[12.5px]">
              <span
                className={cn(
                  "size-2 rounded-full",
                  head?.configured
                    ? head?.error
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                    : "bg-rose-500",
                )}
              />
              {head?.configured ? (head?.error ? "خطأ في القراءة" : "متصل") : "غير مضبوط"}
            </div>
            {head?.sha ? (
              <a
                href={head.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-[11px] text-primary hover:underline"
                dir="ltr"
              >
                {head.sha} — {head.message}
              </a>
            ) : null}
            {head?.error ? <p className="mt-1 text-[11px] text-rose-600">{head.error}</p> : null}
          </div>

          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              آخر نشر
            </p>
            <p className="mt-1 text-[12.5px] font-semibold">
              {last
                ? last.status === "success"
                  ? "ناجح"
                  : last.status === "running"
                    ? "قيد التنفيذ"
                    : "فاشل"
                : "—"}
            </p>
            {last ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(last.createdAt).toLocaleString("ar")}
              </p>
            ) : null}
          </div>
        </div>

        {!hook?.configured ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-800">
            لم يُضبط رابط النشر على هذا النسخة. تأكد من تعيين متغيرات البيئة PLATFORM_DEPLOY_URL و
            EXECUTOR_TOKEN على الخادم.
          </div>
        ) : null}
        {head?.configured && !head?.error && hook?.configured && !hook?.reachable ? (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-800">
            خطّاف كونتابو لا يستجيب. ربما لم يُشغّل الخدمة أو يحجبها جدار ناري. تحقق من تشغيل{" "}
            <span className="font-mono" dir="ltr">
              node deploy/deploy-hook.mjs
            </span>{" "}
            على الخادم.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={run.isPending || !hook?.configured}
            onClick={() => run.mutate("deploy")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {run.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Rocket className="size-4" />
            )}
            دفع إلى كونتابو
          </button>
          <button
            type="button"
            disabled={run.isPending}
            onClick={() => {
              if (!window.confirm("التراجع سيعيد المنصة للإصدار السابق. متابعة؟")) return;
              run.mutate("rollback");
            }}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
          >
            <Undo2 className="size-4" /> تراجع
          </button>
          <button
            type="button"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["platform-deploys"] });
              void queryClient.invalidateQueries({ queryKey: ["deploy-status"] });
            }}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold hover:bg-accent"
          ></button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px] font-semibold text-muted-foreground">
            <input
              type="checkbox"
              checked={skipStage}
              onChange={(event) => setSkipStage(event.target.checked)}
              className="size-3.5 accent-current"
            />
            تخطّي المعاينة (غير موصى به)
          </label>
        </div>
      </div>

      <StagePreviewCard />
      <SmokeTestsCard />
      <StageDiffCard />
      <SafeRollbackCard />

      <div className="space-y-2">
        {(deploys.data ?? []).map((d) => (
          <div key={d.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold">
                {d.kind === "rollback" ? "تراجع" : "دفع"} —{" "}
                {d.status === "success" ? "ناجح" : d.status === "running" ? "قيد التنفيذ" : "فاشل"}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {new Date(d.createdAt).toLocaleString("ar")}
              </span>
            </div>
            {d.log ? (
              <pre
                className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[11px]"
                dir="ltr"
              >
                {d.log}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => getPlatformSettings(),
  });
  const [draft, setDraft] = useState<Record<string, string | number> | null>(null);
  const value =
    draft ?? (settings.data as unknown as Record<string, string | number> | undefined) ?? null;

  const save = useMutation({
    mutationFn: () => savePlatformSettings({ data: value as never }),
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الحفظ"),
  });

  if (!value) return <p className="text-[13px] text-muted-foreground">جارٍ التحميل…</p>;

  const set = (key: string, next: string | number) => setDraft({ ...value, [key]: next });

  const modelField = (key: string, label: string) => (
    <label className="block">
      <span className="text-[12.5px] font-semibold">{label}</span>
      <input
        list="platform-models"
        value={String(value[key] ?? "")}
        onChange={(event) => set(key, event.target.value)}
        dir="ltr"
        className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-[12px] outline-none focus:border-primary"
      />
    </label>
  );

  const numberField = (key: string, label: string, hint: string) => (
    <label className="block">
      <span className="text-[12.5px] font-semibold">{label}</span>
      <input
        type="number"
        value={Number(value[key] ?? 0)}
        onChange={(event) => set(key, Number(event.target.value))}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-[12.5px] outline-none focus:border-primary"
      />
      <span className="mt-1 block text-[11.5px] text-muted-foreground">{hint}</span>
    </label>
  );

  const textField = (key: string, label: string) => (
    <label className="block">
      <span className="text-[12.5px] font-semibold">{label}</span>
      <input
        value={String(value[key] ?? "")}
        onChange={(event) => set(key, event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-[12.5px] outline-none focus:border-primary"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <datalist id="platform-models">
        {MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </datalist>

      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="text-[15px] font-bold">النماذج</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {modelField("primaryModel", "النموذج الأساسي")}
          {modelField("fastModel", "النموذج السريع (تحليل وتلخيص)")}
          {modelField("reasoningModel", "نموذج التفكير العميق")}
          {modelField("visionModel", "نموذج الرؤية")}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="text-[15px] font-bold">الحدود</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {numberField("maxSteps", "عدد الخطوات", "أقصى عدد خطوات لحلقة الوكيل")}
          {numberField("maxTokens", "حجم المخرجات", "أقصى توكينز للرد الواحد")}
          {numberField("maxRetries", "إعادة المحاولة", "عدد محاولات إعادة الأدوات الفاشلة")}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="text-[15px] font-bold">الهوية</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {textField("brandName", "اسم المنصة")}
          {textField("brandTagline", "الشعار الفرعي")}
        </div>
      </div>

      <button
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        حفظ الإعدادات
      </button>
    </div>
  );
}

function PromptTab() {
  const queryClient = useQueryClient();
  const versions = useQuery({ queryKey: ["prompt-versions"], queryFn: () => listPromptVersions() });
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");

  const save = useMutation({
    mutationFn: (activate: boolean) =>
      savePromptVersion({ data: { label: label || "نسخة جديدة", content, activate } }),
    onSuccess: () => {
      toast.success("تم حفظ النسخة");
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: ["prompt-versions"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الحفظ"),
  });

  const activate = useMutation({
    mutationFn: (id: string | null) => activatePromptVersion({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="text-[15px] font-bold">تعليمات إضافية للوكيل</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          تُضاف فوق تعليمات Weaver الأساسية. استخدمها لتثبيت أسلوبك ومعايير جودتك بدون لمس الكود.
        </p>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="اسم النسخة (مثال: أسلوب المتاجر)"
          className="mt-3 w-full rounded-lg border px-3 py-2 text-[12.5px] outline-none focus:border-primary"
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="اكتب التعليمات هنا…"
          className="mt-2 h-52 w-full resize-y rounded-xl border p-3 text-[12.5px] leading-relaxed outline-none focus:border-primary"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={save.isPending || !content.trim()}
            onClick={() => save.mutate(true)}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            حفظ وتفعيل
          </button>
          <button
            type="button"
            disabled={save.isPending || !content.trim()}
            onClick={() => save.mutate(false)}
            className="rounded-lg border px-4 py-2 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
          >
            حفظ فقط
          </button>
          <button
            type="button"
            onClick={() => activate.mutate(null)}
            className="rounded-lg border px-4 py-2 text-[13px] font-semibold hover:bg-accent"
          >
            تعطيل الكل
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {(versions.data ?? []).map((v) => (
          <div key={v.id} className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold">
                {v.label} {v.active ? <span className="text-primary">• مفعّلة</span> : null}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLabel(`${v.label} (نسخة)`);
                    setContent(v.content);
                  }}
                  className="rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold hover:bg-accent"
                >
                  تحرير
                </button>
                {!v.active ? (
                  <button
                    type="button"
                    onClick={() => activate.mutate(v.id)}
                    className="rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold hover:bg-accent"
                  >
                    تفعيل
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-[11.5px] text-muted-foreground">{v.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackupTab() {
  const [payload, setPayload] = useState("");
  const errors = useQuery({ queryKey: ["platform-errors"], queryFn: () => listPlatformErrors() });

  const doExport = useMutation({
    mutationFn: () => exportBackup(),
    onSuccess: (snapshot) => {
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `weaver-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${snapshot.counts.projects} مشروعاً و${snapshot.counts.files} ملفاً`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRestore = useMutation({
    mutationFn: () => restoreBackup({ data: { payload } }),
    onSuccess: (r) => {
      setPayload("");
      toast.success(`تمت الاستعادة: ${r.restoredProjects} مشروع، ${r.restoredFiles} ملف`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const jobErrors = errors.data?.jobs ?? [];
  const deployErrors = errors.data?.deploys ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border p-4">
        <h2 className="text-[14px] font-bold">نسخة احتياطية</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          نزّل نسخة كاملة من مشاريعك وملفاتك ومحادثاتك، أو استعدها لاحقاً على أي خادم.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => doExport.mutate()}
            disabled={doExport.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {doExport.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <DatabaseBackup className="size-4" />
            )}
            تصدير نسخة
          </button>
        </div>
        <label className="mt-4 block text-[12.5px] font-semibold" htmlFor="restore-payload">
          استعادة من ملف JSON
        </label>
        <textarea
          id="restore-payload"
          dir="ltr"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder='{"version":1,"data":{...}}'
          className="mt-2 h-32 w-full rounded-xl border bg-background p-3 font-mono text-[11.5px]"
        />
        <button
          type="button"
          onClick={() => doRestore.mutate()}
          disabled={doRestore.isPending || payload.trim().length < 2}
          className="mt-2 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-60"
        >
          {doRestore.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Undo2 className="size-4" />
          )}
          استعادة
        </button>
      </section>

      <section className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold">آخر الأخطاء</h2>
          <button
            type="button"
            onClick={() => void errors.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]"
          >
            <RefreshCw className="size-3.5" />
            تحديث
          </button>
        </div>
        {jobErrors.length === 0 && deployErrors.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted-foreground">لا توجد أخطاء مسجّلة.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {jobErrors.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-3"
              >
                <div className="flex items-center gap-2 text-[12px] font-semibold text-destructive">
                  <AlertTriangle className="size-3.5" />
                  مهمة فاشلة
                  <span className="font-normal text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("ar")}
                  </span>
                </div>
                <pre
                  dir="ltr"
                  className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11.5px]"
                >
                  {e.message}
                </pre>
              </li>
            ))}
            {deployErrors.map((e) => (
              <li key={e.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-2 text-[12px] font-semibold">
                  <Rocket className="size-3.5" />
                  نشر فاشل
                  <span className="font-normal text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("ar")}
                  </span>
                </div>
                <pre
                  dir="ltr"
                  className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11.5px]"
                >
                  {e.message}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlatformPage() {
  const [tab, setTab] = useState<TabKey>("files");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const openSelfChat = useMutation({
    mutationFn: () => createProject({ data: { title: "تطوير Weaver" } }),
    onSuccess: (project) => {
      if (typeof window !== "undefined") window.localStorage.setItem(MODE_STORAGE_KEY, "platform");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (project) void navigate({ to: "/c/$threadId", params: { threadId: project.id } });
    },
    onError: () => toast.error("تعذّر فتح دردشة التطوير"),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">تطوير المنصة</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              عدّل Weaver نفسه: راجع الفرق قبل التطبيق، اعتمد، انشر، وتراجع — كل شيء من هنا بدون
              مبرمج.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openSelfChat.mutate()}
            disabled={openSelfChat.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {openSelfChat.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="size-4" />
            )}
            دردشة تعديل Weaver
          </button>
        </header>

        <nav className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                tab === t.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {tab === "files" ? <FilesTab /> : null}
          {tab === "changes" ? <ChangesTab /> : null}
          {tab === "deploy" ? <DeployTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
          {tab === "prompt" ? <PromptTab /> : null}
          {tab === "backup" ? <BackupTab /> : null}
        </div>
      </div>
    </AppShell>
  );
}
