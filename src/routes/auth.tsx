import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { enterWithPasscode } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الدخول إلى Weaver — رمز سري" },
      {
        name: "description",
        content: "ادخل الرمز السري للوصول إلى مساحة عمل Weaver: المواصفات والمهام والملفات والنشر.",
      },
      { property: "og:title", content: "الدخول إلى Weaver" },
      { property: "og:description", content: "مساحة عمل خاصة محمية برمز سري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const login = useServerFn(enterWithPasscode);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await login({ data: { passcode } });
      if (!result.ok) {
        toast.error("الرمز السري غير صحيح");
        return;
      }
      toast.success("تم الدخول");
      void navigate({ to: "/app" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر الدخول");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-paper flex min-h-dvh items-center justify-center px-4 py-12" dir="rtl">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-4" />
          </span>
          <span className="text-lg font-bold">Weaver</span>
        </Link>

        <div className="rounded-2xl border bg-card p-6 shadow-lift">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <KeyRound className="size-4 text-primary" />
            الدخول بالرمز السري
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            هذه مساحة عمل خاصة. أدخل الرمز السري للمتابعة.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="الرمز السري"
              dir="ltr"
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-center text-[15px] tracking-widest outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              دخول
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
