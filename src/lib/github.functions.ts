import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";
import { gh, parseRepo, toBase64, type GhFile } from "@/lib/github.server";

const input = z.object({ projectId: z.string().uuid(), message: z.string().max(200).optional() });

export const pushWorkspaceToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const token = process.env["GITHUB_TOKEN"];
    const repoUrl = process.env["GITHUB_REPO_URL"];
    if (!token || !repoUrl) throw new Error("لم يتم ضبط GITHUB_TOKEN أو GITHUB_REPO_URL بعد.");
    const { owner, repo } = parseRepo(repoUrl);

    const { data: files, error } = await context.supabase
      .from("files")
      .select("path, content")
      .eq("project_id", data.projectId)
      .order("path", { ascending: true });
    if (error) throw new Error(error.message);
    const workspace = (files ?? []) as GhFile[];
    if (workspace.length === 0) throw new Error("مساحة العمل فارغة — لا يوجد ما يُرفع.");

    const repoRes = await gh(token, `/repos/${owner}/${repo}`);
    if (!repoRes.ok) {
      throw new Error(`تعذّر الوصول إلى المستودع [${repoRes.status}]: ${await repoRes.text()}`);
    }
    const repoInfo = (await repoRes.json()) as { default_branch: string };
    const branch = repoInfo.default_branch || "main";

    const pushed: string[] = [];
    for (const file of workspace) {
      const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
      const existing = await gh(
        token,
        `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
      );
      const sha = existing.ok ? ((await existing.json()) as { sha?: string }).sha : undefined;

      const res = await gh(token, `/repos/${owner}/${repo}/contents/${encodedPath}`, {
        method: "PUT",
        body: {
          message: data.message?.trim() || `Weaver: تحديث ${file.path}`,
          content: toBase64(file.content),
          branch,
          ...(sha ? { sha } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`فشل رفع ${file.path} [${res.status}]: ${await res.text()}`);
      }
      pushed.push(file.path);
    }

    await context.supabase.from("runs").insert({
      project_id: data.projectId,
      user_id: context.userId,
      kind: "git",
      input: { command: `git push ${owner}/${repo}:${branch}`, reason: "رفع مساحة العمل إلى GitHub" },
      status: "passed",
      exit_code: 0,
      output: JSON.stringify({ ok: true, branch, files: pushed }),
    });

    return { ok: true as const, repo: `${owner}/${repo}`, branch, count: pushed.length };
  });
