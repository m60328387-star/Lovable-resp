import { type UIMessage } from "ai";
import { FileText } from "lucide-react";

type AnyPart = { type: string; [key: string]: unknown };

export function UserAttachments({ message }: { message: UIMessage }) {
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