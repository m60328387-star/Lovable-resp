import { createServerFn } from "@tanstack/react-start";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";
import { z } from "zod";

/** يسرد إصدارات ملف داخل مساحة عمل المشروع. */
export const listFileVersions = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), path: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const rows = await sql`
      SELECT id, version, content, created_at
      FROM public.file_versions
      WHERE project_id = ${data.projectId} AND path = ${data.path}
      ORDER BY version DESC
      LIMIT 30
    `;
    return (
      rows as unknown as Array<{ id: string; version: number; content: string; created_at: string }>
    ).map((row) => ({
      id: row.id,
      version: row.version,
      bytes: row.content.length,
      createdAt: row.created_at,
    }));
  });

/** يرجع بملف إلى إصدار سابق (مع حفظ الحالة الحالية كإصدار جديد قبل الاستبدال). */
export const restoreFileVersion = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        path: z.string().min(1),
        versionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const [snapshot] = await sql`
      SELECT content, version
      FROM public.file_versions
      WHERE id = ${data.versionId} AND project_id = ${data.projectId}
    `;
    if (!snapshot) throw new Error("إصدار الملف غير موجود");

    const { content, version } = snapshot as unknown as { content: string; version: number };

    const [current] = await sql`
      SELECT id, content, version
      FROM public.files
      WHERE project_id = ${data.projectId} AND path = ${data.path}
    `;

    if (current) {
      const {
        id,
        content: currentContent,
        version: currentVersion,
      } = current as unknown as {
        id: string;
        content: string;
        version: number;
      };
      await sql`
        INSERT INTO public.file_versions (project_id, user_id, path, content, version)
        VALUES (${data.projectId}, ${context.userId}, ${data.path}, ${currentContent}, ${currentVersion})
      `;
      await sql`
        UPDATE public.files
        SET content = ${content}, version = ${currentVersion + 1}, updated_at = now()
        WHERE id = ${id}
      `;
      return { path: data.path, restoredFrom: version, version: currentVersion + 1 };
    }

    await sql`
      INSERT INTO public.files (project_id, user_id, path, content)
      VALUES (${data.projectId}, ${context.userId}, ${data.path}, ${content})
    `;
    return { path: data.path, restoredFrom: version, version: 1 };
  });
