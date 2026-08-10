import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/weaver-auth";
import { z } from "zod";

export const pushWorkspaceToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid(), message: z.string().max(200).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: files, error } = await context.supabase
      .from("files")
      .select("path, content")
      .eq("project_id", data.projectId)
      .limit(1);
    if (error) throw new Error(error.message);
    const workspace = files ?? [];
    if (workspace.length === 0) throw new Error("مساحة العمل فارغة — لا يوجد ما يُرفع.");

    throw new Error(
      "تم تعطيل الرفع إلى مستودع Weaver لحماية المنصة. استخدم «مستودع جديد للمشروع» لإنشاء مستودع مستقل وآمن.",
    );
  });
