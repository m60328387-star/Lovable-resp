import { useState } from "react";
import { KeyRound, Image as ImageIcon, Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { toast } from "sonner";

import { setProjectSecret } from "@/lib/project-secrets.functions";

export type AskField = {
  name: string;
  label: string;
  type?: "text" | "secret" | "choice" | "image" | "file";
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

export type AskUserPayload = {
  awaiting?: boolean;
  reason?: string;
  fields?: AskField[];
};

export type AskAttachment = { type: "file"; mediaType: string; filename: string; url: string };

const MAX_BYTES = 4 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

/**
 * بطاقة أسئلة تفاعلية: يطرحها وكيل البناء عندما تنقص معلومة ضرورية
 * (توكن سري، اختيار، نص، أو صور). الأسرار تُحفظ في مفاتيح المشروع ولا تظهر في المحادثة.
 */
export function AskUserCard({
  payload,
  projectId,
  disabled,
  onAnswer,
}: {
  payload: AskUserPayload;
  projectId: string;
  disabled: boolean;
  onAnswer: (text: string, files: AskAttachment[]) => void;
}) {
  const fields = (payload.fields ?? []).filter((f) => f && f.name);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, AskAttachment[]>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (fields.length === 0) return null;

  const setValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const addFiles = async (name: string, list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: AskAttachment[] = [];
    for (const file of Array.from(list).slice(0, 6)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: الحجم أكبر من 4MB`);
        continue;
      }
      next.push({
        type: "file",
        mediaType: file.type || "application/octet-stream",
        filename: file.name,
        url: await readAsDataUrl(file),
      });
    }
    setFiles((prev) => ({ ...prev, [name]: [...(prev[name] ?? []), ...next].slice(0, 6) }));
  };

  const submit = async () => {
    const lines: string[] = [];
    const attachments: AskAttachment[] = [];

    for (const field of fields) {
      const type = field.type ?? "text";
      if (type === "image" || type === "file") {
        const picked = files[field.name] ?? [];
        if (picked.length === 0) {
          if (field.required !== false) {
            toast.error(`مطلوب: ${field.label}`);
            return;
          }
          continue;
        }
        attachments.push(...picked);
        lines.push(`- ${field.label}: أُرفقت ${picked.length} ملف/صورة.`);
        continue;
      }

      const value = (values[field.name] ?? "").trim();
      if (!value) {
        if (field.required !== false) {
          toast.error(`مطلوب: ${field.label}`);
          return;
        }
        continue;
      }
      if (type === "secret") {
        lines.push(`- ${field.label}: محفوظ بأمان باسم ${field.name} (اقرأه عبر env_get).`);
      } else {
        lines.push(`- ${field.label}: ${value}`);
      }
    }

    setSending(true);
    try {
      for (const field of fields) {
        if ((field.type ?? "text") !== "secret") continue;
        const value = (values[field.name] ?? "").trim();
        if (!value) continue;
        await setProjectSecret({ data: { projectId, name: field.name, value } });
      }
    } catch (error) {
      setSending(false);
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ المفتاح السري");
      return;
    }

    setSending(false);
    setSent(true);
    onAnswer(
      `إجابات على أسئلتك:\n${lines.join("\n")}\n\nأكمل البناء الآن بلا توقف باستخدام هذه المعلومات.`,
      attachments,
    );
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <MessageCircleQuestion className="size-4 text-primary" />
        <span>الوكيل يحتاج معلومات لإكمال البناء</span>
      </div>
      {payload.reason && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{payload.reason}</p>
      )}

      <div className="space-y-3">
        {fields.map((field) => {
          const type = field.type ?? "text";
          return (
            <div key={field.name} className="space-y-1">
              <label className="flex items-center gap-1.5 text-[12px] font-medium">
                {type === "secret" && <KeyRound className="size-3.5 text-primary" />}
                {(type === "image" || type === "file") && (
                  <ImageIcon className="size-3.5 text-primary" />
                )}
                {field.label}
              </label>

              {type === "choice" && (field.options ?? []).length > 0 ? (
                <select
                  disabled={sent || disabled}
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
                >
                  <option value="">اختر…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : type === "image" || type === "file" ? (
                <div className="space-y-1">
                  <input
                    type="file"
                    multiple
                    disabled={sent || disabled}
                    accept={type === "image" ? "image/*" : undefined}
                    onChange={(event) => void addFiles(field.name, event.target.files)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-[12px] file:me-2 file:rounded-md file:border-0 file:bg-surface-strong file:px-2 file:py-1 file:text-[11px]"
                  />
                  {(files[field.name] ?? []).length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {(files[field.name] ?? []).map((f) => f.filename).join(" · ")}
                    </p>
                  )}
                </div>
              ) : (
                <input
                  type={type === "secret" ? "password" : "text"}
                  dir={type === "secret" ? "ltr" : undefined}
                  autoComplete="off"
                  disabled={sent || disabled}
                  placeholder={field.placeholder ?? ""}
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
                />
              )}

              {type === "secret" && (
                <p className="text-[11px] text-muted-foreground">
                  يُحفظ في مفاتيح المشروع المشفّرة باسم{" "}
                  <code dir="ltr" className="font-mono">
                    {field.name}
                  </code>{" "}
                  ولا يظهر في المحادثة ولا في الكود.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={sent || sending || disabled}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {sent ? "أُرسلت الإجابات" : "إرسال ومتابعة البناء"}
      </button>
    </div>
  );
}
