import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/agent/app-shell";
import { ChatWindow } from "@/components/agent/chat-window";

export const Route = createFileRoute("/_authenticated/c/$threadId")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"] } : {},
  head: () => ({
    meta: [
      { title: "مهمة الوكيل — Weaver" },
      {
        name: "description",
        content: "تابع الوكيل وهو يفكك المتطلبات ويبني المواصفات ورسم المهام ويتحقق من النتائج.",
      },
      { property: "og:title", content: "مهمة الوكيل — Weaver" },
      {
        property: "og:description",
        content: "محادثة مهمة هندسية كاملة: مواصفات، رسم مهام، تنفيذ وتحقق.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { q } = Route.useSearch();

  return (
    <AppShell activeThreadId={threadId}>
      <ChatWindow key={threadId} threadId={threadId} {...(q ? { initialPrompt: q } : {})} />
    </AppShell>
  );
}
