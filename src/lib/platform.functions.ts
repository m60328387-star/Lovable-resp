import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWeaverAuth } from "@/lib/weaver-auth";

/**
 * وظائف «تطوير المنصة»: تصفّح كود Weaver، اقتراح تغييرات بمراجعة Diff،
 * اعتمادها أو رفضها، النشر والتراجع، والإعدادات وتعليمات الوكيل بلا كود.
 */

export type PlatformFile = { path: string; bytes: number };

export type ChangeFile = { path: string; before: string; after: string };

export type PlatformChangeView = {
  id: string;
  title: string;
  description: string;
  status: string;
  files: ChangeFile[];
  commits: string[];
  error: string | null;
  createdAt: string;
  appliedAt: string | null;
};

const mapChange = (r: Record<string, unknown>): PlatformChangeView => ({
  id: String(r["id"]),
  title: String(r["title"] ?? ""),
  description: String(r["description"] ?? ""),
  status: String(r["status"] ?? "pending"),
  files: (r["files"] as ChangeFile[]) ?? [],
  commits: (r["commits"] as string[]) ?? [],
  error: (r["error"] as string | null) ?? null,
  createdAt: String(r["created_at"]),
  appliedAt: r["applied_at"] ? String(r["applied_at"]) : null,
});

/** يسرد ملفات كود المنصة من المستودع. */
export const listPlatformFiles = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { prefix?: string }) => z.object({ prefix: z.string().optional() }).parse(input))
  .handler(async ({ data }): Promise<PlatformFile[]> => {
    const { getSelfRepo, selfList } = await import("@/lib/self-repo.server");
    const repo = getSelfRepo();
    if (!repo) throw new Error("مستودع المنصة غير مضبوط (GITHUB_TOKEN و GITHUB_REPO_URL)");
    return selfList(repo, data.prefix ?? "src/");
  });

/** يقرأ ملفاً من كود المنصة. */
export const readPlatformFile = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { path: string }) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { getSelfRepo, selfRead } = await import("@/lib/self-repo.server");
    const { isSensitivePath } = await import("@/lib/platform.server");
    const repo = getSelfRepo();
    if (!repo) throw new Error("مستودع المنصة غير مضبوط");
    const file = await selfRead(repo, data.path);
    return { ...file, sensitive: isSensitivePath(data.path) };
  });

/** يسجّل تغييراً مقترحاً على المنصة (بلا كتابة) لعرضه كـDiff قبل الاعتماد. */
export const proposePlatformChange = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { title: string; description?: string; files: { path: string; after: string }[] }) =>
    z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        files: z.array(z.object({ path: z.string().min(1), after: z.string() })).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables } = await import("@/lib/platform.server");
    const { getSelfRepo, selfRead, assertAllowed } = await import("@/lib/self-repo.server");
    await ensurePlatformTables();
    const repo = getSelfRepo();
    if (!repo) throw new Error("مستودع المنصة غير مضبوط");

    const files: ChangeFile[] = [];
    for (const f of data.files.slice(0, 20)) {
      const clean = assertAllowed(f.path);
      const current = await selfRead(repo, clean);
      files.push({ path: clean, before: current.content, after: f.after });
    }

    const sql = getSql();
    const rows = await sql`
      INSERT INTO public.platform_changes (user_id, title, description, files)
      VALUES (${context.userId}, ${data.title}, ${data.description ?? ""}, ${JSON.stringify(files)}::jsonb)
      RETURNING *
    `;
    return mapChange(rows[0] as Record<string, unknown>);
  });

/** يسرد التغييرات المقترحة على المنصة. */
export const listPlatformChanges = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async ({ context }): Promise<PlatformChangeView[]> => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables } = await import("@/lib/platform.server");
    await ensurePlatformTables();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM public.platform_changes
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC LIMIT 60
    `;
    return rows.map((r) => mapChange(r as Record<string, unknown>));
  });

/** يعتمد تغييراً ويكتبه فعلياً على مستودع المنصة. */
export const approvePlatformChange = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { changeId: string; confirmSensitive?: boolean }) =>
    z.object({ changeId: z.string().uuid(), confirmSensitive: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables, isSensitivePath } = await import("@/lib/platform.server");
    const { getSelfRepo, selfWrite } = await import("@/lib/self-repo.server");
    await ensurePlatformTables();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM public.platform_changes
      WHERE id = ${data.changeId} AND user_id = ${context.userId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error("التغيير غير موجود");
    if (String(row["status"]) !== "pending") throw new Error("هذا التغيير غير معلّق");

    const files = (row["files"] as ChangeFile[]) ?? [];
    if (files.some((f) => isSensitivePath(f.path)) && !data.confirmSensitive) {
      throw new Error("هذا التغيير يمسّ ملفات حسّاسة — يلزم تأكيد مزدوج");
    }

    const repo = getSelfRepo();
    if (!repo) throw new Error("مستودع المنصة غير مضبوط");

    const commits: string[] = [];
    try {
      for (const f of files) {
        const out = await selfWrite(repo, f.path, f.after, `Weaver: ${String(row["title"])} — ${f.path}`);
        commits.push(`${f.path}@${out.commit}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`
        UPDATE public.platform_changes SET status = 'failed', error = ${message}, commits = ${JSON.stringify(commits)}::jsonb
        WHERE id = ${data.changeId}
      `;
      throw error;
    }

    const updated = await sql`
      UPDATE public.platform_changes
      SET status = 'approved', commits = ${JSON.stringify(commits)}::jsonb, applied_at = now(), error = NULL
      WHERE id = ${data.changeId}
      RETURNING *
    `;
    return mapChange(updated[0] as Record<string, unknown>);
  });

/** يرفض تغييراً مقترحاً. */
export const rejectPlatformChange = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { changeId: string }) => z.object({ changeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    await sql`
      UPDATE public.platform_changes SET status = 'rejected'
      WHERE id = ${data.changeId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });

/** يتراجع عن تغيير مُعتمد بإعادة كتابة المحتوى السابق لكل ملف. */
export const revertPlatformChange = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { changeId: string }) => z.object({ changeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const { getSelfRepo, selfWrite } = await import("@/lib/self-repo.server");
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM public.platform_changes
      WHERE id = ${data.changeId} AND user_id = ${context.userId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error("التغيير غير موجود");
    const repo = getSelfRepo();
    if (!repo) throw new Error("مستودع المنصة غير مضبوط");

    const files = (row["files"] as ChangeFile[]) ?? [];
    for (const f of files) {
      await selfWrite(repo, f.path, f.before, `Weaver revert: ${f.path}`);
    }
    await sql`UPDATE public.platform_changes SET status = 'reverted' WHERE id = ${data.changeId}`;
    return { ok: true, reverted: files.length };
  });

/** ينشر آخر إصدار من المنصة على الخادم. */
export const deployPlatform = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { action?: "deploy" | "rollback"; ref?: string }) =>
    z.object({ action: z.enum(["deploy", "rollback"]).optional(), ref: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { runDeployHook, recordDeploy } = await import("@/lib/platform.server");
    const action = data.action ?? "deploy";
    const result = await runDeployHook(action, data.ref);
    await recordDeploy(context.userId, action, result);
    return result;
  });

/** سجل عمليات النشر. */
export const listDeploys = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async () => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables } = await import("@/lib/platform.server");
    await ensurePlatformTables();
    const sql = getSql();
    const rows = await sql`SELECT * FROM public.platform_deploys ORDER BY created_at DESC LIMIT 25`;
    return rows.map((r) => ({
      id: String(r["id"]),
      status: String(r["status"]),
      kind: String(r["kind"]),
      log: String(r["log"] ?? "").slice(0, 4000),
      createdAt: String(r["created_at"]),
    }));
  });

// ============ الإعدادات بلا كود ============

export const getPlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async () => {
    const { loadPlatformSettings } = await import("@/lib/platform.server");
    return loadPlatformSettings();
  });

export const savePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        primaryModel: z.string().min(1),
        fastModel: z.string().min(1),
        reasoningModel: z.string().min(1),
        visionModel: z.string().min(1),
        maxSteps: z.number().int().min(10).max(400),
        maxTokens: z.number().int().min(4000).max(200000),
        maxRetries: z.number().int().min(0).max(10),
        brandName: z.string().min(1).max(40),
        brandTagline: z.string().max(60),
        promptOverride: z.string().max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { savePlatformSettingsRow } = await import("@/lib/platform.server");
    return savePlatformSettingsRow(data);
  });

// ============ إصدارات تعليمات الوكيل ============

export type PromptVersionView = {
  id: string;
  label: string;
  content: string;
  active: boolean;
  createdAt: string;
};

export const listPromptVersions = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async ({ context }): Promise<PromptVersionView[]> => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables } = await import("@/lib/platform.server");
    await ensurePlatformTables();
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM public.prompt_versions WHERE user_id = ${context.userId}
      ORDER BY created_at DESC LIMIT 40
    `;
    return rows.map((r) => ({
      id: String(r["id"]),
      label: String(r["label"] ?? ""),
      content: String(r["content"] ?? ""),
      active: Boolean(r["active"]),
      createdAt: String(r["created_at"]),
    }));
  });

export const savePromptVersion = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { label: string; content: string; activate?: boolean }) =>
    z.object({ label: z.string().min(1).max(80), content: z.string().max(20000), activate: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables } = await import("@/lib/platform.server");
    await ensurePlatformTables();
    const sql = getSql();
    if (data.activate) {
      await sql`UPDATE public.prompt_versions SET active = false WHERE user_id = ${context.userId}`;
    }
    const rows = await sql`
      INSERT INTO public.prompt_versions (user_id, label, content, active)
      VALUES (${context.userId}, ${data.label}, ${data.content}, ${Boolean(data.activate)})
      RETURNING id
    `;
    return { ok: true, id: String(rows[0]?.["id"] ?? "") };
  });

export const activatePromptVersion = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { id: string | null }) => z.object({ id: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    await sql`UPDATE public.prompt_versions SET active = false WHERE user_id = ${context.userId}`;
    if (data.id) {
      await sql`UPDATE public.prompt_versions SET active = true WHERE id = ${data.id} AND user_id = ${context.userId}`;
    }
    return { ok: true };
  });

// ============ نسخ احتياطي واستعادة ============

/** يصدّر نسخة كاملة (مشاريع، ملفات، رسائل، مهام، ذاكرة) كـJSON للتنزيل أو الاستعادة. */
export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    const [projects, files, messages, tasks, memory] = await Promise.all([
      sql`SELECT * FROM public.projects WHERE user_id = ${context.userId}`,
      sql`SELECT * FROM public.files WHERE user_id = ${context.userId}`,
      sql`SELECT * FROM public.messages WHERE user_id = ${context.userId}`,
      sql`SELECT * FROM public.tasks WHERE user_id = ${context.userId}`,
      sql`SELECT * FROM public.project_memory WHERE user_id = ${context.userId}`,
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        projects: projects.length,
        files: files.length,
        messages: messages.length,
        tasks: tasks.length,
        memory: memory.length,
      },
      data: { projects, files, messages, tasks, memory },
    };
  });

/** يستعيد ملفات المشاريع من نسخة احتياطية سابقة (لا يحذف شيئاً، يدمج). */
export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { payload: string }) => z.object({ payload: z.string().min(2) }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    let parsed: {
      data?: {
        projects?: Record<string, unknown>[];
        files?: Record<string, unknown>[];
      };
    };
    try {
      parsed = JSON.parse(data.payload) as typeof parsed;
    } catch {
      throw new Error("ملف النسخة غير صالح");
    }

    const projects = parsed.data?.projects ?? [];
    const files = parsed.data?.files ?? [];
    let restoredProjects = 0;
    let restoredFiles = 0;

    for (const p of projects.slice(0, 500)) {
      await sql`
        INSERT INTO public.projects (id, user_id, title, summary, status, slug, published)
        VALUES (${String(p["id"])}, ${context.userId}, ${String(p["title"] ?? "مشروع مستعاد")},
                ${(p["summary"] as string | null) ?? null}, ${String(p["status"] ?? "intake")},
                ${(p["slug"] as string | null) ?? null}, ${Boolean(p["published"])})
        ON CONFLICT (id) DO NOTHING
      `;
      restoredProjects += 1;
    }

    for (const f of files.slice(0, 5000)) {
      await sql`
        INSERT INTO public.files (project_id, user_id, path, content, version)
        VALUES (${String(f["project_id"])}, ${context.userId}, ${String(f["path"])},
                ${String(f["content"] ?? "")}, ${Number(f["version"] ?? 1)})
        ON CONFLICT DO NOTHING
      `;
      restoredFiles += 1;
    }

    return { ok: true, restoredProjects, restoredFiles };
  });

/** أخطاء موحّدة: مهام خلفية فاشلة + عمليات نشر فاشلة، لعرضها في لوحة واحدة. */
export const listPlatformErrors = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensurePlatformTables } = await import("@/lib/platform.server");
    await ensurePlatformTables();
    const sql = getSql();
    const jobs = await sql`
      SELECT id, project_id, error, created_at FROM public.agent_jobs
      WHERE user_id = ${context.userId} AND status = 'error' AND error IS NOT NULL
      ORDER BY created_at DESC LIMIT 20
    `.catch(() => []);
    const deploys = await sql`
      SELECT id, log, created_at FROM public.platform_deploys
      WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10
    `.catch(() => []);
    return {
      jobs: jobs.map((r) => ({
        id: String(r["id"]),
        projectId: (r["project_id"] as string | null) ?? null,
        message: String(r["error"] ?? "").slice(0, 800),
        createdAt: String(r["created_at"]),
      })),
      deploys: deploys.map((r) => ({
        id: String(r["id"]),
        message: String(r["log"] ?? "").slice(-800),
        createdAt: String(r["created_at"]),
      })),
    };
  });
