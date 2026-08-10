import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, Printer, RefreshCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { getInfraHealth, restartInfraService } from "@/lib/infra-health.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/status")({
  component: StatusPage,
  head: () => ({
    meta: [
      { title: "حالة الخدمات والنشر | Weaver" },
      {
        name: "description",
        content:
          "حالة deploy-hook و Nginx وبيئة التنفيذ على كونتابو مع وقت آخر نشر، سجلات آخر 200 سطر، وتقرير أعطال جاهز.",
      },
      { property: "og:title", content: "حالة الخدمات والنشر | Weaver" },
      {
        property: "og:description",
        content: "مؤشرات PASS/FAIL لكل خدمة، أزرار إعادة تشغيل فورية، وتقرير أعطال قابل للتنزيل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Service = "deploy-hook" | "nginx" | "runtime" | "app" | "worker";

const SERVICES: { service: Service; label: string }[] = [
  { service: "deploy-hook", label: "خطّاف النشر" },
  { service: "runtime", label: "بيئة التنفيذ" },
  { service: "nginx", label: "بوابة Nginx" },
  { service: "app", label: "التطبيق" },
  { service: "worker", label: "العامل الخلفي" },
];

function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
        ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
      )}
    >
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

function StatusPage() {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ["infra-health"],
    queryFn: () => getInfraHealth(),
    refetchInterval: 30_000,
    retry: false,
  });

  const restart = useMutation({
    mutationFn: (service: Service) => restartInfraService({ data: { service } }),
    onSuccess: (result) => {
      setNote(result.detail);
      void queryClient.invalidateQueries({ queryKey: ["infra-health"] });
    },
    onError: (error) => setNote(error instanceof Error ? error.message : String(error)),
  });

  const downloadReport = () => {
    if (!data) return;
    const blob = new Blob([data.report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weaver-incident-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!data) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(
      `<html dir="rtl"><head><meta charset="utf-8"><title>تقرير أعطال Weaver</title></head><body style="font-family:system-ui;padding:24px"><pre style="white-space:pre-wrap;font-size:12px">${data.report.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre></body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">حالة الخدمات والنشر</h1>
          <p className="text-[12px] text-muted-foreground">
            deploy-hook، Nginx، بيئة التنفيذ، وآخر نشر على كونتابو — مع مؤشرات PASS/FAIL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
          >
            <RefreshCcw className={cn("size-3.5", isFetching && "animate-spin")} /> تحديث
          </button>
          <button
            type="button"
            onClick={downloadReport}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
          >
            <Download className="size-3.5" /> تقرير نصّي
          </button>
          <button
            type="button"
            onClick={printReport}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
          >
            <Printer className="size-3.5" /> PDF
          </button>
        </div>
      </header>

      {isPending && (
        <p className="text-[12px] text-muted-foreground">جارٍ فحص الخدمات على الخادم…</p>
      )}

      {data && (
        <>
          <section className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">الخدمات</h2>
              <Badge ok={data.ok} />
            </div>
            <ul className="divide-y">
              {data.probes.map((probe) => (
                <li key={probe.label} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12px]">
                  <Badge ok={probe.ok} />
                  <span className="font-medium">{probe.label}</span>
                  <span className="truncate text-muted-foreground" dir="ltr">
                    {probe.detail}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
              <span className="text-[11px] text-muted-foreground">إعادة تشغيل:</span>
              {SERVICES.map((item) => (
                <button
                  key={item.service}
                  type="button"
                  disabled={restart.isPending}
                  onClick={() => restart.mutate(item.service)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold hover:bg-surface disabled:opacity-50"
                >
                  {restart.isPending && restart.variables === item.service && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  {item.label}
                </button>
              ))}
              {note && (
                <span className="w-full truncate text-[11px] text-muted-foreground" dir="ltr">
                  {note}
                </span>
              )}
            </div>
          </section>

          <section className="rounded-xl border p-4 text-[12px]">
            <h2 className="mb-2 text-[13px] font-semibold">آخر نشر</h2>
            {data.lastDeploy ? (
              <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">الحالة</dt>
                  <dd className="font-semibold">{data.lastDeploy.status ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">النوع</dt>
                  <dd>{data.lastDeploy.action ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">البدء</dt>
                  <dd dir="ltr">
                    {data.lastDeploy.startedAt
                      ? new Date(data.lastDeploy.startedAt).toLocaleString("ar")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">الانتهاء</dt>
                  <dd dir="ltr">
                    {data.lastDeploy.finishedAt
                      ? new Date(data.lastDeploy.finishedAt).toLocaleString("ar")
                      : data.activeJob
                        ? "قيد التنفيذ"
                        : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">لا توجد مهمة نشر مسجّلة على الخادم بعد.</p>
            )}
          </section>

          {data.incident && (
            <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-[12px]">
              <h2 className="mb-2 text-[13px] font-semibold text-destructive">تقرير الأعطال</h2>
              <p className="font-semibold">الأسباب</p>
              <ul className="mb-2 list-disc space-y-0.5 pe-5">
                {data.incident.reasons.map((reason) => (
                  <li key={reason} dir="ltr" className="break-words">
                    {reason}
                  </li>
                ))}
              </ul>
              <p className="font-semibold">الخطوة المقترحة</p>
              <ul className="list-disc space-y-0.5 pe-5">
                {data.incident.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border">
            <h2 className="border-b px-4 py-2.5 text-[13px] font-semibold">
              سجل آخر نشر (آخر 200 سطر)
            </h2>
            <pre
              dir="ltr"
              className="max-h-[420px] overflow-auto bg-surface/50 p-4 text-[11px] leading-5 whitespace-pre-wrap"
            >
              {data.lastDeploy?.log?.trim() || data.hookError || "لا يوجد سجل متاح."}
            </pre>
          </section>

          {data.disk && (
            <section className="rounded-xl border p-4">
              <h2 className="mb-1.5 text-[13px] font-semibold">مساحة القرص</h2>
              <pre dir="ltr" className="text-[11px] whitespace-pre-wrap">
                {data.disk}
              </pre>
            </section>
          )}
        </>
      )}
    </main>
  );
}
