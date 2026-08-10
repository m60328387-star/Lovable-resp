import { gh, parseRepo, toBase64 } from "@/lib/github.server";

/** مسارات ممنوعة على وكيل التطوير الذاتي (أسرار وإعدادات حساسة). */
const BLOCKED = [
  /^\.env/i,
  /(^|\/)supabase\/config\.toml$/i,
  /(^|\/)src\/integrations\/supabase\/(client|client\.server|auth-middleware|auth-attacher|types)\.ts$/i,
  /(^|\/)\.github\//i,
  /(^|\/)node_modules\//i,
];

export type SelfRepo = { token: string; owner: string; repo: string };

export function getSelfRepo(): SelfRepo | null {
  const token = process.env["GITHUB_TOKEN"];
  const url = process.env["GITHUB_REPO_URL"];
  if (!token || !url) return null;
  try {
    const { owner, repo } = parseRepo(url);
    return { token, owner, repo };
  } catch {
    return null;
  }
}

export function assertAllowed(path: string) {
  const clean = path.replace(/^\/+/, "");
  if (clean.includes("..")) throw new Error("مسار غير صالح");
  if (BLOCKED.some((re) => re.test(clean))) {
    throw new Error(`المسار محمي ولا يمكن تعديله ذاتياً: ${clean}`);
  }
  return clean;
}

export async function selfBranch({ token, owner, repo }: SelfRepo): Promise<string> {
  const res = await gh(token, `/repos/${owner}/${repo}`);
  if (!res.ok) throw new Error(`تعذّر الوصول إلى مستودع Weaver [${res.status}]`);
  const info = (await res.json()) as { default_branch?: string };
  return info.default_branch || "main";
}

export async function selfList(
  repoCfg: SelfRepo,
  prefix: string,
): Promise<{ path: string; bytes: number }[]> {
  const branch = await selfBranch(repoCfg);
  const { token, owner, repo } = repoCfg;
  const res = await gh(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!res.ok) throw new Error(`تعذّر قراءة شجرة المستودع [${res.status}]`);
  const tree = (await res.json()) as { tree?: { path: string; type: string; size?: number }[] };
  const clean = prefix.replace(/^\/+/, "");
  return (tree.tree ?? [])
    .filter((n) => n.type === "blob" && (!clean || n.path.startsWith(clean)))
    .filter((n) => !/^node_modules\//.test(n.path))
    .slice(0, 400)
    .map((n) => ({ path: n.path, bytes: n.size ?? 0 }));
}

export async function selfRead(
  repoCfg: SelfRepo,
  path: string,
): Promise<{ path: string; found: boolean; content: string; sha?: string }> {
  const clean = path.replace(/^\/+/, "");
  const branch = await selfBranch(repoCfg);
  const { token, owner, repo } = repoCfg;
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  const res = await gh(
    token,
    `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return { path: clean, found: false, content: "" };
  const payload = (await res.json()) as { content?: string; sha?: string; encoding?: string };
  if (!payload.content) return { path: clean, found: false, content: "" };
  const binary = atob(payload.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const result: { path: string; found: boolean; content: string; sha?: string } = {
    path: clean,
    found: true,
    content: new TextDecoder().decode(bytes),
  };
  if (payload.sha) result.sha = payload.sha;
  return result;
}

export async function selfWrite(
  repoCfg: SelfRepo,
  path: string,
  content: string,
  message: string,
): Promise<{ path: string; commit: string; branch: string }> {
  const clean = assertAllowed(path);
  const problems = validateSelfSource(clean, content);
  if (problems.length) throw new Error(`رُفض الحفظ قبل الالتزام: ${problems.join(" | ")}`);
  const branch = await selfBranch(repoCfg);
  const { token, owner, repo } = repoCfg;
  const current = await selfRead(repoCfg, clean);
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  const res = await gh(token, `/repos/${owner}/${repo}/contents/${encoded}`, {
    method: "PUT",
    body: {
      message: message || `Weaver self-update: ${clean}`,
      content: toBase64(content),
      branch,
      ...(current.sha ? { sha: current.sha } : {}),
    },
  });
  if (!res.ok) throw new Error(`فشل حفظ ${clean} [${res.status}]: ${await res.text()}`);
  const out = (await res.json()) as { commit?: { sha?: string } };
  return { path: clean, commit: out.commit?.sha?.slice(0, 7) ?? "", branch };
}

/** ملفات نصية فقط للبحث والتحرير الذاتي. */
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md|yml|yaml|sh|html|sql|toml)$/i;

/** خريطة سريعة لكود المنصة: المجلدات وأهم الملفات بأحجامها. */
export async function selfMap(repoCfg: SelfRepo): Promise<{
  total: number;
  dirs: { dir: string; files: number; bytes: number }[];
  largest: { path: string; bytes: number }[];
}> {
  const files = await selfList(repoCfg, "");
  const dirs = new Map<string, { files: number; bytes: number }>();
  for (const f of files) {
    const dir = f.path.split("/").slice(0, 2).join("/") || ".";
    const entry = dirs.get(dir) ?? { files: 0, bytes: 0 };
    entry.files += 1;
    entry.bytes += f.bytes;
    dirs.set(dir, entry);
  }
  return {
    total: files.length,
    dirs: [...dirs.entries()]
      .map(([dir, v]) => ({ dir, ...v }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 40),
    largest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 25),
  };
}

/** بحث نصّي داخل كود المنصة مع أرقام الأسطر. */
export async function selfSearch(
  repoCfg: SelfRepo,
  query: string,
  prefix = "src",
  maxFiles = 40,
): Promise<{ query: string; hits: { path: string; line: number; text: string }[] }> {
  const needle = query.toLowerCase();
  const files = (await selfList(repoCfg, prefix))
    .filter((f) => TEXT_EXT.test(f.path) && f.bytes < 400_000)
    .slice(0, 250);
  const hits: { path: string; line: number; text: string }[] = [];
  let scanned = 0;
  for (const f of files) {
    if (scanned >= maxFiles || hits.length >= 80) break;
    const file = await selfRead(repoCfg, f.path);
    if (!file.found) continue;
    scanned += 1;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (line.toLowerCase().includes(needle)) {
        hits.push({ path: f.path, line: i + 1, text: line.trim().slice(0, 300) });
        if (hits.length >= 80) break;
      }
    }
  }
  return { query, hits };
}

/** يزيل النصوص والتعليقات حتى لا تُحسب الأقواس داخلها خطأً. */
function stripLiterals(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i += 1;
          break;
        }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          let depth = 1;
          out += "${";
          i += 2;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth += 1;
            if (src[i] === "}") depth -= 1;
            out += src[i];
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** بوابة ما قبل الالتزام: فحوص سلامة أساسية تمنع كسر المنصة. */
export function validateSelfSource(path: string, content: string): string[] {
  const problems: string[] = [];
  if (!content.trim()) problems.push("المحتوى فارغ");
  if (/<<<<<<<|>>>>>>>|^={7}$/m.test(content)) problems.push("يحتوي علامات دمج غير محلولة");
  if (/\.\.\.\s*(keep existing code|بقية الملف|إلخ)/i.test(content))
    problems.push("يحتوي محتوى مختصر بدل الكود الكامل");
  if (/\.(ts|tsx|js|jsx|mjs|cjs|css|json)$/i.test(path)) {
    const bare = /\.(css|json)$/i.test(path) ? content : stripLiterals(content);
    const pairs: [string, string][] = [
      ["{", "}"],
      ["(", ")"],
      ["[", "]"],
    ];
    for (const [open, close] of pairs) {
      const o = bare.split(open).length - 1;
      const c = bare.split(close).length - 1;
      if (o !== c) problems.push(`أقواس غير متوازنة ${open}${close} (${o}/${c})`);
    }
  }
  if (/\.json$/i.test(path)) {
    try {
      JSON.parse(content);
    } catch (e) {
      problems.push(`JSON غير صالح: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (/\.tsx?$/i.test(path)) {
    const imports = [...content.matchAll(/^import\s+[^;]*?from\s+["']([^"']+)["']/gm)].map(
      (m) => m[1],
    );
    const dup = imports.filter((s, i) => imports.indexOf(s) !== i);
    if (dup.length) problems.push(`استيراد مكرر: ${[...new Set(dup)].join(", ")}`);
    if (
      /^src\/routes\//.test(path) &&
      !/createFileRoute|createRootRoute|createServerFileRoute/.test(content)
    )
      problems.push("ملف مسار بلا createFileRoute — سيكسر التوجيه");
  }
  if (/\.(sh|mjs)$/i.test(path) && /\r\n/.test(content))
    problems.push("نهايات أسطر CRLF في سكربت تنفيذي");
  return problems;
}

/**
 * التزام ذرّي متعدد الملفات عبر Git Data API:
 * إمّا تُطبَّق كل الملفات في كوميت واحد أو لا يتغيّر شيء.
 */
export async function selfWriteMany(
  repoCfg: SelfRepo,
  files: { path: string; content: string }[],
  message: string,
): Promise<{ commit: string; branch: string; paths: string[] }> {
  if (!files.length) throw new Error("لا توجد ملفات للالتزام");
  const prepared = files.map((f) => {
    const clean = assertAllowed(f.path);
    const problems = validateSelfSource(clean, f.content);
    if (problems.length) throw new Error(`رُفض ${clean}: ${problems.join(" | ")}`);
    return { path: clean, content: f.content };
  });

  const { token, owner, repo } = repoCfg;
  const branch = await selfBranch(repoCfg);
  const refRes = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  if (!refRes.ok) throw new Error(`تعذّر قراءة المرجع [${refRes.status}]`);
  const ref = (await refRes.json()) as { object: { sha: string } };
  const baseSha = ref.object.sha;

  const commitRes = await gh(token, `/repos/${owner}/${repo}/git/commits/${baseSha}`);
  if (!commitRes.ok) throw new Error(`تعذّر قراءة الكوميت [${commitRes.status}]`);
  const baseCommit = (await commitRes.json()) as { tree: { sha: string } };

  const blobs: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  for (const f of prepared) {
    const blobRes = await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: { content: toBase64(f.content), encoding: "base64" },
    });
    if (!blobRes.ok) throw new Error(`فشل رفع ${f.path} [${blobRes.status}]`);
    const blob = (await blobRes.json()) as { sha: string };
    blobs.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const treeRes = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: { base_tree: baseCommit.tree.sha, tree: blobs },
  });
  if (!treeRes.ok) throw new Error(`فشل بناء الشجرة [${treeRes.status}]`);
  const tree = (await treeRes.json()) as { sha: string };

  const newCommitRes = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: { message: message || "Weaver self-update", tree: tree.sha, parents: [baseSha] },
  });
  if (!newCommitRes.ok) throw new Error(`فشل إنشاء الكوميت [${newCommitRes.status}]`);
  const newCommit = (await newCommitRes.json()) as { sha: string };

  const updateRes = await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: { sha: newCommit.sha, force: false },
  });
  if (!updateRes.ok) throw new Error(`فشل تحديث الفرع [${updateRes.status}] — لم يُطبَّق أي تغيير`);

  return { commit: newCommit.sha.slice(0, 7), branch, paths: prepared.map((f) => f.path) };
}

/** تحرير جراحي: استبدال مقطع نصّي داخل ملف منصة بدل إعادة كتابته كاملاً. */
export async function selfEdit(
  repoCfg: SelfRepo,
  path: string,
  edits: { find: string; replace: string }[],
  message: string,
): Promise<{ path: string; commit: string; branch: string; applied: number }> {
  const clean = assertAllowed(path);
  const file = await selfRead(repoCfg, clean);
  if (!file.found) throw new Error(`الملف غير موجود: ${clean}`);
  let next = file.content;
  let applied = 0;
  for (const edit of edits) {
    const count = next.split(edit.find).length - 1;
    if (count === 0)
      throw new Error(`لم يُعثر على النص المطلوب في ${clean}: ${edit.find.slice(0, 80)}`);
    if (count > 1)
      throw new Error(`النص المطلوب متكرر (${count}) في ${clean}؛ وسّع المقطع ليكون فريداً`);
    next = next.replace(edit.find, edit.replace);
    applied += 1;
  }
  const problems = validateSelfSource(clean, next);
  if (problems.length) throw new Error(`رُفض التعديل قبل الالتزام: ${problems.join(" | ")}`);
  const out = await selfWrite(repoCfg, clean, next, message);
  return { ...out, applied };
}
