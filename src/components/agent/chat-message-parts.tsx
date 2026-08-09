import { type UIMessage } from "ai";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CheckCircle2,
  FileCode2,
  Loader2,
  Terminal,
  XCircle,
  Brain,
} from "lucide-react";
import { toolDetail, toolFailed, toolLabel } from "@/lib/tool-display";
import { pushTerminalEvent } from "@/lib/terminal-bus";
import { cn } from "@/lib/utils";
import { type TaskUpdate } from "@/components/agent/project-cards";

type AnyPart = { type: string; [key: string]: unknown };

export function ReasoningBlock({ text, streaming }: { text: string; streaming: boolean }) {
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

export function ToolPending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-surface/70 px-3 py-2 text-[12px] text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function WorkspaceChip({
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

export function MessageParts({ message }: { message: UIMessage }) {
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