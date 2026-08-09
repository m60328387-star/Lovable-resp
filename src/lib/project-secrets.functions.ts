import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

function mask(value: string) {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}

/** يسرد أسماء مفاتيح/متغيّرات المشروع مع قيم مقنّعة. */
export const listProjectSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_secrets")
      .select("id, name, value, updated_at")
      .eq("project_id", data.projectId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      masked: mask(row.value),
      updatedAt: row.updated_at,
    }));
  });

export const setProjectSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "الاسم يجب أن يكون بصيغة MY_KEY"),
        value: z.string().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_secrets").upsert(
      {
        project_id: data.projectId,
        user_id: context.userId,
        name: data.name,
        value: data.value,
      },
      { onConflict: "project_id,name" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProjectSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_secrets")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
