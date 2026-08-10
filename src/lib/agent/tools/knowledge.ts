import { tool } from "ai";
import { z } from "zod";
import {
  captureKnowledge,
  markKnowledgeUsed,
  searchKnowledge,
  type KnowledgeKind,
} from "@/lib/knowledge.server";

type Auth = { userId: string };

/**
 * أدوات الذاكرة المعرفية: تسمح للوكيل باسترجاع ما بناه سابقاً
 * وإعادة استخدامه، وبتسجيل الدروس والقرارات لاستعمالها لاحقاً.
 */
export function knowledgeTools(auth: Auth, projectId: string | null) {
  const recall = tool({
    description:
      "يبحث في معرفتك السابقة (ملفات كتبتها، إصلاحات نجحت، قرارات معمارية) لإعادة استخدامها بدل الكتابة من الصفر. استخدمه قبل كتابة أي مكوّن أو إصلاح مشابه لشيء سبق بناؤه.",
    inputSchema: z.object({
      query: z.string().describe("وصف ما تبحث عنه، مثل: هيدر متجاوب RTL أو إصلاح خطأ npm install"),
      kind: z
        .enum(["file", "fix", "decision", "pattern"])
        .nullable()
        .optional()
        .describe("تصفية النوع، أو اتركه فارغاً للبحث في الكل"),
      limit: z.number().int().min(1).max(10).nullable().optional(),
    }),
    execute: async ({ query, kind, limit }) => {
      const entries = await searchKnowledge({
        userId: auth.userId,
        query,
        limit: limit ?? 5,
        ...(kind ? { kind: kind as KnowledgeKind } : {}),
      });
      await markKnowledgeUsed(entries.map((entry) => entry.id));
      return {
        ok: true,
        found: entries.length,
        entries: entries.map((entry) => ({
          kind: entry.kind,
          title: entry.title,
          path: entry.path,
          summary: entry.summary,
          language: entry.language,
          content: entry.content.slice(0, 6000),
        })),
        hint:
          entries.length === 0
            ? "لا توجد معرفة سابقة مطابقة — ابنِ الحل ثم سجّله بـ save_knowledge."
            : "كيّف هذه المقاطع على سياق المشروع الحالي بدل نسخها حرفياً.",
      };
    },
  });

  const save = tool({
    description:
      "يسجّل درساً أو قراراً أو نمطاً ناجحاً في ذاكرتك الدائمة ليُستفاد منه في المشاريع القادمة. استخدمه بعد كل إصلاح غير بديهي أو قرار معماري.",
    inputSchema: z.object({
      kind: z.enum(["fix", "decision", "pattern"]).describe("نوع المعرفة"),
      title: z.string().describe("عنوان قصير واضح"),
      content: z.string().describe("التفاصيل الكاملة: المشكلة، السبب الجذري، الحل النهائي/الكود"),
      summary: z.string().nullable().optional().describe("سطر واحد يلخّص الفائدة"),
      tags: z.array(z.string()).nullable().optional(),
    }),
    execute: async ({ kind, title, content, summary, tags }) => {
      await captureKnowledge({
        userId: auth.userId,
        projectId,
        kind,
        title,
        content,
        summary: summary ?? null,
        tags: tags ?? [],
      });
      return { ok: true, saved: title };
    },
  });

  return { recall_knowledge: recall, save_knowledge: save };
}
