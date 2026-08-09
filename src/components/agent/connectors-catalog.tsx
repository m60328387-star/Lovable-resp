import { useMemo, useState } from "react";
import { Plug, ExternalLink, KeyRound, Check } from "lucide-react";
import { CONNECTORS } from "@/lib/connectors";
import { cn } from "@/lib/utils";

/** كتالوج الروابط الخارجية المجانية المتاحة للوكيل. */
export function ConnectorsCatalog() {
  const [filter, setFilter] = useState<string>("الكل");
  const categories = useMemo(
    () => ["الكل", ...Array.from(new Set(CONNECTORS.map((c) => c.category)))],
    [],
  );
  const items = CONNECTORS.filter((c) => filter === "الكل" || c.category === filter);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <Plug className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">الروابط الخارجية (Connectors)</h2>
        <span className="text-[11px] text-muted-foreground">
          كلها مجانية — أضف المفتاح من تبويب «المفاتيح» في لوحة المشروع.
        </span>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setFilter(category)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
              filter === category
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-surface",
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((connector) => (
          <li key={connector.id} className="rounded-xl border bg-surface/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold">{connector.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{connector.free}</p>
              </div>
              <a
                href={connector.docs}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-muted-foreground hover:text-primary"
                aria-label={`توثيق ${connector.name}`}
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px]">
              {connector.secret ? (
                <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-muted-foreground">
                  <KeyRound className="size-3" />
                  {connector.secret}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-accent px-1.5 py-0.5 text-accent-foreground">
                  <Check className="size-3" />
                  بلا مفتاح
                </span>
              )}
              <code className="truncate font-mono text-muted-foreground" dir="ltr">
                {connector.examples[0]}
              </code>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
