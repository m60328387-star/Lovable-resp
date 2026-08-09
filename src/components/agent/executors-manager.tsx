import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import {
  createExecutor,
  deleteExecutor,
  listExecutors,
  listRuns,
  rotateExecutorToken,
} from "@/lib/executors.functions";
import { cn } from "@/lib/utils";

function CopyBox({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</p>}
      <pre
        dir="ltr"
        className="max-h-56 overflow-auto rounded-lg border bg-surface p-3 text-start font-mono text-[11px] leading-relaxed"
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute end-2 top-7 grid size-8 place-items-center rounded-md border bg-background hover:bg-accent"
        aria-label="نسخ"
      >
        {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/** لوحة إدارة منفّذات التنفيذ (خادم Contabo أو أي VPS). */
export function ExecutorsManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("contabo-1");
  const [openId, setOpenId] = useState<string | null>(null);

  const executors = useQuery({ queryKey: ["executors"], queryFn: () => listExecutors() });
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => listRuns(), refetchInterval: 8000 });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["executors"] });

  const create = useMutation({
    mutationFn: () => createExecutor({ data: { name: name.trim() || "contabo-1" } }),
    onSuccess: (row) => {
      invalidate();
      setOpenId(row.id);
    },
  });
  const rotate = useMutation({
    mutationFn: (id: string) => rotateExecutorToken({ data: { id } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteExecutor({ data: { id } }),
    onSuccess: invalidate,
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const install = (token: string, workdir: string) => `# 1) تثبيت Node.js على الخادم (مرة واحدة)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2) تنزيل وكيل Weaver
sudo mkdir -p /opt/weaver && cd /opt/weaver
sudo curl -fsSL ${origin}/weaver-agent.mjs -o weaver-agent.mjs

# 3) خدمة دائمة تعمل بعد إعادة التشغيل
sudo tee /etc/systemd/system/weaver-agent.service >/dev/null <<'EOF'
[Unit]
Description=Weaver Executor Agent
After=network-online.target

[Service]
Environment=WEAVER_URL=${origin}
Environment=WEAVER_TOKEN=${token}
Environment=WEAVER_WORKDIR=${workdir}
ExecStart=/usr/bin/node /opt/weaver/weaver-agent.mjs
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now weaver-agent
sudo systemctl status weaver-agent --no-pager`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1">
          <span className="text-[12px] font-semibold">اسم المنفّذ</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
            placeholder="contabo-1"
          />
        </label>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-4" />
          إنشاء منفّذ
        </button>
      </div>

      {executors.isLoading && <p className="text-[12.5px] text-muted-foreground">جارٍ التحميل…</p>}

      {(executors.data ?? []).map((ex) => {
        const online = ex.status === "online";
        return (
          <div key={ex.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold">{ex.name}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  online ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {online ? "متصل" : "غير متصل"}
              </span>
              {ex.meta.platform && (
                <span dir="ltr" className="font-mono text-[10.5px] text-muted-foreground">
                  {ex.meta.platform} · node {ex.meta.node}
                </span>
              )}
              <div className="ms-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === ex.id ? null : ex.id)}
                  className="h-11 rounded-lg border px-3 text-[12px] font-semibold hover:bg-surface"
                >
                  تعليمات التثبيت
                </button>
                <button
                  type="button"
                  onClick={() => rotate.mutate(ex.id)}
                  className="grid size-11 place-items-center rounded-lg border hover:bg-surface"
                  aria-label="تجديد الرمز"
                >
                  <RefreshCw className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`حذف المنفّذ "${ex.name}"؟`)) remove.mutate(ex.id);
                  }}
                  className="grid size-11 place-items-center rounded-lg border text-destructive hover:bg-destructive/10"
                  aria-label="حذف المنفّذ"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>

            {ex.last_seen_at && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                آخر نبضة: {new Date(ex.last_seen_at).toLocaleString("ar")}
              </p>
            )}

            {openId === ex.id && (
              <div className="mt-3 space-y-3">
                <CopyBox label="رمز الاتصال السري (لا تشاركه)" text={ex.token} />
                <CopyBox
                  label="نفّذ هذه الأوامر على خادم Contabo عبر SSH"
                  text={install(ex.token, ex.workdir)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div>
        <p className="mb-2 text-[12px] font-semibold">طابور الأوامر</p>
        {(runs.data ?? []).length === 0 ? (
          <p className="text-[12px] text-muted-foreground">لا توجد أوامر بعد.</p>
        ) : (
          <div className="space-y-1.5">
            {(runs.data ?? []).map((r) => (
              <details key={r.id} className="rounded-lg border p-2">
                <summary className="flex cursor-pointer items-center gap-2 text-[12px]">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      r.status === "success" && "bg-primary/15 text-primary",
                      r.status === "failed" && "bg-destructive/15 text-destructive",
                      r.status === "running" && "bg-amber-500/15 text-amber-600",
                      (r.status === "queued" || r.status === "no_executor") &&
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.status}
                  </span>
                  <code dir="ltr" className="truncate font-mono text-[11px]">
                    {r.command}
                  </code>
                </summary>
                <pre
                  dir="ltr"
                  className="mt-2 max-h-64 overflow-auto rounded-md bg-surface p-2 text-start font-mono text-[11px] leading-relaxed"
                >
                  {r.output || "—"}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
