import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlugZap, RefreshCcw, Send, Timer, XCircle } from "lucide-react";
import {
  listConnectorsWithSettings,
  saveConnectorSetting,
  testConnector,
  type ConnectorTestResult,
} from "@/lib/connectors.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/connectors")({
  component: ConnectorsPage,
  head: () => ({
    meta: [
      { title: "إدارة الروابط الخارجية | Weaver" },
      {
        name: "description",
        content: "فعّل أو عطّل روابط Weaver الخارجية، رتّب أولوياتها، وأرسل طلباً تجريبياً لمعاينة الاستجابة والزمن.",
      },
      { property: "og:title", content: "إدارة الروابط الخارجية | Weaver" },
      {
        property: "og:description",
        content: "اختبار كل connector قبل تفعيله للوكيل: طلب تجريبي، استجابة كاملة، ومدة التنفيذ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ConnectorsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [path, setPath] = useState("/");
  const [method, setMethod] = useState("GET");
  const [body, setBody] = useState("");
  const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);

  const list = useQuery({
    queryKey: ["connectors-settings"],
    queryFn: () => listConnectorsWithSettings({ data: {} }),
  });

  const save = useMutation({
    mutationFn: (input: { connectorId: string; enabled?: boolean; priority?: number }) =>
      saveConnectorSetting({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connectors-settings"] }),
  });

  const runTest = useMutation({
    mutationFn: (input: { connectorId: string; path: string; method: string; body: string }) =>
      testConnector({ data: input }),
    onSuccess: (result) => {
      setTestResult(result);
      void queryClient.invalidateQueries({ queryKey: ["connectors-settings"] });
    },
    onError: (error: unknown) =>
      setTestResult({
        ok: false,
        status: null,
        durationMs: 0,
        url: null,
        contentType: null,
        body: "",
        error: error instanceof Error ? error.message : String(error),
      }),
  });

  const rows = list.data ?? [];
  const active = rows.find((row) => row.id === selected) ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6" dir="rtl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">الروابط الخارجية (Connectors)</h1>
          <p className="text-[12px] text-muted-foreground">
            فعّل ما تحتاجه فقط، رتّب الأولويات، واختبر كل رابط بطلب تجريبي قبل إتاحته للوكيل.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void list.refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
        >
          <RefreshCcw className={cn("size-3.5", list.isFetching && "animate-spin")} />
          تحديث
        </button>
      </header>

      {list.error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
          {list.error instanceof Error ? list.error.message : String(list.error)}
        </p>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <article
            key={row.id}
            className={cn(
              "space-y-2 rounded-2xl border p-3",
              selected === row.id && "border-primary/50 ring-1 ring-primary/20",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">{row.name}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {row.category} · {row.free}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => save.mutate({ connectorId: row.id, enabled: event.target.checked })}
                />
                مفعّل
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5",
                  row.ready ? "text-emerald-600" : "text-amber-600",
                )}
              >
                {row.ready ? "المفتاح جاهز" : `يحتاج ${row.secret ?? "مفتاح"}`}
              </span>
              <label className="flex items-center gap-1">
                الأولوية
                <input
                  type="number"
                  defaultValue={row.priority}
                  min={1}
                  max={999}
                  onBlur={(event) =>
                    save.mutate({ connectorId: row.id, priority: Number(event.target.value) || 100 })
                  }
                  className="w-16 rounded-md border bg-background px-1.5 py-0.5"
                />
              </label>
              {row.tested_at && (
                <span className={cn(row.last_test_ok ? "text-emerald-600" : "text-destructive")}>
                  آخر اختبار: {row.last_test_ok ? "نجح" : "فشل"} · {row.last_test_ms}ms
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelected(row.id);
                  setPath(row.examples[0] ?? "/");
                  setTestResult(null);
                }}
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 hover:bg-surface"
              >
                <PlugZap className="size-3.5" />
                اختبار
              </button>
            </div>
          </article>
        ))}
      </section>

      {active && (
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="text-sm font-bold">طلب تجريبي — {active.name}</h2>
          <div className="grid gap-2 sm:grid-cols-[110px_1fr]">
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className="rounded-lg border bg-background px-2 py-1.5 text-[12px]"
            >
              {["GET", "POST", "PATCH", "PUT", "DELETE"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              dir="ltr"
              placeholder="/getMe"
              className="rounded-lg border bg-background px-2 py-1.5 text-[12px]"
            />
          </div>
          {method !== "GET" && (
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              dir="ltr"
              rows={4}
              placeholder='{"chat_id":123,"text":"مرحباً"}'
              className="w-full rounded-lg border bg-background px-2 py-1.5 font-mono text-[12px]"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={runTest.isPending}
              onClick={() => runTest.mutate({ connectorId: active.id, path, method, body })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground disabled:opacity-60"
            >
              <Send className="size-3.5" />
              {runTest.isPending ? "جارٍ التنفيذ…" : "إرسال الطلب التجريبي"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              أمثلة: {active.examples.join(" · ") || "—"}
            </span>
          </div>

          {testResult && (
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                {testResult.ok ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="size-3.5" /> نجح {testResult.status ?? ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircle className="size-3.5" /> فشل {testResult.status ?? ""}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Timer className="size-3.5" /> {testResult.durationMs}ms
                </span>
                {testResult.url && (
                  <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                    {testResult.url}
                  </span>
                )}
              </div>
              {testResult.error && <p className="text-[12px] text-destructive">{testResult.error}</p>}
              <pre
                dir="ltr"
                className="max-h-72 overflow-auto rounded-lg bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap"
              >
                {testResult.body || "—"}
              </pre>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
