import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

export type CustomSkill = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  prompt: string;
  enabled: boolean;
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `skill-${Date.now().toString(36)}`;

/** يسرد المهارات المخصّصة للمالك. */
export const listCustomSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomSkill[]> => {
    const { data, error } = await context.supabase
      .from("custom_skills")
      .select("id, slug, name, icon, description, prompt, enabled")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CustomSkill[];
  });

/** ينشئ أو يحدّث مهارة مخصّصة (skill-creator). */
export const saveCustomSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(80),
        icon: z.string().min(1).max(40).default("Puzzle"),
        description: z.string().max(300).default(""),
        prompt: z.string().min(10).max(20000),
        enabled: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      slug: slugify(data.name),
      name: data.name,
      icon: data.icon,
      description: data.description,
      prompt: data.prompt,
      enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("custom_skills")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("custom_skills")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCustomSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("custom_skills").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
