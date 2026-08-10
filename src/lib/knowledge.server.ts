import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";

/**
 * ذاكرة معرفية قابلة لإعادة الاستخدام.
 * كل ما يكتبه الوكيل بنجاح (ملفات، إصلاحات، قرارات) يُلتقط هنا،
 * وفي أي طلب لاحق يُسترجع الأقرب موضوعياً ويُحقن في السياق
 * حتى لا يُعاد اختراع نفس الكود أو تكرار نفس الخطأ.
 */

export type KnowledgeKind = "file" | "fix" | "decision" | "pattern";

export type KnowledgeEntry = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  path: string | null;
  language: string | null;
  tags: string[];
  summary: string | null;
  content: string;
  uses: number;
  updated_at: string;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "من",
  "في",
  "على",
  "الى",
  "إلى",
  "عن",
  "مع",
  "هذا",
  "هذه",
  "التي",
  "الذي",
  "اريد",
  "أريد",
  "يجب",
  "كل",
  "ثم",
  "قم",
  "لي",
  "لك",
  "هل",
]);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function languageOf(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    sql: "sql",
    py: "python",
    sh: "bash",
  };
  return map[ext] ?? ext ?? null;
}

/** كلمات مفتاحية معيارية تُستخدم للفهرسة والبحث معاً. */
export function keywords(input: string, limit = 14): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.toLowerCase().split(/[^\p{L}\p{N}_-]+/u)) {
    const word = raw.trim();
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

function pathTags(path: string) {
  return keywords(path.replace(/[/\\.]/g, " "), 8);
}

let schemaReady: Promise<void> | null = null;

/**
 * يضمن وجود جدول المعرفة على أي قاعدة (الإنتاج القديم لا يمرّ بسكربتات init).
 * يُنفَّذ مرة واحدة لكل عملية تشغيل.
 */
export function ensureKnowledgeSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS public.knowledge_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        project_id uuid,
        kind text NOT NULL DEFAULT 'file',
        title text NOT NULL,
        path text,
        language text,
        tags text[] NOT NULL DEFAULT '{}',
        summary text,
        content text NOT NULL,
        content_hash text NOT NULL,
        uses integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entries_dedupe ON public.knowledge_entries(user_id, kind, content_hash)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_entries_user_recent ON public.knowledge_entries(user_id, updated_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_entries_tags ON public.knowledge_entries USING gin(tags)`;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

/** يلتقط قطعة معرفة واحدة (لا يرمي أبداً — الالتقاط مساعد وليس مساراً حرجاً). */
export async function captureKnowledge(input: {
  userId: string;
  projectId: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string;
  summary?: string | null;
  path?: string | null;
  tags?: string[];
}): Promise<void> {
  try {
    const content = input.content.slice(0, 60_000);
    if (content.trim().length < 40) return;
    const path = input.path ?? null;
    const tags = Array.from(
      new Set([
        ...(input.tags ?? []),
        ...keywords(`${input.title} ${input.summary ?? ""}`, 10),
        ...(path ? pathTags(path) : []),
      ]),
    ).slice(0, 24);

    await ensureKnowledgeSchema();
    const sql = getSql();
    await sql`
      INSERT INTO public.knowledge_entries
        (user_id, project_id, kind, title, path, language, tags, summary, content, content_hash)
      VALUES (
        ${input.userId}, ${input.projectId}, ${input.kind}, ${input.title.slice(0, 300)},
        ${path}, ${path ? languageOf(path) : null}, ${tags},
        ${input.summary ?? null}, ${content}, ${hash(content)}
      )
      ON CONFLICT (user_id, kind, content_hash) DO UPDATE
        SET updated_at = now(),
            title = EXCLUDED.title,
            summary = COALESCE(EXCLUDED.summary, public.knowledge_entries.summary),
            tags = EXCLUDED.tags,
            project_id = COALESCE(EXCLUDED.project_id, public.knowledge_entries.project_id)
    `;
  } catch {
    // الذاكرة المعرفية اختيارية ولا يجوز أن تُفشل الكتابة أو الجولة
  }
}

/** بحث مرجَّح: تطابق الوسوم أولاً ثم العنوان/المسار ثم المحتوى. */
export async function searchKnowledge(input: {
  userId: string;
  query: string;
  limit?: number;
  kind?: KnowledgeKind;
  excludeProjectId?: string | null;
}): Promise<KnowledgeEntry[]> {
  try {
    const terms = keywords(input.query, 12);
    if (terms.length === 0) return [];
    const like = `%${terms.slice(0, 3).join("%")}%`;
    await ensureKnowledgeSchema();
    const sql = getSql();
    const rows = await sql<KnowledgeEntry[]>`
      SELECT id, kind, title, path, language, tags, summary, content, uses,
             updated_at::text AS updated_at,
             (
               cardinality(ARRAY(SELECT unnest(tags) INTERSECT SELECT unnest(${terms}::text[]))) * 3
               + CASE WHEN lower(title) LIKE ${like} THEN 4 ELSE 0 END
               + CASE WHEN lower(coalesce(path, '')) LIKE ${like} THEN 3 ELSE 0 END
               + CASE WHEN lower(content) LIKE ${like} THEN 1 ELSE 0 END
             ) AS rank
      FROM public.knowledge_entries
      WHERE user_id = ${input.userId}
        ${input.kind ? sql`AND kind = ${input.kind}` : sql``}
      ORDER BY rank DESC, updated_at DESC
      LIMIT ${Math.min(input.limit ?? 5, 20)}
    `;
    return rows.filter((row) => (row as unknown as { rank: number }).rank > 0);
  } catch {
    return [];
  }
}

export async function markKnowledgeUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const sql = getSql();
    await sql`UPDATE public.knowledge_entries SET uses = uses + 1 WHERE id = ANY(${ids}::uuid[])`;
  } catch {
    /* عدّاد الاستخدام إحصائي فقط */
  }
}

/** يبني مقطع سياق جاهزاً للحقن في رسالة النظام قبل بدء الجولة. */
export async function buildKnowledgeContext(input: {
  userId: string;
  query: string;
  limit?: number;
}): Promise<string> {
  const entries = await searchKnowledge({
    userId: input.userId,
    query: input.query,
    limit: input.limit ?? 4,
  });
  if (entries.length === 0) return "";
  const blocks = entries.map((entry) => {
    const head = [
      `• [${entry.kind}] ${entry.title}`,
      entry.path ? `المسار السابق: ${entry.path}` : null,
      entry.summary ? `الخلاصة: ${entry.summary}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const body = entry.content.slice(0, 1800);
    return `${head}\n\`\`\`${entry.language ?? ""}\n${body}\n\`\`\``;
  });
  return [
    "\n\n=== معرفة سابقة قابلة لإعادة الاستخدام (من عملك السابق) ===",
    "هذه مقاطع كتبتَها أو أصلحتَها من قبل ونجحت. أعد استخدامها وكيّفها بدل كتابتها من الصفر،",
    "ولا تكرّر خطأً سبق إصلاحه هنا. للبحث عن المزيد استخدم أداة recall_knowledge.",
    ...blocks,
  ].join("\n");
}
