import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-lg text-center">
        {/* Animated 404 SVG */}
        <div className="relative mx-auto mb-8 size-40">
          <svg viewBox="0 0 200 200" className="size-full opacity-80">
            <circle cx="100" cy="100" r="90" fill="none" stroke="oklch(0.75 0.12 250 / 0.15)" strokeWidth="2" strokeDasharray="8 4" className="animate-spin-slow" />
            <text x="100" y="115" textAnchor="middle" className="fill-primary" fontSize="56" fontWeight="800" fontFamily="var(--font-mono)">404</text>
          </svg>
        </div>
        <h2 className="text-2xl font-extrabold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها. تأكد من صحة الرابط أو عُد إلى الصفحة الرئيسية.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[14px] font-bold text-primary-foreground shadow-[0_0_25px_oklch(0.75_0.12_250/0.3)] transition-all hover:shadow-[0_0_35px_oklch(0.75_0.12_250/0.4)] active:scale-95"
          >
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">
          حدث خطأ غير متوقع
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          نعتذر عن هذا الخطأ. يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-[14px] font-bold text-primary-foreground shadow-[0_0_25px_oklch(0.75_0.12_250/0.3)] transition-all hover:shadow-[0_0_35px_oklch(0.75_0.12_250/0.4)] active:scale-95"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center rounded-xl border bg-card px-6 py-3 text-[14px] font-semibold transition-colors hover:bg-surface"
          >
            الصفحة الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Weaver — وكيل هندسي لبناء المواقع" },
      {
        name: "description",
        content: "Weaver: منصة وكيل ذكي لتخطيط وبناء ونشر المواقع الاحترافية بالعربية.",
      },
      { name: "author", content: "Weaver" },
      { property: "og:title", content: "Weaver — وكيل هندسي لبناء المواقع" },
      {
        property: "og:description",
        content: "Weaver: منصة وكيل ذكي لتخطيط وبناء ونشر المواقع الاحترافية بالعربية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Weaver" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" richColors dir="rtl" />
    </QueryClientProvider>
  );
}
