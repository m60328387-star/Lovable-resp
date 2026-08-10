import { createServerFn } from "@tanstack/react-start";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";
import { z } from "zod";
import { runChecks } from "@/lib/verify.server";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064A]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "site";
}

export const getPublishState = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const sql = getSql();
    const [row] = await sql`
      SELECT slug, published, published_at, title
      FROM public.projects
      WHERE id = ${data.projectId}
    `;
    if (!row) throw new Error("المشروع غير موجود");
    return row as {
      slug: string | null;
      published: boolean;
      published_at: string | null;
      title: string;
    };
  });

/** ينشر مساحة عمل المشروع كموقع عام على مسار /s/<slug>. */
export const publishProject = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        slug: z.string().min(1).max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sql = getSql();
    const [project] = await sql`
      SELECT id, title, slug
      FROM public.projects
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    if (!project) throw new Error("المشروع غير موجود");
    const {
      id,
      title,
      slug: existingSlug,
    } = project as unknown as { id: string; title: string; slug: string | null };

    const files = await sql`
      SELECT path, content
      FROM public.files
      WHERE project_id = ${data.projectId}
      ORDER BY path ASC
    `;
    const workspace = files as unknown as Array<{ path: string; content: string }>;
    const count = workspace.length;
    if (!count) throw new Error("لا توجد ملفات في مساحة العمل — اكتب الملفات أولاً ثم انشر.");
    if (!workspace.some((file) => file.path === "index.html")) {
      throw new Error("لا يوجد index.html — لا يمكن نشر موقع بلا صفحة دخول.");
    }
    const styles = workspace.find((f) => f.path.endsWith("styles.css"));
    if (styles && styles.content.trim().length < 400) {
      throw new Error("ملف الأنماط شبه فارغ — أكمل التصميم قبل النشر.");
    }
    // الفحص يجري على الملفات الحالية لحظة النشر (لا نعتمد على فحص قديم قد يسبق تعديلات).
    const report = runChecks(workspace);
    await sql`
      INSERT INTO public.runs (project_id, kind, status, output)
      VALUES (${data.projectId}, 'check', ${report.ok ? "passed" : "failed"}, ${report.summary})
    `.catch(() => undefined);
    if (!report.ok) throw new Error(`فشل فحص الجودة: ${report.summary}`);

    const slug = data.slug ? slugify(data.slug) : (existingSlug ?? slugify(title));
    for (let i = 0; i < 25; i++) {
      const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
      try {
        await sql`
          UPDATE public.projects
          SET slug = ${candidate}, published = true, published_at = now(), status = 'deployed', updated_at = now()
          WHERE id = ${id} AND user_id = ${context.userId}
        `;
        return { slug: candidate, url: `/s/${candidate}`, files: count };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("duplicate")) throw error;
      }
    }
    throw new Error("تعذّر إيجاد عنوان متاح للنشر");
  });

export const unpublishProject = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sql = getSql();
    await sql`
      UPDATE public.projects
      SET published = false, updated_at = now()
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });
