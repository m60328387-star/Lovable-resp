import { getSql } from "@/lib/db";
import { routedCall, type RoutedContent, type TaskKind } from "@/lib/model-router.server";

/**
 * طبقة ذكاء Weaver: فهم أعمق وأسرع للمحتوى.
 * - خرائط مشروع ومخططات ملفات بدون قراءة كل شيء (توفير هائل للتوكينز).
 * - بحث كلمي مرتّب (BM25 مبسّط) + بحث دلالي اختياري عبر Embeddings.
 * - نداءات نموذج مساعد سريع للتلخيص والتحليل والرؤية.
 */

export type IntelFile = { path: string; content: string; version: number };

/** تجاوزات النماذج القادمة من لوحة إعدادات المنصة (بلا كود). */
let modelOverrides: { fast?: string; reasoning?: string; vision?: string } = {};

export function applyModelOverrides(next: {
  fastModel?: string;
  reasoningModel?: string;
  visionModel?: string;
}) {
  modelOverrides = {
    ...(next.fastModel ? { fast: next.fastModel } : {}),
    ...(next.reasoningModel ? { reasoning: next.reasoningModel } : {}),
    ...(next.visionModel ? { vision: next.visionModel } : {}),
  };
}

/** النموذج المساعد السريع للتلخيص/الاستخراج (رخيص وسريع). */
export function fastModelId() {
  return modelOverrides.fast || process.env["WEAVER_FAST_MODEL"] || "google/gemini-flash-latest";
}
/** نموذج التحليل العميق (تفكير) عند الحاجة لقرارات معمارية. */
export function reasoningModelId() {
  return (
    modelOverrides.reasoning ||
    process.env["WEAVER_REASONING_MODEL"] ||
    "deepseek/deepseek-chat-v3.1"
  );
}
/** نموذج الرؤية لتحليل الصور ولقطات الشاشة. */
export function visionModelId() {
  return modelOverrides.vision || process.env["WEAVER_VISION_MODEL"] || "google/gemini-pro-latest";
}

type ChatContent = RoutedContent;

/**
 * نداء مساعد قصير يمرّ عبر موجّه النماذج:
 * fast → Groq ثم Gemini ثم OpenRouter، vision → Gemini ثم OpenRouter،
 * reasoning → OpenRouter ثم Gemini. النموذج الممرّر هو تفضيل مسار OpenRouter.
 */
export async function llmCall(opts: {
  model: string;
  kind?: TaskKind;
  system?: string;
  content: ChatContent;
  maxTokens?: number;
}): Promise<string> {
  const result = await routedCall({
    kind: opts.kind ?? "fast",
    ...(opts.system ? { system: opts.system } : {}),
    content: opts.content,
    ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
    openRouterModel: opts.model,
  });
  return result.text;
}

/** نفس النداء لكن يعيد المزوّد والنموذج الفعليين (لعرضهما في نتيجة الأداة). */
export async function llmCallDetailed(opts: {
  model: string;
  kind: TaskKind;
  system?: string;
  content: ChatContent;
  maxTokens?: number;
}) {
  return routedCall({
    kind: opts.kind,
    ...(opts.system ? { system: opts.system } : {}),
    content: opts.content,
    ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
    openRouterModel: opts.model,
  });
}

// ───────────────────────── خرائط المشروع والمخططات ─────────────────────────

async function loadFiles(projectId: string): Promise<IntelFile[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT path, content, version FROM public.files
    WHERE project_id = ${projectId} ORDER BY path ASC
  `;
  return rows as unknown as IntelFile[];
}

/** مخطط ملف: العناوين، المعرّفات، الأقسام، الدوال، الأصناف — بدل المحتوى الكامل. */
export function outlineOf(path: string, content: string) {
  const lines = content.split("\n");
  const items: Array<{ line: number; kind: string; text: string }> = [];
  const push = (line: number, kind: string, text: string) => {
    if (items.length < 200) items.push({ line, kind, text: text.trim().slice(0, 160) });
  };
  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text) return;
    if (/\.(html?|htm)$/i.test(path)) {
      const section = text.match(
        /<(section|header|footer|nav|main|article|aside)\b[^>]*id="([^"]+)"/i,
      );
      if (section) return push(line, "section", `${section[1]}#${section[2]}`);
      const heading = text.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);
      if (heading) return push(line, `h${heading[1]}`, heading[2]!.replace(/<[^>]+>/g, ""));
      const id = text.match(/\sid="([^"]+)"/);
      if (id) return push(line, "id", id[1]!);
      return;
    }
    if (/\.css$/i.test(path)) {
      if (/^(:root|@media|@keyframes|\.[\w-]+|#[\w-]+)/.test(text) && text.includes("{")) {
        push(line, "rule", text.replace("{", ""));
      }
      return;
    }
    if (/\.(js|mjs|ts|tsx|jsx)$/i.test(path)) {
      const fn = text.match(/^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/);
      if (fn) return push(line, "function", fn[1]!);
      const cls = text.match(/^(?:export\s+)?class\s+([\w$]+)/);
      if (cls) return push(line, "class", cls[1]!);
      const cst = text.match(
        /^(?:export\s+)?(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\(|function)/,
      );
      if (cst) return push(line, "function", cst[1]!);
      return;
    }
    if (/\.md$/i.test(path)) {
      const md = text.match(/^(#{1,4})\s+(.*)$/);
      if (md) push(line, `h${md[1]!.length}`, md[2]!);
    }
  });
  return items;
}

/** خريطة كاملة للمشروع: كل ملف بحجمه ومخططه المختصر. */
export async function projectMap(projectId: string) {
  const files = await loadFiles(projectId);
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.content.length, 0),
    files: files.map((file) => ({
      path: file.path,
      version: file.version,
      bytes: file.content.length,
      lines: file.content.split("\n").length,
      outline: outlineOf(file.path, file.content).slice(0, 40),
    })),
  };
}

/** يقرأ مقطعاً محدداً من ملف بالأسطر — بديل سريع لقراءة الملف كاملاً. */
export async function readSlice(projectId: string, path: string, start: number, end: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT content FROM public.files
    WHERE project_id = ${projectId} AND path = ${path} LIMIT 1
  `;
  const content = (rows as unknown as Array<{ content: string }>)[0]?.content;
  if (content == null) return { path, found: false, text: "" };
  const lines = content.split("\n");
  const from = Math.max(1, start);
  const to = Math.min(lines.length, Math.max(from, end));
  return {
    path,
    found: true,
    from,
    to,
    totalLines: lines.length,
    text: lines.slice(from - 1, to).join("\n"),
  };
}

// ───────────────────────── البحث الكلمي المرتّب ─────────────────────────

/** بحث نصي مرتّب داخل ملفات المشروع مع مقتطفات وأرقام أسطر. */
export async function codeSearch(projectId: string, query: string, limit = 25) {
  const files = await loadFiles(projectId);
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .slice(0, 8);
  if (terms.length === 0) return { query, matches: [] };

  const matches: Array<{ path: string; line: number; score: number; text: string }> = [];
  for (const file of files) {
    const lines = file.content.split("\n");
    lines.forEach((raw, index) => {
      const lower = raw.toLowerCase();
      let score = 0;
      for (const term of terms) if (lower.includes(term)) score += 1;
      if (score === 0) return;
      if (lower.includes(query.toLowerCase())) score += 3;
      matches.push({ path: file.path, line: index + 1, score, text: raw.trim().slice(0, 220) });
    });
  }
  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { query, total: matches.length, matches: matches.slice(0, limit) };
}

// ───────────────────────── البحث الدلالي (Embeddings) ─────────────────────────

export type EmbeddingProvider = "openai" | "jina" | "voyage" | null;

/** يحدد مزوّد التضمين المتاح حسب المفاتيح المضبوطة. */
export function embeddingProvider(): EmbeddingProvider {
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["JINA_API_KEY"]) return "jina";
  if (process.env["VOYAGE_API_KEY"]) return "voyage";
  return null;
}

async function embed(texts: string[]): Promise<number[][]> {
  const provider = embeddingProvider();
  if (!provider)
    throw new Error("لا يوجد مفتاح تضمين (OPENAI_API_KEY أو JINA_API_KEY أو VOYAGE_API_KEY)");
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env["OPENAI_API_KEY"]}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    if (!res.ok)
      throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
  if (provider === "jina") {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env["JINA_API_KEY"]}`,
      },
      body: JSON.stringify({ model: "jina-embeddings-v3", input: texts }),
    });
    if (!res.ok)
      throw new Error(`Jina embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env["VOYAGE_API_KEY"]}`,
    },
    body: JSON.stringify({ model: "voyage-3-lite", input: texts }),
  });
  if (!res.ok)
    throw new Error(`Voyage embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

let embeddingsEnsured = false;
async function ensureEmbeddingsTable() {
  if (embeddingsEnsured) return;
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.file_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL,
      path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS file_chunks_project_idx ON public.file_chunks(project_id, path);
  `);
  embeddingsEnsured = true;
}

function chunkFile(content: string, size = 60) {
  const lines = content.split("\n");
  const chunks: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < lines.length; i += size) {
    const slice = lines
      .slice(i, i + size)
      .join("\n")
      .trim();
    if (slice) chunks.push({ start: i + 1, end: Math.min(lines.length, i + size), text: slice });
  }
  return chunks;
}

/** يبني فهرساً دلالياً لملفات المشروع (يتطلب مفتاح تضمين). */
export async function buildSemanticIndex(projectId: string) {
  await ensureEmbeddingsTable();
  const sql = getSql();
  const files = await loadFiles(projectId);
  await sql`DELETE FROM public.file_chunks WHERE project_id = ${projectId}`;
  let indexed = 0;
  for (const file of files) {
    const chunks = chunkFile(file.content).slice(0, 60);
    if (chunks.length === 0) continue;
    const vectors = await embed(chunks.map((c) => `${file.path}\n${c.text}`.slice(0, 6000)));
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      await sql`
        INSERT INTO public.file_chunks (project_id, path, chunk_index, start_line, end_line, text, embedding)
        VALUES (${projectId}, ${file.path}, ${i}, ${chunk.start}, ${chunk.end}, ${chunk.text},
                ${JSON.stringify(vectors[i] ?? [])}::jsonb)
      `;
      indexed += 1;
    }
  }
  return { ok: true, provider: embeddingProvider(), files: files.length, chunks: indexed };
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** بحث دلالي بالمعنى داخل فهرس المشروع. */
export async function semanticSearch(projectId: string, query: string, limit = 8) {
  await ensureEmbeddingsTable();
  const sql = getSql();
  const rows = (await sql`
    SELECT path, start_line, end_line, text, embedding FROM public.file_chunks
    WHERE project_id = ${projectId}
  `) as unknown as Array<{
    path: string;
    start_line: number;
    end_line: number;
    text: string;
    embedding: number[];
  }>;
  if (rows.length === 0) return { query, indexed: false, matches: [] };
  const [vector] = await embed([query]);
  const scored = rows
    .map((row) => ({
      path: row.path,
      from: row.start_line,
      to: row.end_line,
      score: Number(cosine(vector ?? [], row.embedding).toFixed(4)),
      text: row.text.slice(0, 700),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { query, indexed: true, matches: scored };
}
