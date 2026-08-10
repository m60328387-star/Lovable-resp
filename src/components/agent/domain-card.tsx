import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, RefreshCw, Link2, Unlink, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  getDomainState,
  attachCustomDomain,
  refreshDomainStatus,
  detachCustomDomain,
} from "@/lib/domains.functions";

const STATUS_LABEL: Record<string, string> = {
  none: "غير مربوط",
  pending_dns: "بانتظار سجلات DNS",
  configuring: "جارٍ التهيئة وإصدار SSL",
  live: "يعمل",
  failed: "فشل",
};

/** بطاقة ربط دومين مخصّص بالموقع المنشور. */
export function DomainCard({ projectId, published }: { projectId: string; published: boolean }) {
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string>("");
  const [log, setLog] = useState("");

  const state = useQuery({
    queryKey: ["domain-state", projectId],
    queryFn: () => getDomainState({ data: { projectId } }),
  });

  const data = state.data;

  const connect = async () => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      const result = await attachCustomDomain({
        data: { projectId, domain: input.trim(), ...(email.trim() ? { email: email.trim() } : {}) },
      });
      setJobId(("jobId" in result && result.jobId) || "");
      setLog(result.message);
      if (result.ok) toast.success(result.message);
      else toast.warning("سجلات DNS غير جاهزة بعد");
      await state.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل ربط الدومين");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const result = await refreshDomainStatus({
        data: { projectId, ...(jobId ? { jobId } : {}) },
      });
      setLog(result.log || "");
      await state.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحديث الحالة");
    } finally {
      setBusy(false);
    }
  };

  const detach = async () => {
    setBusy(true);
    try {
      await detachCustomDomain({ data: { projectId } });
      setJobId("");
      setLog("");
      await state.refetch();
      toast.success("تم فصل الدومين");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Globe className="size-3.5 text-primary" />
        <h4 className="text-[12px] font-bold">الدومين المخصّص</h4>
        {data?.domain && (
          <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px]">
            {STATUS_LABEL[data.status] ?? data.status}
          </span>
        )}
      </div>

      {!published ? (
        <p className="text-[11px] text-muted-foreground">انشر الموقع أولاً ثم اربط الدومين.</p>
      ) : (
        <>
          {!data?.domain && (
            <div className="flex flex-wrap gap-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="example.com"
                dir="ltr"
                className="min-w-40 flex-1 rounded-lg border bg-background px-2 py-1.5 font-mono text-[11px]"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="بريد شهادة SSL (اختياري)"
                dir="ltr"
                className="min-w-40 flex-1 rounded-lg border bg-background px-2 py-1.5 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Link2 className="size-3" />
                {busy ? "يعمل…" : "ربط"}
              </button>
            </div>
          )}

          {data?.domain && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={data.url ?? `https://${data.domain}`}
                  target="_blank"
                  rel="noopener"
                  className="font-mono text-[12px] font-semibold text-primary"
                  dir="ltr"
                >
                  {data.domain}
                </a>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold hover:bg-surface disabled:opacity-60"
                >
                  <RefreshCw className="size-3" />
                  تحديث الحالة
                </button>
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold hover:bg-surface disabled:opacity-60"
                  title="إعادة محاولة التهيئة وإصدار الشهادة"
                >
                  <Link2 className="size-3" />
                  إعادة المحاولة
                </button>
                <button
                  type="button"
                  onClick={() => void detach()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-surface disabled:opacity-60"
                >
                  <Unlink className="size-3" />
                  فصل
                </button>
              </div>
              {data.dns && !data.dns.ok && (
                <p className="text-[11px] text-amber-600">{data.dns.detail}</p>
              )}
              {data.error && <p className="text-[11px] text-destructive">{data.error}</p>}
            </div>
          )}

          <div className="mt-2 rounded-lg bg-surface p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">
                سجلات DNS المطلوبة
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(data?.instructions ?? "");
                  toast.success("تم النسخ");
                }}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-3" />
                نسخ
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-5" dir="ltr">
              {data?.instructions ?? `A    @      ...\nA    www    ...`}
            </pre>
          </div>

          {log && (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 font-mono text-[10px]">
              {log}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
