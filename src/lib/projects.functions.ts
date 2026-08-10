import { createServerFn } from "@tanstack/react-start";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

const idInput = z.object({ projectId: z.string().uuid() });

async function ensureProfile(userId: string, email: string) {
  const displayName = email.split("@")[0] || "owner";
  const sql = getSql();
  await sql`
    INSERT INTO public.profiles (id, display_name)
    VALUES (${userId}, ${displayName})
    ON CONFLICT (id) DO NOTHING
  `;
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireWeaverAuth])
  .handler(async ({ context }) => {
    const sql = getSql();
    const rows = await sql`
      SELECT id, title, status, build_progress, next_action, deployed_url, updated_at
      FROM public.projects
      WHERE user_id = ${context.userId}
      ORDER BY updated_at DESC
    `;
    return rows as unknown as Array<{
      id: string;
      title: string;
      status: string;
      build_progress: number;
      next_action: string | null;
      deployed_url: string | null;
      updated_at: string;
    }>;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => z.object({ title: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureProfile(context.userId, context.owner.email);
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO public.projects (user_id, title, build_state)
      VALUES (
        ${context.userId},
        ${data.title},
        ${sql.json({ phase: "intake", completedSteps: [], updatedAt: new Date().toISOString() } as never)}
      )
      RETURNING id, title, status, build_progress, next_action, deployed_url, updated_at
    `;
    return row as unknown as {
      id: string;
      title: string;
      status: string;
      build_progress: number;
      next_action: string | null;
      deployed_url: string | null;
      updated_at: string;
    };
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), title: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    await sql`
      UPDATE public.projects
      SET title = ${data.title}, updated_at = now()
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const sql = getSql();
    await sql`
      DELETE FROM public.projects
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });

export type ConversationResult = {
  project: { id: string; title: string; status: string; buildProgress: number; nextAction: string | null; deployedUrl: string | null } | null;
  messages: Json[];
  tasks: Array<{
    task_key: string;
    title: string;
    layer: string;
    depends_on: string[];
    acceptance: string | null;
    verification: string[];
    status: string;
    note: string | null;
  }>;
  spec: Json | null;
};

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }): Promise<ConversationResult> => {
    const sql = getSql();
    const [messagesRows, projectRows, tasksRows, specRows] = await Promise.all([
      sql`
        SELECT parts
        FROM public.messages
        WHERE project_id = ${data.projectId}
        ORDER BY position ASC
      `,
      sql`
        SELECT id, title, status, build_progress, next_action, deployed_url
        FROM public.projects
        WHERE id = ${data.projectId} AND user_id = ${context.userId}
      `,
      sql`
        SELECT task_key, title, layer, depends_on, acceptance, verification, status, note
        FROM public.tasks
        WHERE project_id = ${data.projectId}
        ORDER BY position ASC
      `,
      sql`
        SELECT data, version
        FROM public.specs
        WHERE project_id = ${data.projectId}
        ORDER BY version DESC
        LIMIT 1
      `,
    ]);

    const projectRow = (projectRows as unknown as Array<{
      id: string;
      title: string;
      status: string;
      build_progress: number;
      next_action: string | null;
      deployed_url: string | null;
    }>)[0];

    return {
      project: projectRow
        ? {
            id: projectRow.id,
            title: projectRow.title,
            status: projectRow.status,
            buildProgress: projectRow.build_progress,
            nextAction: projectRow.next_action,
            deployedUrl: projectRow.deployed_url,
          }
        : null,
      messages: (messagesRows as unknown as Array<{ parts: Json }>).map((row) =>
        // Legacy rows were written double-encoded (a JSON string inside jsonb).
        typeof row.parts === "string" ? (JSON.parse(row.parts) as Json) : row.parts,
      ),
      tasks: tasksRows as unknown as ConversationResult["tasks"],
      spec: (specRows as unknown as Array<{ data: Json }>)[0]?.data ?? null,
    };
  });

export const saveConversation = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        messages: z.array(z.object({ role: z.string() }).passthrough()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const existing = await sql`
      SELECT count(*)::int AS count
      FROM public.messages
      WHERE project_id = ${data.projectId}
    `;
    const existingCount = (existing[0] as unknown as { count: number }).count ?? 0;

    if (data.messages.length === 0 || existingCount > data.messages.length) {
      return { ok: true, skipped: true };
    }

    // Atomic rewrite: concurrent autosaves previously interleaved their
    // DELETE/INSERT and left duplicated rows at the same position.
    await sql.begin(async (tx) => {
      await tx`DELETE FROM public.messages WHERE project_id = ${data.projectId}`;
      for (const [index, message] of data.messages.entries()) {
        await tx`
          INSERT INTO public.messages (project_id, user_id, role, parts, position)
          VALUES (
            ${data.projectId},
            ${context.userId},
            ${String(message.role)},
            ${tx.json(message as never)},
            ${index}
          )
        `;
      }
    });

    await sql`
      UPDATE public.projects SET updated_at = now()
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;

    return { ok: true };
  });

export const saveSpec = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: z.string().uuid(), spec: z.record(z.string(), z.unknown()) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const latest = await sql`
      SELECT version FROM public.specs
      WHERE project_id = ${data.projectId}
      ORDER BY version DESC LIMIT 1
    `;
    const nextVersion =
      ((latest[0] as unknown as { version: number } | undefined)?.version ?? 0) + 1;

    await sql`
      INSERT INTO public.specs (project_id, user_id, version, data)
      VALUES (
        ${data.projectId},
        ${context.userId},
        ${nextVersion},
        ${JSON.stringify(data.spec)}::jsonb
      )
    `;

    await sql`
      UPDATE public.projects SET status = 'spec', updated_at = now()
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  layer: z.string(),
  dependsOn: z.array(z.string()).default([]),
  acceptance: z.string().default(""),
  verification: z.array(z.string()).default([]),
});

export const saveTaskGraph = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), tasks: z.array(taskSchema) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.tasks.length === 0) return { ok: true };

    const sql = getSql();
    for (const [index, task] of data.tasks.entries()) {
      await sql`
        INSERT INTO public.tasks (
          project_id, user_id, task_key, title, layer, depends_on, acceptance, verification, position
        ) VALUES (
          ${data.projectId}, ${context.userId}, ${task.id}, ${task.title}, ${task.layer},
          ${task.dependsOn}, ${task.acceptance}, ${task.verification}, ${index}
        )
        ON CONFLICT (project_id, task_key) DO UPDATE SET
          title = EXCLUDED.title,
          layer = EXCLUDED.layer,
          depends_on = EXCLUDED.depends_on,
          acceptance = EXCLUDED.acceptance,
          verification = EXCLUDED.verification,
          position = EXCLUDED.position,
          updated_at = now()
      `;
    }

    await sql`
      UPDATE public.projects SET status = 'graph', updated_at = now()
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        taskKey: z.string(),
        status: z.string(),
        note: z.string().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    await sql`
      UPDATE public.tasks
      SET status = ${data.status}, note = ${data.note}, updated_at = now()
      WHERE project_id = ${data.projectId} AND task_key = ${data.taskKey}
    `;
    return { ok: true };
  });

export const getWorkspace = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const [filesRows, runsRows] = await Promise.all([
      sql`
        SELECT path, version, content, updated_at
        FROM public.files
        WHERE project_id = ${data.projectId}
        ORDER BY path ASC
      `,
      sql`
        SELECT id, kind, input, status, output, exit_code, created_at
        FROM public.runs
        WHERE project_id = ${data.projectId}
        ORDER BY created_at DESC
        LIMIT 50
      `,
    ]);

    const files = filesRows as unknown as Array<{
      path: string;
      version: number;
      content: string;
      updated_at: string;
    }>;
    const runs = runsRows as unknown as Array<{
      id: string;
      kind: string;
      input: Json;
      status: string;
      output: string | null;
      exit_code: number | null;
      created_at: string;
    }>;

    return {
      files: files.map((f) => ({
        path: f.path,
        version: f.version,
        bytes: f.content.length,
        content: f.content,
        updatedAt: f.updated_at,
      })),
      runs,
    };
  });
