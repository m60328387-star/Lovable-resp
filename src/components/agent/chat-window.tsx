import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Brain,
  CheckCircle2,
  FileCode2,
  FileText,
  Loader2,
  Paperclip,
  Square,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { ProjectPanel } from "@/components/agent/project-panel";
import {
  SpecCard,
  TaskGraphCard,
  type SpecPayload,
  type TaskNode,
  type TaskUpdate,
} from "@/components/agent/project-cards";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversation,
  renameProject,
  saveConversation,
  saveSpec,
  saveTaskGraph,
  updateTaskStatus,
} from "@/lib/projects.functions";
import { useModelSetting } from "@/lib/model-settings";
import { useSkills } from "@/lib/skills";
import { useMode } from "@/lib/modes";
import { ModelPicker } from "@/components/agent/model-picker";
import { SkillsPicker } from "@/components/agent/skills-picker";
import { ModePicker } from "@/components/agent/mode-picker";
import { BackgroundJobs } from "@/components/agent/background-jobs";
import { enqueueAgentJob } from "@/lib/agent-jobs.functions";
import { toolDetail, toolFailed, toolLabel } from "@/lib/tool-display";
import { pushTerminalEvent } from "@/lib/terminal-bus";
import { cn } from "@/lib/utils";


type Attachment = { filename: string; mediaType: string; url: string };

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}


type AnyPart = { type: string; [key: string]: unknown };

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "محادثة جديدة";
  return clean.length > 46 ? `${clean.slice(0, 46)}…` : clean;
}

function ReasoningBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="rounded-lg border border-dashed bg-surface/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-start text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="size-3.5 text-primary" />
        <span>{streaming ? "الوكيل يفكّر…" : "سلسلة التفكير"}</span>
        <span className="ms-auto font-mono text-[10px]">{open ? "إخفاء" : "عرض"}</span>
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          {text}
        </p>
      )}
    </div>
  );
}

function MessageParts({ message }: { message: UIMessage }) {
  const parts = (Array.isArray(message.parts) ? message.parts : []) as unknown as AnyPart[];
  const updates: Record<string, TaskUpdate> = {};
  for (const part of parts) {
    if (part.type === "tool-update_task" && part["output"]) {
      const update = part["output"] as TaskUpdate;
      updates[update.id] = update;
    }
  }

  // بثّ كل نشاط أداة إلى الطرفية الحيّة داخل لوحة المشروع
  useEffect(() => {
    parts.forEach((part, index) => {
      if (!part.type.startsWith("tool-")) return;
      const tool = part.type.slice(5);
      const output = part["output"];
      const errorText = typeof part["errorText"] === "string" ? part["errorText"] : undefined;
      const status = errorText || toolFailed(output) ? "error" : output ? "done" : "running";
      const detail = errorText ?? toolDetail(output) ?? toolDetail(part["input"]);
      pushTerminalEvent({
        id: `${message.id}:${index}`,
        at: Date.now(),
        tool,
        label: toolLabel(tool),
        status,
        ...(detail ? { detail } : {}),
      });
    });
  }, [message.id, parts]);



  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.type === "reasoning") {
          return (
            <ReasoningBlock
              key={i}
              text={String(part["text"] ?? "")}
              streaming={part["state"] === "streaming"}
            />
          );
        }
        if (part.type === "text") {
          return (
            <div key={i} className="prose-agent text-[14px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {String(part["text"] ?? "")}
              </ReactMarkdown>
            </div>
          );
        }
        if (part.type === "tool-write_spec") {
          if (!part["output"]) return <ToolPending key={i} label="يكتب المواصفات…" />;
          return <SpecCard key={i} spec={part["output"] as SpecPayload} />;
        }
        if (part.type === "tool-build_task_graph") {
          if (!part["output"]) return <ToolPending key={i} label="يبني رسم المهام…" />;
          const payload = part["output"] as { tasks: TaskNode[] };
          return <TaskGraphCard key={i} tasks={payload.tasks ?? []} updates={updates} />;
        }
        if (part.type === "tool-write_file") {
          if (!part["output"]) return <ToolPending key={i} label="يكتب ملفاً في مساحة العمل…" />;
          const out = part["output"] as { path: string; version: number; summary?: string };
          return (
            <WorkspaceChip
              key={i}
              icon={FileCode2}
              title={out.path}
              meta={`v${out.version}`}
              note={out.summary}
            />
          );
        }
        if (part.type === "tool-run_command") {
          if (!part["output"]) return <ToolPending key={i} label="يسجّل أمراً للتنفيذ…" />;
          const out = part["output"] as { command: string; status: string; message?: string };
          return (
            <WorkspaceChip
              key={i}
              icon={Terminal}
              title={out.command}
              meta={out.status === "no_executor" ? "بانتظار منفّذ" : out.status}
              note={out.message}
            />
          );
        }
        if (part.type === "tool-run_checks") {
          if (!part["output"]) return <ToolPending key={i} label="ينفّذ فحص مساحة العمل…" />;
          const out = part["output"] as { ok: boolean; summary: string; filesChecked: number };
          return (
            <WorkspaceChip
              key={i}
              icon={out.ok ? CheckCircle2 : XCircle}
              title="weaver verify"
              meta={out.ok ? "نجح" : "فشل"}
              note={out.summary}
            />
          );
        }
        if (part.type.startsWith("tool-")) {
          const name = part.type.slice(5);
          const output = part["output"];
          const errorText = typeof part["errorText"] === "string" ? part["errorText"] : undefined;
          if (!output && !errorText) {
            return <ToolPending key={i} label={`${toolLabel(name)}…`} />;
          }
          const failed = !!errorText || toolFailed(output);
          return (
            <WorkspaceChip
              key={i}
              icon={failed ? XCircle : CheckCircle2}
              title={toolLabel(name)}
              meta={failed ? "فشل" : "تم"}
              note={errorText ?? toolDetail(output) ?? toolDetail(part["input"])}
            />
          );
        }
        return null;

      })}
    </div>
  );
}

function WorkspaceChip({
  icon: Icon,
  title,
  meta,
  note,
}: {
  icon: typeof FileCode2;
  title: string;
  meta: string;
  note?: string | undefined;
}) {
  return (
    <div className="rounded-lg border bg-surface/70 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-primary" />
        <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {title}
        </code>
        <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {meta}
        </span>
      </div>
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
function UserAttachments({ message }: { message: UIMessage }) {
  const files = ((Array.isArray(message.parts) ? message.parts : []) as unknown as AnyPart[]).filter(
    (p) => p.type === "file",
  );
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {files.map((file, index) => {
        const url = String(file["url"] ?? "");
        const mediaType = String(file["mediaType"] ?? "");
        const filename = String(file["filename"] ?? "ملف");
        return mediaType.startsWith("image/") ? (
          <img
            key={index}
            src={url}
            alt={filename}
            className="max-h-40 rounded-xl border object-cover"
          />
        ) : (
          <span
            key={index}
            className="flex items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-[11px]"
          >
            <FileText className="size-3.5 text-primary" />
            {filename}
          </span>
        );
      })}
    </div>
  );
}


function ToolPending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-surface/70 px-3 py-2 text-[12px] text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function ChatWindow({
  threadId,
  initialPrompt,
}: {
  threadId: string;
  initialPrompt?: string;
}) {
  const conversation = useQuery({
    queryKey: ["conversation", threadId],
    queryFn: () => getConversation({ data: { projectId: threadId } }),
    staleTime: Infinity,
  });

  // مهم: لا نُنشئ جلسة الدردشة قبل وصول السجل، وإلا بدت المحادثات القديمة فارغة
  if (conversation.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-3xl space-y-3 px-6">
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface-strong" />
          <div className="h-20 animate-pulse rounded-xl bg-surface" />
          <div className="h-20 w-4/5 animate-pulse rounded-xl bg-surface" />
        </div>
      </div>
    );
  }

  return (
    <ChatSurface
      key={threadId}
      threadId={threadId}
      initialPrompt={initialPrompt}
      loadedMessages={
        ((conversation.data?.messages ?? []) as unknown as UIMessage[]).filter(
          (m) => m && Array.isArray(m.parts),
        )
      }
    />
  );
}

function ChatSurface({
  threadId,
  initialPrompt,
  loadedMessages,
}: {
  threadId: string;
  initialPrompt?: string | undefined;

  loadedMessages: UIMessage[];
}) {
  const queryClient = useQueryClient();
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { projectId: threadId },
      }),
    [threadId],
  );
  const { model } = useModelSetting();
  const { skills } = useSkills();
  const { mode } = useMode();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: Attachment[] = [];
    for (const file of Array.from(list).slice(0, 6)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: الحجم أكبر من 4MB`);
        continue;
      }
      try {
        next.push({
          filename: file.name,
          mediaType: file.type || "application/octet-stream",
          url: await readAsDataUrl(file),
        });
      } catch {
        toast.error(`تعذّر قراءة ${file.name}`);
      }
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next].slice(0, 6));
  }, []);

  const [panelKey, setPanelKey] = useState(0);
  const draftKey = `weaver-draft-${threadId}`;
  const [input, setInput] = useState("");

  // استعادة المسودة عند العودة إلى المحادثة
  useEffect(() => {
    if (typeof window === "undefined") return;
    setInput(window.localStorage.getItem(`weaver-draft-${threadId}`) ?? "");
  }, [threadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (input.trim()) window.localStorage.setItem(draftKey, input);
    else window.localStorage.removeItem(draftKey);
  }, [draftKey, input]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);
  const messagesRef = useRef<UIMessage[]>([]);
  const initialMessages = loadedMessages;

  // متابعة تلقائية عند توقّف الجولة بسبب حد الخطوات/الوقت (بحد أقصى 6 جولات متتالية)
  const [autoContinue, setAutoContinue] = useState(true);
  const [pendingContinue, setPendingContinue] = useState(false);
  const autoRunsRef = useRef(0);
  const nextActionRef = useRef<string | null>(null);


  const persist = useCallback(
    async (all: UIMessage[]) => {
      try {
        await saveConversation({
          data: { projectId: threadId, messages: all as unknown as { role: string }[] },
        });
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
      } catch {
        toast.error("تعذّر حفظ المحادثة في السحابة");
      }
    },
    [queryClient, threadId],
  );

  const persistToolOutputs = useCallback(
    async (message: UIMessage) => {
      const parts = (Array.isArray(message.parts) ? message.parts : []) as unknown as AnyPart[];
      for (const part of parts) {
        const output = part["output"];
        if (!output) continue;
        try {
          if (part.type === "tool-write_spec") {
            await saveSpec({
              data: { projectId: threadId, spec: output as Record<string, unknown> },
            });
          } else if (part.type === "tool-build_task_graph") {
            const tasks = (output as { tasks?: unknown[] }).tasks ?? [];
            await saveTaskGraph({
              data: { projectId: threadId, tasks: tasks as never },
            });
          } else if (part.type === "tool-update_task") {
            const update = output as TaskUpdate;
            await updateTaskStatus({
              data: {
                projectId: threadId,
                taskKey: update.id,
                status: update.status,
                note: update.note ?? "",
              },
            });
          }
        } catch {
          /* تجاهل فشل حفظ عنصر واحد حتى لا تنقطع المحادثة */
        }
      }
    },
    [threadId],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: ({ messages: all, message }) => {
      void persist(all);
      void persistToolOutputs(message).then(() => setPanelKey((k) => k + 1));
      const meta = message.metadata as
        | { truncated?: boolean; incomplete?: boolean; complete?: boolean; nextAction?: string | null }
        | undefined;
      nextActionRef.current = meta?.nextAction ?? null;
      const assistantText = ((message.parts ?? []) as AnyPart[])
        .map((part) => (part.type === "text" ? String(part["text"] ?? "") : ""))
        .join(" ");
      const stalledByWords = /(?:اكتب\s+[«\"]?أكمل|أحتاج\s+(?:إلى\s+)?مراجعة|بانتظار\s+(?:المراجعة|الموافقة)|سأكمل\s+لاحق)/i.test(
        assistantText,
      );
      if (meta?.complete) {
        autoRunsRef.current = 0;
        setPendingContinue(false);
        toast.success("اكتمل البناء: الملفات مكتوبة، الفحص ناجح، والموقع منشور.");
        return;
      }
      if (meta?.truncated || meta?.incomplete || stalledByWords) setPendingContinue(true);
      else autoRunsRef.current = 0;
    },


    onError: (error) => {
      void persist(messagesRef.current);
      const message = error.message || "تعذّر الاتصال بالوكيل";
      if (message.includes("429")) toast.error("تجاوزت حد الطلبات، حاول بعد قليل.");
      else if (message.includes("402")) toast.error("انتهى رصيد الذكاء الاصطناعي في مساحة العمل.");
      else toast.error(message);
      setPendingContinue(true);
    },
  });

  const [background, setBackground] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  const isBusy = status === "submitted" || status === "streaming" || bgActive;

  // إرسال المهمة إلى العامل الخلفي الدائم: يكمل البناء حتى لو أُغلق المتصفح
  const submitBackground = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value) return;
      const history = [
        ...messagesRef.current,
        { id: `local-${Date.now()}`, role: "user", parts: [{ type: "text", text: value }] },
      ];
      void enqueueAgentJob({
        data: {
          projectId: threadId,
          messages: history as unknown as { role: string }[],
          model,
          mode,
          skills,
        },
      })
        .then(() => {
          setBgActive(true);
          toast.success("أُضيفت المهمة إلى طابور العامل الخلفي — يمكنك إغلاق المتصفح.");
          void queryClient.invalidateQueries({ queryKey: ["agent-jobs", threadId] });
        })
        .catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : "تعذّر جدولة المهمة"),
        );
      setInput("");
    },
    [mode, model, queryClient, skills, threadId],
  );

  // حفظ تلقائي مستمر: أي تغيّر في الرسائل يُحفظ بعد لحظة حتى لا يضيع شيء عند مغادرة الصفحة
  useEffect(() => {
    messagesRef.current = messages;
    if (messages.length === 0) return;
    const timer = setTimeout(() => void persist(messages), 1200);
    return () => clearTimeout(timer);
  }, [messages, persist]);

  // حماية من الخروج أثناء عمل الوكيل أو وجود مسودة غير مرسلة
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!isBusy && !input.trim()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isBusy, input]);

  // حفظ فوري عند إخفاء الصفحة (تبديل تبويب / إغلاق)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && messagesRef.current.length > 0) {
        void persist(messagesRef.current);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (!isBusy) textareaRef.current?.focus();
  }, [threadId, isBusy]);

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if ((!value && attachments.length === 0) || isBusy) return;
      if (background) {
        submitBackground(value);
        return;
      }
      if (messages.length === 0 && value) {
        void renameProject({ data: { projectId: threadId, title: titleFrom(value) } }).then(() =>
          queryClient.invalidateQueries({ queryKey: ["projects"] }),
        );
      }
      const files = attachments.map((file) => ({
        type: "file" as const,
        mediaType: file.mediaType,
        filename: file.filename,
        url: file.url,
      }));
      void sendMessage(
        { text: value || "حلّل الملفات المرفقة.", ...(files.length > 0 ? { files } : {}) },
        { body: { model, skills, mode } },
      );
      setInput("");
      setAttachments([]);
      if (typeof window !== "undefined") window.localStorage.removeItem(`weaver-draft-${threadId}`);
    },
    [attachments, background, isBusy, messages.length, mode, model, queryClient, sendMessage, skills, submitBackground, threadId],
  );

  // استئناف تلقائي بعد توقّف الجولة على حد الخطوات/الوقت
  useEffect(() => {
    if (!pendingContinue || isBusy) return;
    setPendingContinue(false);
    if (!autoContinue) return;
    if (autoRunsRef.current >= 12) {
      toast.warning("توقف الاستئناف التلقائي بعد 12 جولة للحماية — اضغط «أكمل البناء» للمتابعة.");
      return;
    }
    autoRunsRef.current += 1;
    const next = nextActionRef.current;
    toast.info(
      `استئناف تلقائي (${autoRunsRef.current}/12)${next ? ` — ${next}` : " — البناء لم يجتز بوابة الاكتمال بعد."}`,
    );
    const timer = window.setTimeout(() => {
      submit(
        `متابعة تنفيذ تلقائية: لا تشرح ولا تطلب مراجعة أو موافقة.${
          next ? ` الخطوة المطلوبة الآن: ${next}` : ""
        } أكمل الملفات المتبقية، شغّل run_checks وأصلح كل خطأ، ثم انشر عبر publish_site. لا تنهِ الجولة قبل تنفيذ أداة فعلية.`,
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoContinue, isBusy, pendingContinue, submit]);


  useEffect(() => {
    if (sentInitial.current) return;
    if (!initialPrompt) return;
    if (initialMessages.length > 0) return;
    sentInitial.current = true;
    submit(initialPrompt);
  }, [initialPrompt, initialMessages.length, submit]);


  return (
    <div className="flex h-full min-h-0">
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            {messages.length === 0 && (
              <p className="rounded-xl border border-dashed bg-surface/60 px-4 py-6 text-center text-sm text-muted-foreground">
                اكتب طلبك، وسيبدأ الوكيل من الاستقبال حتى المراقبة.
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex gap-3", message.role === "user" ? "justify-start" : "")}
              >
                {message.role === "user" ? (
                  <div className="ms-auto max-w-[85%] space-y-2">
                    <UserAttachments message={message} />
                    {message.parts.some((p) => p.type === "text") && (
                      <div className="rounded-2xl rounded-se-sm bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground shadow-soft">
                        {message.parts
                          .map((p) => (p.type === "text" ? p.text : ""))
                          .join("")
                          .trim()}
                      </div>
                    )}
                  </div>
                ) : (

                  <div className="w-full">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-md bg-primary/10 font-mono text-[10px] font-bold text-primary">
                        W
                      </span>
                      <span className="text-[12px] font-semibold text-muted-foreground">
                        Weaver
                      </span>
                    </div>
                    <MessageParts message={message} />
                  </div>
                )}
              </div>
            ))}
            <BackgroundJobs projectId={threadId} onActivity={setBgActive} />
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                يستقبل الطلب ويحلّل المتطلبات…
              </div>
            )}
            {!isBusy && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    autoRunsRef.current = 0;
                    submit("أكمل من حيث توقفت بالضبط، دون إعادة ما أنجزته.");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold hover:bg-surface"
                >
                  أكمل البناء
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={autoContinue}
                    onChange={(e) => setAutoContinue(e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  متابعة تلقائية عند بلوغ حد الخطوات
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={background}
                    onChange={(e) => setBackground(e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  تشغيل في الخلفية على الخادم
                </label>
              </div>
            )}


            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t bg-background/80 backdrop-blur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6"
          >
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <span
                    key={`${file.filename}-${index}`}
                    className="flex items-center gap-2 rounded-lg border bg-surface px-2 py-1.5 text-[11px]"
                  >
                    {file.mediaType.startsWith("image/") ? (
                      <img
                        src={file.url}
                        alt={file.filename}
                        className="size-8 rounded object-cover"
                      />
                    ) : (
                      <FileText className="size-4 text-primary" />
                    )}
                    <span className="max-w-40 truncate">{file.filename}</span>
                    <button
                      type="button"
                      aria-label={`إزالة ${file.filename}`}
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/40">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.txt,.md,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="grid size-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:bg-surface"
                aria-label="إرفاق ملف أو صورة"
              >
                <Paperclip className="size-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  if (e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    void addFiles(e.clipboardData.files);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                rows={1}
                placeholder="صف ما تريد بناءه… (يمكنك إرفاق صور أو PDF)"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-muted-foreground"
              />
              {isBusy ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="grid size-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:bg-surface"
                  aria-label="إيقاف"
                >
                  <Square className="size-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && attachments.length === 0}
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                  aria-label="إرسال"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ModePicker />
              <ModelPicker />
              <SkillsPicker />
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={background}
                  onChange={(e) => setBackground(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                خلفية دائمة
              </label>



              <p className="flex-1 text-center text-[11px] text-muted-foreground">
                المحادثات والمواصفات ورسوم المهام محفوظة في حسابك.
              </p>
            </div>
          </form>
        </div>
      </div>
      <aside className="hidden w-[360px] shrink-0 lg:block">
        <ProjectPanel projectId={threadId} refreshKey={panelKey} live={isBusy} />

      </aside>
    </div>
  );
}
