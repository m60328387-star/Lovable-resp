import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCcw, Search, ShieldAlert, Timer, XCircle } from "lucide-react";
import { getAuditLog, sendTestAlert } from "@/lib/monitor.functions";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "all", label: "الكل" },
  { value: "tool", label: "أدوات" },
  { value: "connector", label: "روابط" },
  { value: "test", label: "اختبارات" },
  { value: "alert", label: "تنبيهات" },
];

/** سجل التدقيق: كل تنفيذ أداة أو نداء رابط مع بحث بالوقت والنتيجة. */
export function AuditPanel() {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<"all" | "ok" | "fail">("all");
  const [kind, setKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [alertNote, setAlertNote] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["audit-log", search, result, kind, from, to],
    queryFn: () =>
      getAuditLog({
        data: {
          search,
          result,
          kind,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to).toISOString() : null,
        },
      }),
    refetchInterval: 15000,
  });

  const data = query.data;

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">سجل التدقيق (Audit Log)</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAlertNote("جارٍ الإرسال…");
              void sendTestAlert()
                .then((res) =>
                  setAlertNote(
                    res.throttled
                      ? "تم كتم التنبيه مؤقتاً (مكرّر)."
                      : res.channels
                          .map((c) => `${c.channel}: ${c.sent ? "أُرسل" : c.reason}`)
                          .join(" — "),
                  ),
                )
                .catch((e: unknown) => setAlertNote(e instanceof Error ? e.message : String(e)));
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
          >
            <ShieldAlert className="size-3.5" />
            اختبار التنبيهات
          </button>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-surface"
          >
            <RefreshCcw className={cn("size-3.5", query.isFetching && "animate-spin")} />
            تحديث
          </button>
        </div>
      </header>

      {alertNote && <p className="text-[12px] text-muted-foreground">{alertNote}</p>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث في الاسم أو التفاصيل…"
            className="w-full rounded-lg border bg-background py-1.5 pe-2 ps-7 text-[12px]"
          />
        </label>
        <select
          value={result}
          onChange={(event) => setResult(event.target.value as "all" | "ok" | "fail")}
          className="rounded-lg border bg-background px-2 py-1.5 text-[12px]"
        >
          <option value="all">كل النتائج</option>
          <option value="ok">ناجح</option>
          <option value="fail">فاشل</option>
        </select>
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="rounded-lg border bg-background px-2 py-1.5 text-[12px]"
        >
          {KINDS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-lg border bg-background px-2 py-1.5 text-[11px]"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-lg border bg-background px-2 py-1.5 text-[11px]"
          />
        </div>
      </div>

      {data?.summary?.length ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {data.summary.map((item) => (
            <span key={item.kind} className="rounded-lg border px-2 py-1">
              {item.kind}: {item.total} تنفيذ · {item.failed} فشل · متوسط {item.avg_ms}ms
            </span>
          ))}
          <span className="rounded-lg border px-2 py-1">
            sandbox: {data.sandbox.running} قيد التنفيذ · {data.sandbox.queued} بالانتظار
          </span>
          {data.sandbox.breakers
            .filter((b) => b.open)
            .map((b) => (
              <span
                key={b.name}
                className="rounded-lg border border-destructive/40 px-2 py-1 text-destructive"
              >
                موقوف مؤقتاً: {b.name}
              </span>
            ))}
        </div>
      ) : null}

      {data && !data.ok && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-[12px] text-destructive">
          {data.error}
        </p>
      )}

      <div className="max-h-[420px] overflow-auto rounded-xl border">
        <table className="w-full text-right text-[12px]">
          <thead className="sticky top-0 bg-surface text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">الوقت</th>
              <th className="p-2 font-medium">النوع</th>
              <th className="p-2 font-medium">الاسم</th>
              <th className="p-2 font-medium">النتيجة</th>
              <th className="p-2 font-medium">المدة</th>
              <th className="p-2 font-medium">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="whitespace-nowrap p-2 text-muted-foreground" dir="ltr">
                  {new Date(row.created_at).toLocaleString("ar")}
                </td>
                <td className="p-2">{row.kind}</td>
                <td className="p-2 font-medium">
                  {row.name}
                  {row.target ? (
                    <div className="text-[11px] text-muted-foreground">{row.target}</div>
                  ) : null}
                </td>
                <td className="p-2">
                  {row.ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="size-3.5" /> نجح
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <XCircle className="size-3.5" /> فشل {row.status ?? ""}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap p-2 text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Timer className="size-3.5" />
                    {row.duration_ms}ms
                  </span>
                </td>
                <td className="max-w-[280px] p-2 text-[11px] text-muted-foreground">
                  <span className="line-clamp-3 break-words">{row.detail ?? "—"}</span>
                </td>
              </tr>
            ))}
            {!query.isPending && (data?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  لا توجد سجلات مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
