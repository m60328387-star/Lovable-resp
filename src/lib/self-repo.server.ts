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
