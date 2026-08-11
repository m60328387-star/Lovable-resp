/**
 * موجة 6 — أدوات مساحة العمل والتخطيط، منقولة من routes/api/chat.ts
 * لتقليص حجم ملف المحرّك وتسهيل الصيانة.
 */
import { generateText, tool } from "ai";
import { z } from "zod";
import { createOpenRouterProvider } from "@/lib/openrouter.server";
import { type AuthedContext } from "@/lib/chat-auth.server";
import type { Json } from "@/integrations/supabase/types";
import { setDeployedUrl } from "@/lib/build-state.server";

import { runChecks, type Issue } from "@/lib/verify.server";
import { estimateCostUsd } from "@/lib/pricing";
import { getSelfRepo, selfRead, selfWrite } from "@/lib/self-repo.server";
import { buildDesignBlueprint, type DesignBlueprintKind } from "@/lib/design-blueprints";
import { buildStackPlan, type StackKind } from "@/lib/stack-library";
import {
  browserAct,
  browserClose,
  browserOpen,
  browserRead,
  runtimeBrowserCheck,
  runtimeConfigured,
  runtimeDevLogs,
  runtimeDevStart,
  runtimeDevStatus,
  runtimeDevStop,
  runtimeExec,
  runtimeList,
  runtimeRead,
  runtimeSync,
} from "@/lib/runtime.server";
import { buildBrandKit } from "@/lib/brand-kit";
import { listSnippets, getSnippets, uiLibraryFiles } from "@/lib/design/ui-library";
import { scoreDesignMetrics, aggregateDesignScores } from "@/lib/design/metrics";
import { listStarterKits, planFromKit } from "@/lib/design/starter-kits";
import { contentContract, composeSite } from "@/lib/design/turbo";
import { copyBrief, auditCopy } from "@/lib/design/copy-engine";
import {
  directionsForKit,
  directionsQuestion,
  getDirection,
  listDirections,
} from "@/lib/design/directions";

import { buildSeoKit } from "@/lib/seo-kit";
import { reviewScreenshot } from "@/lib/design-critic.server";
import {
  platformTools,
  selfTools,
  intelTools,
  webTools,
  botTools,
  targetSupabaseTools,
  resolvePublicOrigin,
} from "@/lib/agent/tools/integrations";

/** مسارات تعود لكود منصة Weaver نفسها وليست لمساحة عمل المشروع. */
function isPlatformPath(path: string) {
  const clean = path.replace(/^\.?\//, "");
  return (
    /^(src|deploy|supabase|public|scripts)\//i.test(clean) ||
    /^(package\.json|vite\.config\.ts|tsconfig\.json|eslint\.config\.js|components\.json|AGENTS\.md)$/i.test(
      clean,
    )
  );
}

/** يطبّق تعديلات جراحية على ملف من كود المنصة عبر GitHub بدل مساحة عمل المشروع. */
async function editPlatformFile(
  path: string,
  edits: Array<{ find: string; replace: string }>,
  summary: string,
) {
  const clean = path.replace(/^\.?\//, "");
  const repo = getSelfRepo();
  if (!repo) {
    return { ok: false, error: "التطوير الذاتي غير مهيّأ (GITHUB_TOKEN / GITHUB_REPO_URL مفقود)." };
  }

  const current = await selfRead(repo, clean);
  if (!current.found) {
    return { ok: false, error: `الملف ${clean} غير موجود في مستودع المنصة.` };
  }
  let content = current.content;
  const applied: string[] = [];
  const failed: string[] = [];
  for (const edit of edits) {
    const index = content.indexOf(edit.find);
    if (index === -1) {
      failed.push(edit.find.slice(0, 60));
      continue;
    }
    if (content.indexOf(edit.find, index + 1) !== -1) {
      failed.push(`(غير فريد) ${edit.find.slice(0, 60)}`);
      continue;
    }
    content = content.slice(0, index) + edit.replace + content.slice(index + edit.find.length);
    applied.push(edit.find.slice(0, 60));
  }
  if (applied.length === 0) {
    return { ok: false, path: clean, target: "platform", error: "لم يُطابق أي مقطع.", failed };
  }
  try {
    const result = await selfWrite(repo, clean, content, summary || `Weaver: تعديل ${clean}`);
    return {
      ok: true,
      target: "platform",
      path: clean,
      commit: result.commit,
      branch: result.branch,
      appliedCount: applied.length,
      failed,
      summary,
      note: "طُبّق على كود المنصة (تطوير ذاتي). استخدم deploy_platform لتفعيله على الخادم.",
    };
  } catch (error) {
    return { ok: false, path: clean, target: "platform", error: (error as Error).message };
  }
}

type PlanningAuth = { supabase: AuthedContext["supabase"]; userId: string } | null;

/** أدوات التخطيط — تكتب فعلياً في جداول specs و tasks حتى تبقى الخطة ظاهرة في لوحة المشروع. */
export function planningTools(auth: PlanningAuth, projectId: string | null) {
  const designBlueprintTool = tool({
    description:
      "ينشئ عقد تصميم مرجعياً إلزامياً حسب نوع المنتج ويحفظه في ذاكرة المشروع. نفّذه قبل brand_kit وقبل كتابة أي واجهة.",
    inputSchema: z.object({
      kind: z.enum([
        "saas",
        "commerce",
        "luxury",
        "editorial",
        "service",
        "portfolio",
        "dashboard",
        "custom",
      ]),
      direction: z.string().optional(),
      signature: z.string().optional(),
    }),
    execute: async (input) => {
      const blueprint = buildDesignBlueprint({
        kind: input.kind as DesignBlueprintKind,
        ...(input.direction ? { direction: input.direction } : {}),
        ...(input.signature ? { signature: input.signature } : {}),
      });
      if (!auth || !projectId) return { ok: true, persisted: false, blueprint };
      const { error } = await auth.supabase.from("project_memory").upsert(
        {
          project_id: projectId,
          user_id: auth.userId,
          key: "design.blueprint",
          value: JSON.stringify(blueprint),
          kind: "brand",
        },
        { onConflict: "project_id,key" },
      );
      return { ok: !error, persisted: !error, blueprint, error: error?.message };
    },
  });

  const specTool = tool({
    description: "يكتب مواصفات المشروع (مصدر الحقيقة الواحد) ويحفظها دائماً في لوحة المشروع.",
    inputSchema: z.object({
      title: z.string().describe("عنوان المشروع"),
      objective: z.string().describe("الهدف في جملة أو جملتين"),
      users: z.array(z.string()).describe("شرائح المستخدمين"),
      functional: z.array(z.string()).describe("المتطلبات الوظيفية"),
      nonFunctional: z.array(z.string()).describe("المتطلبات غير الوظيفية"),
      architecture: z.array(z.string()).describe("قرارات معمارية أساسية"),
      risks: z.array(z.string()).describe("المخاطر والافتراضات"),
      acceptance: z.array(z.string()).describe("معايير القبول القابلة للتحقق"),
      openQuestions: z.array(z.string()).describe("الأسئلة الناقصة التي يحتاجها المشروع"),
    }),
    execute: async (input) => {
      if (!auth || !projectId) return { ...input, persisted: false };
      const { data: latest } = await auth.supabase
        .from("specs")
        .select("version")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const version = (latest?.version ?? 0) + 1;
      await auth.supabase.from("specs").insert({
        project_id: projectId,
        user_id: auth.userId,
        version,
        data: input as unknown as Json,
      });
      await auth.supabase.from("projects").update({ status: "spec" }).eq("id", projectId);
      return { ...input, persisted: true, version };
    },
  });

  const taskGraphTool = tool({
    description:
      "ينتج رسم المهام (Task Graph) مع الاعتماديات ومعايير القبول ويحفظه في لوحة المشروع.",
    inputSchema: z.object({
      tasks: z.array(
        z.object({
          id: z.string().describe("معرف قصير مثل T1"),
          title: z.string(),
          layer: z
            .enum(["discovery", "data", "backend", "frontend", "integration", "quality", "deploy"])
            .describe("الطبقة التي تنتمي إليها المهمة"),
          dependsOn: z.array(z.string()).describe("معرفات المهام التي تعتمد عليها"),
          acceptance: z.string().describe("معيار القبول"),
          verification: z
            .array(z.enum(["build", "typecheck", "unit", "integration", "api", "browser"]))
            .describe("أدلة التحقق المطلوبة"),
        }),
      ),
    }),
    execute: async (input) => {
      if (!auth || !projectId || input.tasks.length === 0) return { ...input, persisted: false };
      const rows = input.tasks.map((task, index) => ({
        project_id: projectId,
        user_id: auth.userId,
        task_key: task.id,
        title: task.title,
        layer: task.layer,
        depends_on: task.dependsOn,
        acceptance: task.acceptance,
        verification: task.verification,
        position: index,
      }));
      await auth.supabase.from("tasks").upsert(rows, { onConflict: "project_id,task_key" });
      await auth.supabase.from("projects").update({ status: "graph" }).eq("id", projectId);
      return { ...input, persisted: true, count: rows.length };
    },
  });

  const updateTaskTool = tool({
    description: "يحدّث حالة مهمة في رسم المهام مع سبب واضح، ويُحفظ التحديث في لوحة المشروع.",
    inputSchema: z.object({
      id: z.string(),
      status: z.enum(["pending", "running", "blocked", "failed", "done"]),
      note: z.string().describe("ملاحظة أو دليل التحقق"),
    }),
    execute: async (input) => {
      if (!auth || !projectId) return { ...input, persisted: false };
      await auth.supabase
        .from("tasks")
        .update({ status: input.status, note: input.note })
        .eq("project_id", projectId)
        .eq("task_key", input.id);
      const { count: remaining } = await auth.supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .neq("status", "done");
      return { ...input, persisted: true, allTasksDone: (remaining ?? 0) === 0 };
    },
  });

  return {
    design_blueprint: designBlueprintTool,
    write_spec: specTool,
    build_task_graph: taskGraphTool,
    update_task: updateTaskTool,
  };
}

type WorkspaceSupabase = AuthedContext["supabase"];

/** يحفظ نسخة من الملف الحالي في تاريخ الإصدارات قبل تعديله أو حذفه. */
async function snapshot(
  supabase: WorkspaceSupabase,
  projectId: string,
  userId: string,
  path: string,
) {
  const { data } = await supabase
    .from("files")
    .select("content, version")
    .eq("project_id", projectId)
    .eq("path", path)
    .maybeSingle();
  if (!data) return;
  await supabase.from("file_versions").insert({
    project_id: projectId,
    user_id: userId,
    path,
    content: data.content,
    version: data.version,
  });
}

function buildFixPrompt(path: string, content: string, issues: Issue[]) {
  const issuesText = issues
    .map(
      (i) =>
        `- ${i.severity === "error" ? "ERROR" : "WARNING"}: ${i.message}${i.line ? ` (line ${i.line})` : ""}`,
    )
    .join("\n");
  return `You are a precise code repair tool. Fix ONLY the issues listed below in the file. Keep the file's purpose, language, and formatting intact. Do not add explanations outside the code block.

File path: ${path}

Issues to fix:
${issuesText}

Current file content:
\`\`\`
${content}
\`\`\`

Return the complete corrected file content in a single fenced code block. If no changes are needed, return the original content unchanged.`;
}

function extractCode(text: string) {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  return match ? match[1] : text;
}

/** تنبيه حجم: يدفع الوكيل لتقسيم الملفات الضخمة بدل تضخيمها. */
function sizeHint(path: string, content: string) {
  const lines = content.split("\n").length;
  if (lines <= 800 && content.length <= 60_000) return {};
  return {
    warning: `الملف ${path} أصبح ${lines} سطراً (${content.length} حرف). قسّمه إلى وحدات أصغر (صفحات/ملفات CSS أو JS منفصلة) في الخطوة التالية.`,
  };
}

export function workspaceTools(
  auth: AuthedContext | null,
  projectId: string | null,
  origin: string,
) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return { supabase: auth.supabase, userId: auth.userId, projectId };
  };

  // ===== عقد التصميم الإلزامي =====
  // وجود هذه الملفات الثلاثة في مساحة العمل هو الشرط الوحيد لفتح كتابة صفحات الواجهة.
  // بهذا لا يستطيع الوكيل تجاوز طقم البداية ولا الاتجاه البصري مهما اختصر.
  const KIT_DOC = "brand/KIT.md";
  const DIRECTION_DOC = "brand/DIRECTION.md";
  const TOKENS_FILE = "brand/tokens.css";
  let designContractReady = false;

  async function readDoc(path: string) {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase
      .from("files")
      .select("content")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();
    return data?.content ?? null;
  }

  async function putDoc(path: string, content: string) {
    const { supabase, userId, projectId: pid } = guard();
    const { data: existing } = await supabase
      .from("files")
      .select("id, version")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("files")
        .update({ content, version: existing.version + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("files").insert({ project_id: pid, user_id: userId, path, content });
    }
  }

  /** يقرأ الاتجاه البصري المعتمد للمشروع من brand/DIRECTION.md. */
  async function readChosenDirection() {
    const doc = await readDoc(DIRECTION_DOC);
    if (!doc) return null;
    const field = (key: string) =>
      doc.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
    const id = field("id");
    if (!id) return null;
    return { id, personality: field("personality"), baseColor: field("baseColor") };
  }

  /** يمنع كتابة أي صفحة واجهة قبل إغلاق: طقم البداية + الاتجاه البصري + توكنات الهوية. */
  async function designContractBlocker(path: string) {
    if (designContractReady) return null;
    const clean = path.replace(/^\.?\//, "");
    if (clean.startsWith("brand/")) return null;
    if (!/\.(html|css)$/i.test(clean)) return null;
    const [kit, direction, tokens] = await Promise.all([
      readDoc(KIT_DOC),
      readDoc(DIRECTION_DOC),
      readDoc(TOKENS_FILE),
    ]);
    if (kit && direction && tokens) {
      designContractReady = true;
      return null;
    }
    const missing = [
      kit ? null : "طقم البداية (starter_kit بمعرّف)",
      direction
        ? null
        : "الاتجاه البصري المعتمد (design_directions ثم ask_user ثم design_directions بـ chosen)",
      tokens ? null : "توكنات الهوية (brand_kit)",
    ].filter(Boolean);
    return `ممنوع كتابة ${clean} قبل إغلاق عقد التصميم. الناقص: ${missing.join(" — ")}. الترتيب الملزم: starter_kit(id) ← design_directions(kit) + ask_user ← design_directions(chosen) ← brand_kit ← ثم ابدأ الكتابة.`;
  }

  /** الكتابة الفعلية لملف واحد — يشاركها write_file و write_files. */
  /**
   * التقاط معرفي في الخلفية: كل ملف يُكتب بنجاح يُخزَّن في الذاكرة الدائمة
   * ليُعاد استخدامه في أي طلب لاحق بدل إعادة كتابته من الصفر.
   */
  function rememberFile(path: string, content: string, summary: string) {
    const { userId, projectId: pid } = guard();
    void import("@/lib/knowledge.server").then(({ captureKnowledge }) =>
      captureKnowledge({
        userId,
        projectId: pid,
        kind: "file",
        title: path,
        path,
        content,
        summary,
      }),
    );
  }

  async function writeOne(path: string, content: string, summary: string, force = false) {
    // لا نرفض الملفات الكبيرة: الرفض كان يضيّع محتوى كتبه النموذج فعلاً (يظهر في الدردشة ولا يُحفظ).
    if (content.length > 400_000) {
      return {
        ok: false,
        path,
        error: "الملف أكبر من 400000 حرف. اكتب الجزء الأول ثم أكمل عبر append_file.",
      };
    }
    const blocked = await designContractBlocker(path);
    if (blocked) return { ok: false, path, error: blocked };
    const { supabase, userId, projectId: pid } = guard();

    const { data: existing } = await supabase
      .from("files")
      .select("id, version, content")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();

    if (existing) {
      // اكتب فقط ما يلزم: إعادة كتابة ملف قائم كبير كاملاً تهدر التوكينز وتخاطر بالبتر
      const previous = existing.content ?? "";
      if (!force && previous.length > 6000 && content.length > 6000) {
        return {
          ok: false,
          path,
          error: `الملف ${path} موجود مسبقاً بحجم ${previous.length} حرف. لا تُعِد كتابته كاملاً — استخدم edit_file باستبدالات دقيقة للمقاطع المتغيّرة فقط. إن كانت إعادة البناء الكاملة ضرورية فعلاً مرّر force=true.`,
        };
      }

      // نسخة الإصدار السابق تُحفظ في الخلفية حتى لا تضيف زمناً لكل كتابة
      void supabase
        .from("file_versions")
        .insert({
          project_id: pid,
          user_id: userId,
          path,
          content: existing.content,
          version: existing.version,
        })
        .then(
          () => undefined,
          () => undefined,
        );
      // قفل تفاؤلي: لا نكتب إن غيّر نداء متوازٍ نفس الملف بيننا
      const { data: updated, error } = await supabase
        .from("files")
        .update({ content, version: existing.version + 1 })
        .eq("id", existing.id)
        .eq("version", existing.version)
        .select("version")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) {
        return {
          ok: false,
          path,
          error:
            "تم تعديل الملف من نداء آخر أثناء الكتابة. اقرأه من جديد بـ read_file ثم أعد التعديل.",
        };
      }
      rememberFile(path, content, summary);
      return {
        ok: true,
        path,
        version: updated.version,
        bytes: content.length,
        summary,
        ...sizeHint(path, content),
      };
    }

    const { error } = await supabase
      .from("files")
      .insert({ project_id: pid, user_id: userId, path, content });
    if (error) throw new Error(error.message);
    rememberFile(path, content, summary);
    return {
      ok: true,
      path,
      version: 1,
      bytes: content.length,
      summary,
      ...sizeHint(path, content),
    };
  }

  const writeFile = tool({
    description:
      "يكتب أو يحدّث ملفاً فعلياً داخل مساحة عمل المشروع المحفوظة. للملفات القائمة الكبيرة استخدم edit_file بدلاً منه.",
    inputSchema: z.object({
      path: z.string().describe("مسار الملف داخل المشروع، مثل src/lib/auth.ts"),
      content: z.string().describe("المحتوى الكامل للملف بعد التعديل"),
      summary: z.string().describe("سطر واحد يشرح سبب هذا التغيير"),
      force: z
        .boolean()
        .optional()
        .describe("true فقط عند الحاجة الفعلية لإعادة كتابة ملف قائم كبير بالكامل"),
    }),
    execute: async ({ path, content, summary, force }) => writeOne(path, content, summary, force),
  });

  /** كتابة دفعة ملفات في نداء واحد — يقلّص عدد الجولات وزمن بناء المشروع بشكل كبير. */
  const writeFiles = tool({
    description:
      "يكتب عدة ملفات دفعة واحدة في نداء واحد (index.html + styles.css + scripts... معاً). استخدمه دائماً بدل تكرار write_file عندما تكتب أكثر من ملف.",
    inputSchema: z.object({
      files: z
        .array(
          z.object({
            path: z.string().describe("مسار الملف"),
            content: z.string().describe("المحتوى الكامل للملف"),
          }),
        )
        .describe("قائمة الملفات المراد كتابتها"),
      summary: z.string().describe("سطر واحد يشرح سبب هذه الدفعة"),
    }),
    execute: async ({ files, summary }) => {
      const results: Array<{ ok: boolean; path: string; error?: string; bytes?: number }> = [];
      for (const file of files) {
        try {
          const result = await writeOne(file.path, file.content, summary);
          results.push({
            ok: result.ok !== false,
            path: file.path,
            bytes: file.content.length,
            ...(result.ok === false ? { error: String(result.error) } : {}),
          });
        } catch (error) {
          results.push({
            ok: false,
            path: file.path,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const failed = results.filter((r) => !r.ok);
      return {
        ok: failed.length === 0,
        written: results.length - failed.length,
        failed: failed.length,
        results,
        summary,
        ...(failed.length
          ? { error: `فشلت كتابة ${failed.length} ملف — أعد كتابتها فردياً بـ write_file.` }
          : {}),
      };
    },
  });

  /** تعديل جراحي بالبحث والاستبدال — أسرع وأرخص وأأمن من إعادة كتابة الملف كاملاً. */
  const editFile = tool({
    description:
      "يعدّل ملفاً قائماً باستبدال مقاطع نصية محددة بدل إعادة كتابته كاملاً. استخدمه دائماً للتعديلات الجزئية على الملفات الكبيرة (أسرع وأقل خطراً من write_file).",
    inputSchema: z.object({
      path: z.string().describe("مسار الملف المراد تعديله"),
      edits: z
        .array(
          z.object({
            find: z.string().describe("النص القديم كما هو حرفياً (فريد داخل الملف)"),
            replace: z.string().describe("النص الجديد الذي يحل محله"),
          }),
        )
        .describe("قائمة عمليات الاستبدال بالترتيب"),
      summary: z.string().describe("سطر واحد يشرح سبب التعديل"),
    }),
    execute: async ({ path, edits, summary }) => {
      const { supabase, userId, projectId: pid } = guard();
      const { data: existing } = await supabase
        .from("files")
        .select("id, version, content")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();
      if (!existing) {
        // الملف ليس في مساحة عمل المشروع — قد يكون من كود المنصة نفسها (تطوير ذاتي).
        if (isPlatformPath(path)) {
          return editPlatformFile(path, edits, summary);
        }
        return {
          ok: false,
          error: `الملف ${path} غير موجود في مساحة عمل المشروع. استخدم write_file لإنشائه، أو self_read_file/self_write_file إن كان من كود المنصة.`,
        };
      }

      let content = existing.content;
      const applied: string[] = [];
      const failed: string[] = [];
      for (const edit of edits) {
        const index = content.indexOf(edit.find);
        if (index === -1) {
          failed.push(edit.find.slice(0, 60));
          continue;
        }
        if (content.indexOf(edit.find, index + 1) !== -1) {
          failed.push(`(غير فريد) ${edit.find.slice(0, 60)}`);
          continue;
        }
        content = content.slice(0, index) + edit.replace + content.slice(index + edit.find.length);
        applied.push(edit.find.slice(0, 60));
      }

      if (applied.length === 0) {
        return { ok: false, path, error: "لم يُطابق أي مقطع.", failed };
      }

      await snapshot(supabase, pid, userId, path);
      const { data: updated, error } = await supabase
        .from("files")
        .update({ content, version: existing.version + 1 })
        .eq("id", existing.id)
        .eq("version", existing.version)
        .select("version")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) {
        return { ok: false, path, error: "تعارض إصدارات — أعد read_file ثم أعد المحاولة." };
      }
      return {
        ok: true,
        path,
        version: updated.version,
        bytes: content.length,
        appliedCount: applied.length,
        failed,
        summary,
      };
    },
  });

  const readFile = tool({
    description: "يقرأ محتوى ملف من مساحة عمل المشروع.",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("files")
        .select("path, content, version")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();
      if (!data) return { path, found: false, content: "" };
      return { path, found: true, version: data.version, content: data.content };
    },
  });

  const listFiles = tool({
    description: "يسرد ملفات مساحة عمل المشروع الحالية مع أحجامها.",
    inputSchema: z.object({}),
    execute: async () => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("files")
        .select("path, version, content")
        .eq("project_id", pid)
        .order("path", { ascending: true });
      return {
        files: ((data ?? []) as Array<{ path: string; version: number; content: string }>).map(
          (f) => ({
            path: f.path,
            version: f.version,
            bytes: f.content.length,
          }),
        ),
      };
    },
  });

  /** يزامن ملفات المشروع من قاعدة البيانات إلى مساحة التنفيذ الحقيقية. */
  const syncRuntime = async () => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase.from("files").select("path, content").eq("project_id", pid);
    const files = ((data ?? []) as Array<{ path: string; content: string | null }>).map((f) => ({
      path: f.path,
      content: f.content ?? "",
    }));
    await runtimeSync(pid, files, false);
    return { pid, count: files.length };
  };

  /** يعيد الملفات التي أنشأتها أو عدّلتها أوامر الحاوية إلى مساحة المشروع المحفوظة. */
  const pullRuntimeFiles = async (pid: string) => {
    const { supabase, userId } = guard();
    const listed = await runtimeList(pid, 800);
    let synced = 0;
    for (const file of listed.files) {
      if (file.bytes > 2_000_000) continue;
      const read = await runtimeRead(pid, file.path);
      if (read.content === null) continue;
      const { data: existing } = await supabase
        .from("files")
        .select("id, version, content")
        .eq("project_id", pid)
        .eq("path", file.path)
        .maybeSingle();
      if (existing?.content === read.content) continue;
      if (existing) {
        await supabase
          .from("files")
          .update({ content: read.content, version: existing.version + 1 })
          .eq("id", existing.id);
      } else {
        await supabase.from("files").insert({
          project_id: pid,
          user_id: userId,
          path: file.path,
          content: read.content,
        });
      }
      synced += 1;
    }
    return synced;
  };

  const shell = tool({
    description:
      "ينفّذ أمر shell داخل حاوية تنفيذ حقيقية خاصة بالمشروع (Node 22 + npm + git + python). يزامن ملفات المشروع أولاً ثم يعيد المخرجات ورمز الخروج. استخدمه لـ npm install / npm run build / npx vitest.",
    inputSchema: z.object({
      command: z.string().describe("الأمر المراد تنفيذه"),
      reason: z.string().describe("سبب تنفيذ الأمر"),
      timeoutSeconds: z.number().int().min(5).max(600).default(300),
    }),
    execute: async ({ command, timeoutSeconds }) => {
      if (!runtimeConfigured()) {
        return {
          ok: false,
          error:
            "بيئة التنفيذ غير متاحة على هذه النسخة — لا تطلب من المستخدم تشغيلها ولا تتوقف. أكمل بأدوات: run_checks و fix_errors و visual_audit ثم publish_site.",
        };
      }
      const { pid } = await syncRuntime();
      const result = await runtimeExec(pid, command, timeoutSeconds * 1000);
      const synced = await pullRuntimeFiles(pid);
      return {
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        output: result.output.slice(-20_000),
        synced,
      };
    },
  });

  const devServer = tool({
    description:
      "يدير خادم التطوير الحقيقي للمشروع داخل حاوية التنفيذ: start يشغّله ويعيد رابط المعاينة الحيّة، logs يقرأ السجل لاكتشاف الأخطاء، stop يوقفه.",
    inputSchema: z.object({
      action: z.enum(["start", "stop", "logs", "status"]),
      command: z.string().optional().describe("أمر مخصص للتشغيل (اختياري)"),
    }),
    execute: async ({ action, command }) => {
      if (!runtimeConfigured()) {
        return {
          ok: false,
          error:
            "بيئة التنفيذ غير متاحة على هذه النسخة — لا تطلب من المستخدم تشغيلها ولا تتوقف. أكمل بأدوات: run_checks و fix_errors و visual_audit ثم publish_site.",
        };
      }
      const { projectId: pid } = guard();
      if (action === "stop") return { ...(await runtimeDevStop(pid)), ok: true };
      if (action === "status") return { ...(await runtimeDevStatus(pid)), ok: true };
      if (action === "logs") {
        const logs = await runtimeDevLogs(pid, 200);
        return { ok: true, logs: logs.logs?.slice(-120) ?? [] };
      }
      await syncRuntime();
      const started = await runtimeDevStart(pid, command);
      return {
        ...started,
        ok: started.ready === true,
        previewUrl: `/api/public/rt/${pid}/`,
        logs: (started.logs ?? []).slice(-60),
      };
    },
  });

  /** كتابة ملف داخلي (تقارير الفحص واللقطات) دون المرور بأداة write_file. */
  const saveInternalFile = async (path: string, content: string) => {
    const { supabase, userId, projectId: pid } = guard();
    const { data: existing } = await supabase
      .from("files")
      .select("id, version")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("files")
        .update({ content, version: (existing as unknown as { version: number }).version + 1 })
        .eq("id", (existing as unknown as { id: string }).id);
    } else {
      await supabase.from("files").insert({ project_id: pid, user_id: userId, path, content });
    }
  };

  /** فحص متصفح حقيقي داخل حاوية التنفيذ (لا يحتاج منفّذاً خارجياً). */
  const runBrowserCheck = async (opts: {
    path?: string;
    devices?: string[];
    screenshots?: boolean;
  }) => {
    const { projectId: pid } = guard();
    await syncRuntime();
    const status = await runtimeDevStatus(pid).catch(() => null);
    if (!status?.running) {
      // مشروع ثابت أو خادم متوقف: خادم الحاوية يقدّم الملفات مباشرة، فلا حاجة للتشغيل.
      await runtimeDevStart(pid).catch(() => undefined);
    }
    const result = await runtimeBrowserCheck(pid, {
      path: opts.path ?? "",
      devices: opts.devices ?? ["desktop", "mobile"],
      screenshots: opts.screenshots !== false,
    });
    for (const r of result.results) {
      if (r.screenshot) await saveInternalFile(`.weaver/shot-${r.device}.txt`, r.screenshot);
    }
    return result;
  };

  const browserCheckTool = tool({
    description:
      "فحص متصفح حقيقي (Chromium) داخل حاوية المشروع: يفتح المعاينة الحيّة على أحجام شاشة متعددة، يجمع أخطاء الكونسول والشبكة وملاحظات الوصولية والتمرير الأفقي، ويحفظ لقطات الشاشة لاستخدامها في design_review. لا يحتاج منفّذاً خارجياً. نفّذه بعد run_checks وقبل publish_site.",
    inputSchema: z.object({
      path: z
        .string()
        .default("")
        .describe("مسار الصفحة داخل المعاينة مثل about.html (فارغ = الرئيسية)"),
      devices: z.array(z.enum(["desktop", "tablet", "mobile"])).default(["desktop", "mobile"]),
    }),
    execute: async ({ path, devices }) => {
      if (!runtimeConfigured()) {
        return {
          ok: false,
          error:
            "بيئة التنفيذ غير متاحة على هذه النسخة — لا تطلب من المستخدم تشغيلها ولا تتوقف. أكمل بأدوات: run_checks و fix_errors و visual_audit ثم publish_site.",
        };
      }
      const result = await runBrowserCheck({ path, devices });
      const scored = result.results
        .filter((r) => !r.navError)
        .map((r) => ({
          label: `${path || "index"} · ${r.device}`,
          score: scoreDesignMetrics(r.metrics, { device: r.device }),
        }));
      const gate = aggregateDesignScores(scored);
      return {
        ok: result.ok,
        errors: result.errors.slice(0, 40),
        warnings: result.warnings.slice(0, 40),
        pages: result.results.map((r) => ({
          device: r.device,
          status: r.status,
          title: r.title,
          navError: r.navError,
          screenshotSaved: Boolean(r.screenshot),
        })),
        designGate: {
          score: gate.score,
          pass: gate.pass,
          threshold: gate.threshold,
          perTarget: gate.perTarget,
          topFixes: gate.topFixes,
          summary: gate.summary,
        },
        hint:
          result.ok && gate.pass
            ? "لا أخطاء وبوابة الجودة اجتازت — يمكنك متابعة design_review ثم النشر."
            : !result.ok
              ? "أصلح كل خطأ ثم أعد browser_check حتى ok=true."
              : `بوابة الجودة رسبت (${gate.score}/${gate.threshold}). نفّذ topFixes ثم أعد browser_check — النشر ممنوع قبل النجاح.`,
      };
    },
  });

  // ------------------------------------------------ متصفح الوكيل (Computer Use)

  const browserOpenTool = tool({
    description:
      "يفتح جلسة متصفح Chromium دائمة خاصة بهذا المشروع (ملف تعريف محفوظ: الكوكيز وتسجيل الدخول تبقى بين الجولات). استخدمها لأي عمل على مواقع خارجية (Google Ads، لوحات تحكّم، تسجيل نطاق…). المستخدم يرى الجلسة حيّة في تبويب «المتصفح الحيّ» ويسجّل دخوله بنفسه — لا تطلب منه كلمة السر أبداً.",
    inputSchema: z.object({
      url: z.string().default("").describe("العنوان الأول لفتحه"),
      allowlist: z
        .array(z.string())
        .default([])
        .describe("نطاقات مسموحة فقط، مثل ['ads.google.com','google.com'] (فارغ = بلا قيد)"),
    }),
    execute: async ({ url, allowlist }) => {
      if (!runtimeConfigured())
        return {
          ok: false,
          error:
            "بيئة التنفيذ غير متاحة على هذه النسخة — لا تطلب من المستخدم تشغيلها ولا تتوقف. أكمل بأدوات: run_checks و fix_errors و visual_audit ثم publish_site.",
        };
      const { projectId: pid } = guard();
      const state = await browserOpen(pid, {
        ...(url ? { url } : {}),
        ...(allowlist.length ? { allowlist } : {}),
      });
      return {
        ...state,
        hint: "نفّذ browser_read لقراءة الصفحة قبل أي إجراء. إن ظهرت صفحة تسجيل دخول أو رمز تحقّق، توقّف واطلب من المستخدم إتمامها في تبويب «المتصفح الحيّ» عبر ask_user.",
      };
    },
  });

  const browserReadTool = tool({
    description:
      "يقرأ الصفحة الحالية في جلسة المتصفح: العنوان، النص المرئي، وقائمة مرقّمة بالعناصر التفاعلية مع إحداثياتها. نفّذه قبل كل إجراء وبعده لتتأكد من النتيجة — لا تنقر على العمياء.",
    inputSchema: z.object({}),
    execute: async () => {
      const { projectId: pid } = guard();
      const page = await browserRead(pid);
      return {
        ok: true,
        url: page.url,
        title: page.title,
        text: page.text.slice(0, 4000),
        elements: page.elements.slice(0, 80),
        needsHuman:
          /(sign in|log in|password|verification|2-step|تسجيل الدخول|كلمة المرور|رمز التحقق)/i.test(
            `${page.title} ${page.text.slice(0, 1200)}`,
          ),
      };
    },
  });

  const browserActTool = tool({
    description:
      "ينفّذ إجراءً واحداً داخل جلسة المتصفح: goto/click/type/press/scroll/select/wait/wait_for/back/reload. للنقر استخدم selector أو text أو إحداثيات x,y من browser_read. الخطوات الحسّاسة (دفع، شراء، إطلاق حملة، حذف) محجوبة تلقائياً: اسأل المستخدم بـ ask_user ثم أعد الإجراء مع approved=true.",
    inputSchema: z.object({
      kind: z.enum([
        "goto",
        "click",
        "dblclick",
        "type",
        "press",
        "scroll",
        "select",
        "wait",
        "wait_for",
        "back",
        "reload",
      ]),
      url: z.string().default(""),
      selector: z.string().default(""),
      text: z.string().default(""),
      key: z.string().default(""),
      value: z.string().default(""),
      x: z.number().default(-1),
      y: z.number().default(-1),
      dy: z.number().default(600),
      ms: z.number().default(1200),
      clear: z.boolean().default(false),
      approved: z
        .boolean()
        .default(false)
        .describe("اجعلها true فقط بعد موافقة صريحة من المستخدم على خطوة حسّاسة"),
    }),
    execute: async (input) => {
      const { projectId: pid } = guard();
      const action: Record<string, unknown> = { kind: input.kind, approved: input.approved };
      if (input.url) action["url"] = input.url;
      if (input.selector) action["selector"] = input.selector;
      if (input.text) action["text"] = input.text;
      if (input.key) action["key"] = input.key;
      if (input.value) action["value"] = input.value;
      if (input.x >= 0) action["x"] = input.x;
      if (input.y >= 0) action["y"] = input.y;
      if (input.kind === "scroll") action["dy"] = input.dy;
      if (input.kind === "wait") action["ms"] = input.ms;
      if (input.clear) action["clear"] = true;
      try {
        const result = await browserAct(pid, action as { kind: string });
        const page = await browserRead(pid).catch(() => null);
        return {
          ok: true,
          url: result.url,
          title: result.title,
          elements: page?.elements.slice(0, 60) ?? [],
          text: page?.text.slice(0, 2500) ?? "",
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  const browserCloseTool = tool({
    description:
      "يغلق جلسة المتصفح للمشروع ويحرّر الموارد. ملف التعريف (تسجيل الدخول) يبقى محفوظاً للجولة القادمة.",
    inputSchema: z.object({}),
    execute: async () => {
      const { projectId: pid } = guard();
      return browserClose(pid);
    },
  });

  /** حلقة إصلاح ذاتي مغلقة: تشغيل → قراءة الأخطاء الحقيقية → تقرير قابل للتنفيذ. */
  const autoRepair = tool({
    description:
      "حلقة إصلاح ذاتي مغلقة: تزامن الملفات، تشغّل خادم التطوير، تقرأ سجل البناء وأخطاء المتصفح الفعلية، وتعيد قائمة أخطاء مرتّبة مع الملفات المرشّحة للإصلاح. استخدمها بعد كل دفعة كتابة وكرّرها بعد كل إصلاح حتى تصبح clean=true.",
    inputSchema: z.object({
      install: z
        .boolean()
        .default(false)
        .describe("تشغيل npm install قبل الفحص إن تغيّرت الاعتماديات"),
      page: z.string().default("").describe("الصفحة المراد فحصها في المتصفح"),
    }),
    execute: async ({ install, page }) => {
      if (!runtimeConfigured()) {
        return {
          ok: false,
          error:
            "بيئة التنفيذ غير متاحة على هذه النسخة — لا تطلب من المستخدم تشغيلها ولا تتوقف. أكمل بأدوات: run_checks و fix_errors و visual_audit ثم publish_site.",
        };
      }
      const { pid } = await syncRuntime();
      const steps: Array<{ step: string; ok: boolean; detail: string }> = [];

      if (install) {
        const res = await runtimeExec(pid, "npm install --no-audit --no-fund", 300_000);
        steps.push({ step: "npm install", ok: res.ok, detail: res.output.slice(-3000) });
      }

      const started = await runtimeDevStart(pid).catch((err) => ({
        ready: false,
        logs: [String(err)],
        errors: [] as string[],
      }));
      const logs = await runtimeDevLogs(pid, 200).catch(() => ({
        logs: [] as string[],
        errors: [] as string[],
      }));
      const buildErrors: string[] = (logs.errors ?? []).slice(-30);
      steps.push({
        step: "dev server",
        ok: Boolean(started?.ready),
        detail: (logs.logs ?? []).slice(-40).join("\n").slice(-4000),
      });

      let browser: Awaited<ReturnType<typeof runBrowserCheck>> | null = null;
      if (started?.ready !== false || buildErrors.length === 0) {
        browser = await runBrowserCheck({ path: page, devices: ["desktop", "mobile"] }).catch(
          () => null,
        );
      }

      const allErrors = [...buildErrors, ...(browser?.errors ?? [])];
      const clean = allErrors.length === 0 && Boolean(started?.ready);
      await saveInternalFile(
        ".weaver/auto-repair.json",
        JSON.stringify(
          {
            at: new Date().toISOString(),
            clean,
            errors: allErrors,
            warnings: browser?.warnings ?? [],
          },
          null,
          2,
        ),
      );

      return {
        ok: true,
        clean,
        previewUrl: `/api/public/rt/${pid}/`,
        errors: allErrors.slice(0, 40),
        warnings: (browser?.warnings ?? []).slice(0, 30),
        steps,
        next: clean
          ? "لا أخطاء — تابع design_review ثم publish_site."
          : "أصلح الأخطاء أعلاه بـ edit_file/write_file ثم أعد auto_repair. لا تعلن الإنجاز قبل clean=true.",
      };
    },
  });

  const runCommand = tool({
    description:
      "ينفّذ أمر shell حقيقياً داخل حاوية المشروع الدائمة (npm install / build / test / git)، ثم يعيد الملفات الناتجة إلى مساحة المشروع المحفوظة. لا يحتاج منفّذاً خارجياً.",
    inputSchema: z.object({
      command: z.string().describe("الأمر المراد تشغيله"),
      reason: z.string().describe("لماذا هذا الأمر ولأي مهمة"),
      waitSeconds: z.number().int().min(0).max(240).default(120),
    }),
    execute: async ({ command, reason, waitSeconds }) => {
      if (!runtimeConfigured()) {
        return {
          ok: false,
          status: "unavailable",
          error: "حاوية التنفيذ الداخلية غير مهيّأة على الخادم.",
        };
      }
      const { supabase, userId } = guard();
      const { pid } = await syncRuntime();
      const timeoutMs = Math.max(5_000, Math.min(waitSeconds || 120, 600) * 1000);
      const result = await runtimeExec(pid, command, timeoutMs);
      const synced = await pullRuntimeFiles(pid);
      const status = result.ok ? "success" : "failed";
      const { data: run } = await supabase
        .from("runs")
        .insert({
          project_id: pid,
          user_id: userId,
          kind: "command",
          input: { command, reason },
          status,
          exit_code: result.exitCode,
          output: result.output.slice(-60_000),
        })
        .select("id")
        .single();
      return {
        ok: result.ok,
        runId: run?.id ?? null,
        command,
        status,
        exitCode: result.exitCode,
        output: result.output.slice(-12_000),
        synced,
      };
    },
  });

  /**
   * ينفّذ أمراً وينتظر نتيجته الحقيقية.
   * المسار الأساسي هو وقت التشغيل الداخلي (فوري وموثوق)؛ طابور المنفّذ الخارجي
   * بديل احتياطي فقط، وكان سابقاً يعلّق visual_audit إلى الأبد عند غياب المنفّذ.
   */
  const queueCommand = async (command: string, reason: string, waitSeconds: number) => {
    const { supabase, userId, projectId: pid } = guard();

    if (runtimeConfigured()) {
      const result = await runtimeExec(pid, command, Math.max(waitSeconds, 30) * 1000);
      const status = result.ok ? "success" : "failed";
      const { data: direct } = await supabase
        .from("runs")
        .insert({
          project_id: pid,
          user_id: userId,
          kind: "command",
          input: { command, reason },
          status,
          exit_code: result.exitCode,
          output: result.output.slice(-60_000),
        })
        .select("id")
        .maybeSingle();
      return {
        runId: direct?.id ?? null,
        status,
        exitCode: result.exitCode,
        output: result.output.slice(-8000),
      };
    }

    const { data: run, error } = await supabase
      .from("runs")
      .insert({
        project_id: pid,
        user_id: userId,
        kind: "command",
        input: { command, reason },
        status: "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: row } = await supabase
        .from("runs")
        .select("status, output, exit_code")
        .eq("id", run.id)
        .maybeSingle();
      if (row && (row.status === "success" || row.status === "failed")) {
        return {
          runId: run.id,
          status: row.status,
          exitCode: row.exit_code,
          output: (row.output ?? "").slice(-8000),
        };
      }
    }
    return { runId: run.id, status: "running", exitCode: null, output: "" };
  };

  const readWorkspaceFile = async (path: string) => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase
      .from("files")
      .select("content")
      .eq("project_id", pid)
      .eq("path", path)
      .maybeSingle();
    return data?.content ?? "";
  };

  const auditBaseCommand = () => {
    const origin = (
      process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app"
    ).replace(/\/+$/, "");
    return `curl -fsSL ${origin}/weaver-audit.mjs -o .weaver-audit.mjs && node .weaver-audit.mjs`;
  };

  const visualAudit = tool({
    description:
      "فحص بصري حقيقي: يفتح الموقع في متصفح Chromium فعلي على المنفّذ بثلاثة أحجام شاشة، يلتقط لقطات، ويشغّل axe-core للوصولية ويرصد أخطاء الكونسول والروابط المكسورة والتمرير الأفقي. نفّذه بعد run_checks وقبل publish_site. يتطلب منفّذاً متصلاً.",
    inputSchema: z.object({
      page: z.string().describe("الصفحة المراد فحصها مثل index.html"),
      waitSeconds: z.number().int().min(30).max(240).default(200),
    }),
    execute: async ({ page, waitSeconds }) => {
      const command = `${auditBaseCommand()} --page ${page.replace(/[^a-zA-Z0-9._/-]/g, "")}`;
      const result = await queueCommand(command, `فحص بصري للصفحة ${page}`, waitSeconds);
      if (result.status !== "success") {
        return {
          ...result,
          hint:
            result.status === "running"
              ? "التدقيق ما زال يعمل — تابعه بـ run_status ثم اقرأ .weaver/audit.json بـ read_file."
              : "لم ينجح التدقيق. إن لم يكن هناك منفّذ متصل أخبر المستخدم بتشغيله من الإعدادات ولا تدّعِ نجاح الفحص.",
        };
      }

      const raw = await readWorkspaceFile(".weaver/audit.json");
      if (!raw) return { ...result, error: "لم يُكتب تقرير التدقيق." };
      try {
        return { ...result, audit: JSON.parse(raw) };
      } catch {
        return { ...result, auditRaw: raw.slice(0, 6000) };
      }
    },
  });

  const captureReference = tool({
    description:
      "يلتقط لقطة شاشة حقيقية من موقع مرجعي خارجي حدّده المستخدم لتصبح المرجع البصري الملزم للتصميم. تُحفظ في .weaver/reference.txt وتُستخدم تلقائياً في design_review.",
    inputSchema: z.object({
      url: z.string().describe("رابط الموقع المرجعي الكامل"),
      waitSeconds: z.number().int().min(30).max(240).default(150),
    }),
    execute: async ({ url, waitSeconds }) => {
      if (!/^https:\/\//.test(url)) return { ok: false, error: "الرابط يجب أن يبدأ بـ https://" };
      const command = `${auditBaseCommand()} --url ${JSON.stringify(url)}`;
      const result = await queueCommand(command, `التقاط مرجع بصري من ${url}`, waitSeconds);
      const shot = await readWorkspaceFile(".weaver/reference.txt");
      return { ...result, captured: shot.length > 1000, bytes: shot.length, url };
    },
  });

  const designReview = tool({
    description:
      "مراجعة نقدية بالرؤية: يرسل لقطة الصفحة (من visual_audit) إلى نموذج رؤية ويعيد حكماً ودرجة وقائمة إصلاحات محددة، ويقارن بالمرجع البصري إن وُجد. نفّذه قبل publish_site وأصلح كل ملاحظة ثم أعده حتى يصبح VERDICT: pass.",
    inputSchema: z.object({
      context: z.string().describe("وصف موجز للصفحة ونوع المشروع والجمهور"),
      device: z.enum(["desktop", "tablet", "mobile"]).default("desktop"),
      useReference: z.boolean().default(true),
    }),
    execute: async ({ context, device, useReference }) => {
      const { supabase, userId, projectId: pid } = guard();
      const shot = await readWorkspaceFile(`.weaver/shot-${device}.txt`);
      if (shot.length < 1000) {
        return {
          ok: false,
          error: "لا توجد لقطة — نفّذ browser_check (أو visual_audit) أولاً ثم أعد design_review.",
        };
      }
      const reference = useReference ? await readWorkspaceFile(".weaver/reference.txt") : "";
      const result = await reviewScreenshot(
        shot,
        context,
        reference.length > 1000 ? reference : undefined,
      );
      const verdict = /VERDICT\s*:\s*pass/i.test(result.review) ? "pass" : "fail";
      const scoreMatch = /SCORE\s*:\s*(\d{1,3})/i.exec(result.review);
      const score = scoreMatch ? Number(scoreMatch[1]) : null;
      // بوابة الجودة البصرية تُسجَّل في قاعدة البيانات حتى يمنع publish_site النشر بلا مراجعة ناجحة.
      // درجة أقل من 85 = مرفوض: هذا ما يمنع الصفحات «العادية» من الوصول للمستخدم.
      const passed = result.ok && verdict === "pass" && score !== null && score >= 85;

      await supabase
        .from("runs")
        .insert({
          project_id: pid,
          user_id: userId,
          kind: "design",
          status: passed ? "passed" : "failed",
          output: result.review.slice(0, 4000),
          input: { device, score, verdict },
        })
        .then(
          () => undefined,
          () => undefined,
        );
      return {
        ...result,
        device,
        verdict,
        score,
        passed,
        comparedToReference: Boolean(reference),
        hint: passed
          ? "المراجعة البصرية ناجحة — يمكنك النشر."
          : "أصلح كل ملاحظة في ISSUES بـ write_file ثم أعد browser_check و design_review حتى passed=true. النشر محجوب قبل ذلك.",
      };
    },
  });

  const brandKit = tool({
    description:
      "يولّد هوية بصرية كاملة للمشروع ويكتبها كملفات: brand/tokens.css (لوحة ألوان محسوبة رياضياً بتباين WCAG مضمون + مقياس مسافات وطباعة + مكوّنات أساسية) و brand/logo.svg و brand/wordmark.svg و brand/favicon.svg و brand/BRAND.md و brand/head.html. نفّذه كأول خطوة في أي مشروع واجهة قبل كتابة أي HTML، ثم اربط brand/tokens.css في كل صفحة ولا تكتب أي لون مباشر بعدها.",
    inputSchema: z.object({
      brandName: z.string().describe("اسم العلامة كما يظهر للزائر"),
      personality: z
        .string()
        .describe(
          "طابع العلامة: technical أو warm أو luxury أو playful أو natural أو medical أو editorial (أو وصف عربي مثل «مطعم دافئ»)",
        ),
      baseColor: z
        .string()
        .describe("لون أساسي بصيغة hex إن طلبه المستخدم، أو نص فارغ ليُشتق تلقائياً"),
      locale: z.enum(["ar", "en"]).describe("لغة المحتوى الأساسية"),
      scheme: z.enum(["light", "dark"]).describe("الوضع الافتراضي للواجهة"),
      logoStyle: z.enum(["monogram", "geometric", "wordmark"]).describe("نمط الشعار"),
    }),
    execute: async ({ brandName, personality, baseColor, locale, scheme, logoStyle }) => {
      const { supabase, userId, projectId: pid } = guard();
      // الاتجاه البصري المعتمد يفرض نفسه على الهوية — لا يستطيع الوكيل الارتجال بلون أو طابع آخر.
      const chosenDirection = await readChosenDirection();
      if (!chosenDirection) {
        return {
          ok: false,
          error:
            "لا يوجد اتجاه بصري معتمد لهذا المشروع. نفّذ starter_kit(id) ثم design_directions(kit) واعرض الخيارات بـ ask_user، وبعد ردّ المستخدم نفّذ design_directions(chosen) ثم أعد brand_kit.",
        };
      }
      const effectivePersonality = chosenDirection.personality || personality;
      const effectiveBaseColor = chosenDirection.baseColor || baseColor;
      const kit = buildBrandKit({
        brandName,
        personality: effectivePersonality,
        ...(effectiveBaseColor?.trim() ? { baseColor: effectiveBaseColor } : {}),
        locale,
        scheme,
        logoStyle,
      });

      const written: string[] = [];
      for (const file of kit.files) {
        const { data: existing } = await supabase
          .from("files")
          .select("id, version")
          .eq("project_id", pid)
          .eq("path", file.path)
          .maybeSingle();
        if (existing) {
          await snapshot(supabase, pid, userId, file.path);
          await supabase
            .from("files")
            .update({ content: file.content, version: existing.version + 1 })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("files")
            .insert({ project_id: pid, user_id: userId, path: file.path, content: file.content });
        }
        written.push(file.path);
      }

      return {
        ok: true,
        written,
        appliedDirection: chosenDirection.id,
        palette: kit.palette,
        fonts: kit.fonts,
        summary: kit.summary,
        headSnippet: kit.files.find((f) => f.path === "brand/head.html")?.content ?? "",
        note: `الهوية مُشتقّة حرفياً من الاتجاه المعتمد (${chosenDirection.id}). ممنوع كتابة أي لون مباشر بعد الآن — استعمل متغيّرات brand/tokens.css فقط.`,
      };
    },
  });

  const starterKitTool = tool({
    description:
      "طقم بداية جاهز لكل نوع منتج (saas, store, agency, luxury, portfolio, restaurant, landing, blog): يعيد خطة صفحات كاملة مبنية على قصاصات Weaver UI + عقد محتوى لكل قسم + معايير قبول + محظورات + طابع هوية ولون مقترح لتمريره إلى brand_kit. نفّذه بلا id لرؤية الأطقم، ثم بالـ id المناسب قبل أي كتابة ملفات. لا تخترع بنية صفحات من عندك بينما يوجد طقم مناسب.",
    inputSchema: z.object({
      id: z.string().default("").describe("معرّف الطقم، أو فارغ لعرض القائمة"),
      withSnippets: z
        .boolean()
        .default(false)
        .describe("إرجاع HTML القصاصات المطلوبة مباشرة مع الخطة"),
    }),
    execute: async ({ id, withSnippets }) => {
      if (!id) {
        return {
          kits: listStarterKits(),
          note: "اختر الطقم الأقرب لنشاط المستخدم ثم استدعِ الأداة به. الطقم يحدّد الصفحات والأقسام وعقد المحتوى.",
        };
      }
      const planned = planFromKit(id);
      if (!planned) {
        return { ok: false, error: `طقم غير معروف: ${id}`, kits: listStarterKits() };
      }
      const { kit, plan, snippets } = planned;
      // تثبيت الطقم في مساحة العمل — هو أول شرط من شروط فتح كتابة الواجهة.
      await putDoc(
        KIT_DOC,
        [
          `# طقم البداية المعتمد`,
          `id: ${kit.id}`,
          `name: ${kit.name}`,
          `personality: ${kit.personality}`,
          `baseColor: ${kit.baseColor}`,
          ``,
          `## الأقسام الإلزامية`,
          ...kit.required.map((r) => `- ${r}`),
          ``,
          `## معايير القبول`,
          ...kit.acceptance.map((a) => `- ${a}`),
          ``,
          `## محظورات`,
          ...kit.avoid.map((a) => `- ${a}`),
        ].join("\n"),
      );
      return {
        ok: true,
        kit: {
          id: kit.id,
          name: kit.name,
          personality: kit.personality,
          baseColor: kit.baseColor,
          required: kit.required,
          acceptance: kit.acceptance,
          avoid: kit.avoid,
        },
        pages: plan,
        copyContract: kit.copyContract,
        ...(withSnippets ? { snippets } : { snippetIds: snippets.map((s) => s.id) }),
        next: [
          `نفّذ design_directions بـ kit=${kit.id} واعرض الاتجاهات الثلاثة على المستخدم بـ ask_user.`,
          "بعد ردّه نفّذ design_directions بـ chosen ثم brand_kit.",
          "نفّذ copy_brief لكتابة كل النصوص أولاً كقائمة.",
          "اجلب القصاصات بـ ui_snippet وألصقها بالترتيب المذكور في pages.",
          "بعد كل صفحة نفّذ copy_audit ثم browser_check حتى designGate.pass=true.",
        ],
        gate: "كتابة ملفات html/css محجوبة حتى ينتهي: design_directions(chosen) ثم brand_kit.",
      };
    },
  });

  const copyBriefTool = tool({
    description:
      "مرحلة النصوص المنفصلة: يعيد عقد المحتوى المطلوب لكل قسم + قواعد الصوت والنبرة العربية. نفّذه قبل كتابة أي HTML واكتب كل النصوص أولاً، ثم ألصقها في قصاصات ui_snippet. ممنوع تأليف النص أثناء بناء الـ HTML.",
    inputSchema: z.object({
      kit: z.string().default("").describe("معرّف طقم البداية إن وُجد"),
      business: z
        .string()
        .default("")
        .describe("وصف نشاط المستخدم الحقيقي بالتفصيل (الاسم، الخدمة، الجمهور، المدينة)"),
    }),
    execute: async ({ kit, business }) => copyBrief(kit, business || undefined),
  });

  const copyAuditTool = tool({
    description:
      "تدقيق حتمي لنصوص صفحة HTML مكتوبة فعلاً: يكشف العناصر النائبة {{...}}، lorem، الأرقام والروابط الوهمية، الحشو التسويقي، العناوين التصنيفية العامة والمكرّرة، الأزرار الضعيفة، قصر المحتوى، ونقص title/description. نفّذه على كل صفحة بعد كتابتها وقبل browser_check.",
    inputSchema: z.object({
      path: z.string().describe("مسار الصفحة داخل المشروع مثل index.html"),
    }),
    execute: async ({ path }) => {
      const { supabase, projectId: pid } = guard();
      const { data: file } = await supabase
        .from("files")
        .select("content")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();
      if (!file) return { ok: false, error: `الملف ${path} غير موجود.` };
      const result = auditCopy(file.content, { path });
      return {
        ok: result.ok,
        path,
        score: result.score,
        stats: result.stats,
        issues: result.issues.slice(0, 25),
        hint: result.ok
          ? "النصوص اجتازت التدقيق — تابع browser_check."
          : "أصلح كل ملاحظة error ثم أعد copy_audit. النشر ممنوع مع وجود عناصر نائبة أو محتوى سطحي.",
      };
    },
  });

  const uiSnippet = tool({
    description:
      "يعيد قصاصات HTML جاهزة ومُختبرة من مكتبة Weaver UI (brand/ui.css) — هيدر بقائمة جوال، هيرو، ميزات، bento، خطوات، معرض، أسعار، شهادات، أسئلة شائعة، CTA، نموذج تواصل، فوتر، وهيكل صفحة كامل. استدعِه بلا ids للحصول على الفهرس، أو بمعرّفات لجلب القصاصات. ألصق القصاصة واستبدل القيم بين {{ }} بمحتوى حقيقي فقط — ممنوع إعادة كتابة CSS هذه المكوّنات يدوياً.",
    inputSchema: z.object({
      ids: z
        .array(z.string())
        .describe("معرّفات القصاصات المطلوبة، أو مصفوفة فارغة لعرض الفهرس فقط"),
    }),
    execute: async ({ ids }) => {
      if (!ids || ids.length === 0) {
        return {
          index: listSnippets(),
          note: "استدعِ الأداة مرة أخرى بالمعرّفات المطلوبة. كل الأنماط موجودة في brand/ui.css ولا تحتاج كتابة CSS لها.",
        };
      }
      const found = getSnippets(ids);
      const missing = ids.filter((id) => !found.some((s) => s.id === id));
      return {
        snippets: found,
        ...(missing.length ? { missing, index: listSnippets() } : {}),
        rules: [
          "استبدل كل {{PLACEHOLDER}} بمحتوى عربي حقيقي — ممنوع تركها كما هي.",
          "اربط brand/ui.css في <head> وbrand/ui.js بـ defer قبل </body>.",
          "لا تكرّر أنماط .u-* داخل styles.css؛ استخدم styles.css للأنماط الخاصة بالمشروع فقط.",
        ],
      };
    },
  });

  const stackPlanTool = tool({
    description:
      "يعيد المنظومة الهندسية الموصى بها لبناء مشروع كبير: الإطار والحزم وأوامر التهيئة وبنية المجلدات ومعايير الجودة. نفّذه قبل أي مشروع أكبر من صفحة واحدة، ثم ثبّت الحزم عبر shell/run_command.",
    inputSchema: z.object({
      kind: z
        .enum([
          "landing",
          "marketing",
          "dashboard",
          "saas",
          "ecommerce",
          "api",
          "realtime",
          "content",
        ])
        .describe("نوع المشروع المطلوب"),
    }),
    execute: async ({ kind }) => buildStackPlan(kind as StackKind),
  });

  const seoKit = tool({
    description:
      "يولّد ويكتب طبقة SEO والأصول القياسية للموقع: sitemap.xml و robots.txt و site.webmanifest و favicon.svg وكتلة <head> جاهزة (canonical + Open Graph + JSON-LD). نفّذه قبل النشر وألصق كتلة الـ head في كل صفحة.",
    inputSchema: z.object({
      siteName: z.string().describe("اسم الموقع كما يظهر للزائر"),
      description: z.string().describe("وصف الموقع في أقل من 155 حرفاً"),
      baseUrl: z
        .string()
        .describe("العنوان الأساسي للموقع بعد النشر مثل https://example.com/s/my-site"),
      themeColor: z.string().describe("لون الهوية بصيغة hex مثل #0f766e"),
      organizationType: z
        .string()
        .describe("نوع الجهة في schema.org مثل Organization أو LocalBusiness أو Person"),
    }),
    execute: async ({ siteName, description, baseUrl, themeColor, organizationType }) => {
      const { supabase, userId, projectId: pid } = guard();
      const { data: files } = await supabase.from("files").select("path").eq("project_id", pid);

      const kit = buildSeoKit({
        siteName,
        description,
        baseUrl,
        themeColor,
        organizationType,
        pages: ((files ?? []) as Array<{ path: string }>).map((f) => f.path),
      });

      const written: string[] = [];
      for (const file of kit.files) {
        const { data: existing } = await supabase
          .from("files")
          .select("id, version")
          .eq("project_id", pid)
          .eq("path", file.path)
          .maybeSingle();
        if (existing) {
          await snapshot(supabase, pid, userId, file.path);
          await supabase
            .from("files")
            .update({ content: file.content, version: existing.version + 1 })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("files")
            .insert({ project_id: pid, user_id: userId, path: file.path, content: file.content });
        }
        written.push(file.path);
      }

      return { written, headSnippet: kit.headSnippet };
    },
  });

  const promoteBuild = tool({
    description:
      "ينقل ناتج البناء (مجلد dist/ أو build/) إلى جذر مساحة العمل حتى يعمل النشر على /s/<slug>. استخدمه بعد نجاح npm run build عبر run_command.",
    inputSchema: z.object({
      from: z.string().describe("مجلد ناتج البناء مثل dist أو build"),
      reason: z.string().describe("سبب الترقية"),
    }),
    execute: async ({ from, reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      const prefix = `${from.replace(/^\/+|\/+$/g, "")}/`;
      const { data: files } = await supabase
        .from("files")
        .select("path, content")
        .eq("project_id", pid)
        .like("path", `${prefix}%`);

      if (!files?.length) {
        return {
          ok: false,
          error: `لا توجد ملفات تحت ${prefix} — شغّل البناء أولاً عبر run_command.`,
        };
      }

      const moved: string[] = [];
      for (const file of files) {
        const target = file.path.slice(prefix.length);
        if (!target || target.includes("..")) continue;
        const { data: existing } = await supabase
          .from("files")
          .select("id, version")
          .eq("project_id", pid)
          .eq("path", target)
          .maybeSingle();
        if (existing) {
          await snapshot(supabase, pid, userId, target);
          await supabase
            .from("files")
            .update({ content: file.content, version: existing.version + 1 })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("files")
            .insert({ project_id: pid, user_id: userId, path: target, content: file.content });
        }
        moved.push(target);
      }

      return { ok: true, moved, count: moved.length, reason };
    },
  });

  const runStatus = tool({
    description:
      "يعرض حالة ومخرجات أمر سابق من run_command. يمكن حذف runId لقراءة أحدث أمر في المشروع.",
    inputSchema: z.object({ runId: z.string().uuid().optional() }),
    execute: async ({ runId }) => {
      const { supabase, projectId: pid } = guard();
      let query = supabase
        .from("runs")
        .select("id, status, output, exit_code, input")
        .eq("project_id", pid)
        .eq("kind", "command");
      query = runId
        ? query.eq("id", runId)
        : query.order("created_at", { ascending: false }).limit(1);
      const { data } = await query.maybeSingle();
      if (!data) return { error: "الأمر غير موجود." };
      return {
        runId: data.id,
        status: data.status,
        exitCode: data.exit_code,
        command: ((data.input ?? {}) as { command?: string }).command ?? "",
        output: (data.output ?? "").slice(-12_000),
      };
    },
  });

  const runChecksTool = tool({
    description:
      "ينفّذ فحصاً حقيقياً على ملفات مساحة العمل: تحليل نحوي لملفات JavaScript، تحقق من صحة JSON، توازن CSS، سلامة وسوم HTML، ووجود المراجع المحلية. يسجّل النتيجة في سجل التشغيل. استخدمه قبل إعلان نجاح أي مهمة.",
    inputSchema: z.object({
      reason: z.string().describe("لأي مهمة يجري هذا الفحص"),
    }),
    execute: async ({ reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      const { data } = await supabase
        .from("files")
        .select("path, content")
        .eq("project_id", pid)
        .order("path", { ascending: true });

      const report = runChecks(data ?? []);
      await supabase.from("runs").insert({
        project_id: pid,
        user_id: userId,
        kind: "check",
        input: { command: "weaver verify", reason },
        status: report.ok ? "passed" : "failed",
        exit_code: report.ok ? 0 : 1,
        output: JSON.stringify(report),
      });

      return report;
    },
  });

  const fixErrors = tool({
    description:
      "يعيد تشغيل run_checks تلقائياً ويصلح الأخطاء والتحذيرات المكتشفة في ملفات مساحة العمل. استخدمه عندما يطلب المستخدم 'أصلح الأخطاء' أو بعد كتابة ملفات لضمان نظافة الفحص.",
    inputSchema: z.object({
      maxIterations: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe("عدد محاولات الإصلاح القصوى"),
      focus: z.enum(["errors", "warnings", "all"]).default("all").describe("أي المشاكل تُصلح"),
    }),
    execute: async ({ maxIterations, focus }) => {
      const { supabase, userId, projectId: pid } = guard();
      const apiKey = process.env["OPENROUTER_API_KEY"];
      if (!apiKey) return { ok: false, error: "OPENROUTER_API_KEY غير مضبوط" };

      const origin = process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app";
      const openrouter = createOpenRouterProvider(apiKey, origin);
      const fixerModel = process.env["WEAVER_FIXER_MODEL"] || "google/gemini-2.5-flash";

      let files =
        (
          await supabase
            .from("files")
            .select("path, content")
            .eq("project_id", pid)
            .order("path", { ascending: true })
        ).data ?? [];

      let report = runChecks(files);
      if (report.ok) return { ok: true, fixed: [], iterations: 0, report };

      const fixedFiles: string[] = [];
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const issuesToFix =
          focus === "all"
            ? report.issues
            : report.issues.filter((i) =>
                focus === "errors" ? i.severity === "error" : i.severity === "warning",
              );

        const byFile = new Map<string, Issue[]>();
        for (const issue of issuesToFix) {
          if (!issue.path || issue.path === "-") continue;
          const arr = byFile.get(issue.path) ?? [];
          arr.push(issue);
          byFile.set(issue.path, arr);
        }

        if (byFile.size === 0) break;

        const batch: { path: string; content: string }[] = [];
        for (const [path, fileIssues] of byFile.entries()) {
          const file = (files as Array<{ path: string; content: string }>).find(
            (f) => f.path === path,
          );
          if (!file) continue;
          const prompt = buildFixPrompt(path, file.content, fileIssues);
          const result = await generateText({
            model: openrouter(fixerModel),
            messages: [{ role: "user", content: prompt }],
            maxOutputTokens: 12_000,
          });
          // تسجيل استهلاك نموذج الإصلاح حتى تبقى الفوترة دقيقة
          try {
            const inputTokens = result.usage?.inputTokens ?? 0;
            const outputTokens = result.usage?.outputTokens ?? 0;
            if (inputTokens || outputTokens) {
              await supabase.from("usage_events").insert({
                project_id: pid,
                user_id: userId,
                model: fixerModel,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: result.usage?.totalTokens ?? inputTokens + outputTokens,
                cost_usd: estimateCostUsd(fixerModel, inputTokens, outputTokens),
              });
            }
          } catch {
            /* تتبّع الاستهلاك لا يُفشل الإصلاح */
          }
          const fixed = extractCode(result.text);

          if (fixed && fixed !== file.content) {
            batch.push({ path, content: fixed });
          }
        }

        for (const { path, content } of batch) {
          await snapshot(supabase, pid, userId, path);
          const { data: existing } = await supabase
            .from("files")
            .select("id, version")
            .eq("project_id", pid)
            .eq("path", path)
            .maybeSingle();
          if (existing) {
            await supabase
              .from("files")
              .update({ content, version: existing.version + 1 })
              .eq("id", existing.id);
          } else {
            await supabase
              .from("files")
              .insert({ project_id: pid, user_id: userId, path, content });
          }
          fixedFiles.push(path);
        }

        files =
          (
            await supabase
              .from("files")
              .select("path, content")
              .eq("project_id", pid)
              .order("path", { ascending: true })
          ).data ?? [];
        report = runChecks(files);
        if (report.ok) break;
      }

      await supabase.from("runs").insert({
        project_id: pid,
        user_id: userId,
        kind: "check",
        input: { command: "weaver fix_errors", focus, maxIterations },
        status: report.ok ? "passed" : "failed",
        exit_code: report.ok ? 0 : 1,
        output: JSON.stringify(report),
      });

      return {
        ok: report.ok,
        fixed: [...new Set(fixedFiles)],
        iterations: maxIterations,
        report,
      };
    },
  });

  const publishSite = tool({
    description:
      "ينشر مساحة عمل المشروع كموقع عام مباشر على مسار /s/<slug>. استخدمه بعد نجاح run_checks ووجود index.html.",
    inputSchema: z.object({
      slug: z.string().describe("عنوان مختصر بالإنجليزية للموقع، مثل coffee-shop"),
      reason: z.string().describe("سبب النشر / أي مهمة يحقق"),
    }),
    execute: async ({ slug, reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      const base =
        slug
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "site";

      const { data: workspace } = await supabase
        .from("files")
        .select("path, content")
        .eq("project_id", pid)
        .order("path", { ascending: true });
      const files = workspace ?? [];
      const index = files.find((file: { path: string }) => file.path === "index.html");
      const styles = files.find((file: { path: string }) => file.path === "styles.css");
      if (!index) throw new Error("لا يوجد index.html في مساحة العمل — أنشئه أولاً.");
      if (!styles || styles.content.trim().length < 400) {
        throw new Error("لا يوجد styles.css صالح واحترافي — أكمل التصميم أولاً.");
      }
      const report = runChecks(files);
      if (!report.ok) {
        throw new Error(`فشل النشر لأن فحص الجودة لم ينجح: ${report.summary}`);
      }

      const { data: latestRun } = await supabase
        .from("runs")
        .select("status")
        .eq("project_id", pid)
        .eq("kind", "check")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRun?.status !== "passed") {
        throw new Error("يجب تنفيذ run_checks بنجاح مباشرة قبل النشر.");
      }

      // بوابة (1): اختبار متصفح حقيقي تلقائي قبل كل نشر — لا يعتمد على تذكّر النموذج.
      if (runtimeConfigured()) {
        const browser = await runBrowserCheck({ devices: ["desktop", "mobile"] }).catch(
          (error: unknown) => ({
            ok: false,
            errors: [String(error).slice(0, 300)],
            warnings: [] as string[],
            results: [],
          }),
        );
        if (!browser.ok) {
          throw new Error(
            `فشل اختبار المتصفح التلقائي قبل النشر — أصلح هذه الأخطاء ثم أعد المحاولة:\n${browser.errors
              .slice(0, 15)
              .join("\n")}`,
          );
        }
        // بوابة (1ب): درجة التصميم الحتمية — أرقام مقيسة من DOM، لا رأي نموذج.
        const gate = aggregateDesignScores(
          browser.results
            .filter((r) => !r.navError)
            .map((r) => ({
              label: `index · ${r.device}`,
              score: scoreDesignMetrics(r.metrics, { device: r.device }),
            })),
        );
        if (!gate.pass) {
          throw new Error(
            `النشر محجوب — بوابة الجودة الرقمية: ${gate.score}/100 (الحد ${gate.threshold}) على ${gate.worstLabel}.\nنفّذ هذه الإصلاحات ثم أعد browser_check:\n${gate.topFixes.join("\n")}`,
          );
        }
      }

      // بوابة (2): مراجعة بصرية ناجحة أحدث من آخر تعديل على الملفات.
      const [{ data: lastFile }, { data: lastDesign }] = await Promise.all([
        supabase
          .from("files")
          .select("updated_at")
          .eq("project_id", pid)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("runs")
          .select("status, created_at")
          .eq("project_id", pid)
          .eq("kind", "design")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const designAt = lastDesign?.created_at ? Date.parse(lastDesign.created_at) : 0;
      const filesAt = lastFile?.updated_at ? Date.parse(lastFile.updated_at) : 0;
      if (lastDesign?.status !== "passed") {
        throw new Error(
          "النشر محجوب: لا توجد مراجعة بصرية ناجحة. نفّذ browser_check ثم design_review وأصلح كل ملاحظة حتى passed=true.",
        );
      }
      // فرق دقيقة واحدة يسمح بفروق التوقيت الطفيفة بين الكتابة والمراجعة.
      if (filesAt - designAt > 60_000) {
        throw new Error(
          "النشر محجوب: تغيّرت الملفات بعد آخر مراجعة بصرية. أعد browser_check ثم design_review على النسخة الحالية.",
        );
      }

      let finalSlug = "";
      for (let i = 0; i < 25; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`;
        const { error } = await supabase
          .from("projects")
          .update({
            slug: candidate,
            published: true,
            published_at: new Date().toISOString(),
            status: "deployed",
          })
          .eq("id", pid);
        if (!error) {
          finalSlug = candidate;
          break;
        }
        if (!error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
      }
      if (!finalSlug) throw new Error("تعذّر إيجاد عنوان متاح للنشر");

      await setDeployedUrl(pid, `${origin}/s/${finalSlug}`);
      await supabase.from("runs").insert({
        project_id: pid,
        user_id: userId,
        kind: "deploy",
        input: { slug: finalSlug, reason },
        status: "succeeded",
        exit_code: 0,
        output: `published at /s/${finalSlug}`,
      });

      return { url: `${origin}/s/${finalSlug}`, slug: finalSlug, deployed: true };
    },
  });

  const configureCustomDomain = tool({
    description:
      "يربط دوميناً مخصّصاً (مثل example.com) بالموقع المنشور: يتحقّق من سجلات DNS، ثم يهيّئ nginx على السيرفر ويصدر شهادة SSL تلقائياً. استخدمه بعد publish_site فقط. إذا لم تكن سجلات DNS جاهزة يعيد التعليمات الواجب على المستخدم إضافتها عند مزوّد الدومين.",
    inputSchema: z.object({
      domain: z.string().describe("الدومين بدون https مثل example.com"),
      email: z.string().optional().describe("بريد لإصدار شهادة Let's Encrypt (اختياري)"),
    }),
    execute: async ({ domain, email }) => {
      const { supabase, projectId: pid } = guard();
      const mod = await import("@/lib/domains.server");
      const clean = mod.normalizeDomain(domain);

      const { data: project } = await supabase
        .from("projects")
        .select("slug, published")
        .eq("id", pid)
        .maybeSingle();
      const slug = (project as { slug?: string | null } | null)?.slug ?? "";
      if (!project || !(project as { published?: boolean }).published || !slug) {
        throw new Error("انشر الموقع أولاً عبر publish_site ثم اربط الدومين.");
      }

      const dns = await mod.checkDomainDns(clean);
      const instructions = mod.dnsInstructions(clean);
      if (!dns.ok) {
        await mod.saveDomainState(pid, clean, "pending_dns", dns.detail);
        return {
          ok: false,
          stage: "dns",
          domain: clean,
          detail: dns.detail,
          instructions,
          message: `سجلات DNS غير جاهزة. اطلب من المستخدم إضافتها ثم أعد المحاولة:\n${instructions}`,
        };
      }

      const setup = await mod.requestDomainSetup(
        clean,
        slug,
        email ?? process.env["LETSENCRYPT_EMAIL"] ?? "",
      );
      await mod.saveDomainState(
        pid,
        clean,
        setup.ok ? "configuring" : "failed",
        setup.ok ? null : setup.log,
      );
      return {
        ok: setup.ok,
        stage: "provision",
        domain: clean,
        jobId: setup.jobId,
        url: `https://${clean}`,
        instructions,
        message: setup.ok
          ? `جارٍ تهيئة ${clean} وإصدار شهادة SSL على السيرفر. الرابط النهائي: https://${clean}`
          : `تعذّرت التهيئة: ${setup.log}`,
      };
    },
  });

  const appendFile = tool({
    description:
      "يلحق محتوى بنهاية ملف موجود في مساحة العمل (أو ينشئه إن لم يوجد). استخدمه لكتابة الملفات الكبيرة على دفعات دون اقتطاع.",
    inputSchema: z.object({
      path: z.string().describe("مسار الملف"),
      content: z.string().describe("الجزء التالي من المحتوى"),
    }),
    execute: async ({ path, content }) => {
      if (content.length > 400_000) {
        return {
          ok: false,
          path,
          error: "دفعة الإلحاق أكبر من 400000 حرف؛ قسّمها إلى دفعات أصغر.",
        };
      }
      const { supabase, userId, projectId: pid } = guard();
      const { data: existing } = await supabase
        .from("files")
        .select("id, version, content")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from("files")
          .insert({ project_id: pid, user_id: userId, path, content });
        if (error) throw new Error(error.message);
        return { path, version: 1, bytes: content.length };
      }

      const next = existing.content + content;
      await snapshot(supabase, pid, userId, path);
      const { error } = await supabase
        .from("files")
        .update({ content: next, version: existing.version + 1 })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { path, version: existing.version + 1, bytes: next.length };
    },
  });

  const deleteFile = tool({
    description: "يحذف ملفاً من مساحة عمل المشروع.",
    inputSchema: z.object({ path: z.string(), reason: z.string() }),
    execute: async ({ path, reason }) => {
      const { supabase, userId, projectId: pid } = guard();
      await snapshot(supabase, pid, userId, path);
      const { error } = await supabase
        .from("files")
        .delete()
        .eq("project_id", pid)
        .eq("path", path);
      if (error) throw new Error(error.message);
      return { path, deleted: true, reason };
    },
  });

  const generateImage = tool({
    description:
      "يولّد صورة حقيقية بالذكاء الاصطناعي ويحفظها كملف في مساحة العمل (مثل assets/hero.png). استخدمها بدل الصور الوهمية أو placeholder.",
    inputSchema: z.object({
      path: z.string().describe("مسار حفظ الصورة داخل المشروع، مثل assets/hero.png"),
      prompt: z.string().describe("وصف دقيق بالإنجليزية للصورة المطلوبة"),
    }),
    execute: async ({ path, prompt }) => {
      const { supabase, userId, projectId: pid } = guard();
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) return { path, ok: false, error: "مفتاح توليد الصور غير متاح" };

      const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
          stream: false,
        }),
      });
      if (!response.ok) {
        return { path, ok: false, error: `فشل التوليد (${response.status})` };
      }

      const payload = (await response.json()) as {
        data?: { b64_json?: string; url?: string }[];
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
      };
      const b64 = payload.data?.[0]?.b64_json;
      const direct =
        payload.data?.[0]?.url ?? payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const dataUrl = b64 ? `data:image/png;base64,${b64}` : direct;
      if (!dataUrl?.startsWith("data:")) {
        return { path, ok: false, error: "لم تُرجع الخدمة صورة صالحة" };
      }

      const { data: existing } = await supabase
        .from("files")
        .select("id, version")
        .eq("project_id", pid)
        .eq("path", path)
        .maybeSingle();

      if (existing) {
        await snapshot(supabase, pid, userId, path);
        await supabase
          .from("files")
          .update({ content: dataUrl, version: existing.version + 1 })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("files")
          .insert({ project_id: pid, user_id: userId, path, content: dataUrl });
      }

      return { path, ok: true, bytes: dataUrl.length, usage: `<img src="${path}" alt="">` };
    },
  });

  const askUser = tool({
    description:
      "يسأل المالك عن معلومة ضرورية لا يمكن تخمينها: توكن/مفتاح سري (يُحفظ في مفاتيح المشروع تلقائياً)، صور أو ملفات مرجعية، نص محتوى حقيقي، أو اختيار بين بدائل. تظهر للمالك بطاقة نموذج آمنة. بعد استدعائها أنهِ الجولة فوراً وانتظر الردّ.",
    inputSchema: z.object({
      reason: z.string().describe("سطر واحد يشرح لماذا هذه المعلومات مطلوبة الآن"),
      fields: z
        .array(
          z.object({
            name: z
              .string()
              .describe("معرّف الحقل؛ للأسرار استخدم صيغة متغيّر مثل TELEGRAM_BOT_TOKEN"),
            label: z.string().describe("سؤال قصير بالعربية يظهر للمالك"),
            type: z.enum(["text", "secret", "choice", "image", "file"]).default("text"),
            options: z.array(z.string()).default([]).describe("بدائل الاختيار عند type=choice"),
            placeholder: z.string().default(""),
            required: z.boolean().default(true),
          }),
        )
        .min(1)
        .max(6),
    }),
    execute: async ({ reason, fields }) => ({ awaiting: true, reason, fields }),
  });

  const designDirectionsTool = tool({
    description:
      "يولّد 3 اتجاهات بصرية مختلفة فعلاً (لا مجرد ألوان) مناسبة لطقم البداية المختار، مع لوحة ألوان وخطوط وتوقيع بصري ومحظورات لكل اتجاه. نفّذه بعد starter_kit وقبل brand_kit، اعرض الخيارات على المستخدم بـ ask_user (type=choice) وانتظر اختياره، ثم مرّر personality و baseColor للاتجاه المختار إلى brand_kit والتزم بتوقيعه ومحظوراته في كل الصفحات. إن اختار المستخدم مسبقاً مرّر chosen لاسترجاع تفاصيل الاتجاه فقط.",
    inputSchema: z.object({
      kit: z.string().default("").describe("معرّف طقم البداية المختار"),
      chosen: z
        .string()
        .default("")
        .describe("معرّف الاتجاه بعد اختيار المستخدم — يعيد تفاصيله الكاملة"),
    }),
    execute: async ({ kit, chosen }) => {
      if (chosen) {
        const dir = getDirection(chosen);
        if (!dir) {
          return {
            ok: false,
            error: `اتجاه غير معروف: ${chosen}`,
            options: listDirections().map((d) => d.id),
          };
        }
        // تثبيت الاتجاه في مساحة العمل — brand_kit سيشتقّ منه اللون والطابع حرفياً.
        await putDoc(
          DIRECTION_DOC,
          [
            `# الاتجاه البصري المعتمد`,
            `id: ${dir.id}`,
            `name: ${dir.name}`,
            `personality: ${dir.personality}`,
            `baseColor: ${dir.baseColor}`,
            `signature: ${dir.signature}`,
            ``,
            `## محظورات هذا الاتجاه`,
            ...dir.avoid.map((a) => `- ${a}`),
          ].join("\n"),
        );
        return {
          ok: true,
          direction: dir,
          next: [
            "نفّذ brand_kit الآن — سيأخذ الطابع واللون من هذا الاتجاه تلقائياً.",
            `طبّق التوقيع البصري: ${dir.signature}`,
            `ممنوع في هذا الاتجاه: ${dir.avoid.join("، ")}`,
            "لا تخلط عناصر من اتجاه آخر مهما بدت جميلة.",
          ],
        };
      }
      if (!kit && !(await readDoc(KIT_DOC))) {
        return {
          ok: false,
          error:
            "لم يُعتمد طقم بداية بعد. نفّذ starter_kit بلا id لرؤية الأطقم، ثم starter_kit بالمعرّف المناسب، ثم أعد design_directions.",
          kits: listStarterKits(),
        };
      }

      const q = directionsQuestion(kit);
      return {
        ok: true,
        question: q.question,
        directions: q.directions,
        askUserPayload: {
          reason: q.question,
          fields: [
            {
              name: "design_direction",
              label: "اختر الاتجاه البصري",
              type: "choice",
              options: q.options.map((o) => `${o.label} — ${o.description}`),
              required: true,
            },
          ],
        },
        next: "استدعِ ask_user بهذه الحقول وأنهِ الجولة. بعد الردّ استدعِ design_directions مع chosen=<معرّف الاتجاه>.",
      };
    },
  });

  /* ===================== Turbo Build — موقع كامل بخطوتين ===================== */
  const turboBuild = tool({
    description:
      "البناء فائق السرعة (المسار الافتراضي لأي موقع تسويقي/شركة/متجر/بورتفوليو): يبني الموقع كاملاً في خطوتين بدل عشرات الجولات، وبنفس سقف الجودة (نفس أطقم البداية والاتجاهات البصرية وتوكنات الهوية وقصاصات Weaver UI). " +
      "الخطوة 1: نفّذه بـ plan=true مع kit (و direction إن اخترته) — يعيد عقد المحتوى: كل صفحة وكل قسم والمفاتيح النصية المطلوبة. " +
      "الخطوة 2: أعده بـ plan=false مع نفس kit/direction + brand + copy تحتوي قيمة عربية حقيقية لكل مفتاح — فيكتب الهوية والمكتبة وكل الصفحات دفعةً واحدة ويدقّق النصوص تلقائياً. " +
      "بعدها فقط: auto_repair ← run_checks ← browser_check ← design_review ← publish_site. لا تستخدم starter_kit/design_directions/brand_kit/ui_snippet يدوياً إلا إذا طلب المستخدم تخطيطاً خاصاً خارج الأطقم.",
    inputSchema: z.object({
      plan: z.boolean().default(true).describe("true = أعِد عقد المحتوى فقط، false = ابنِ الموقع"),
      kit: z
        .string()
        .default("")
        .describe(
          "معرّف طقم البداية: saas, store, agency, luxury, portfolio, restaurant, landing, blog",
        ),
      direction: z
        .string()
        .default("")
        .describe("معرّف الاتجاه البصري المختار، أو فارغ ليُختار الأنسب للطقم تلقائياً"),
      brandName: z.string().default("").describe("اسم العلامة كما يظهر للزائر"),
      tagline: z.string().default("").describe("جملة تعريفية قصيرة بالعربية"),
      email: z.string().default("").describe("بريد التواصل"),
      phone: z.string().default("").describe("رقم الهاتف"),
      copy: z
        .array(
          z.object({
            page: z.string().describe("مسار الصفحة كما في عقد المحتوى، مثل index.html"),
            section: z.string().describe("معرّف القسم، مثل hero أو meta"),
            values: z.record(z.string(), z.string()).describe("قيمة عربية حقيقية لكل مفتاح"),
          }),
        )
        .default([])
        .describe("كل نصوص الموقع دفعة واحدة"),
    }),
    execute: async ({ plan, kit, direction, brandName, tagline, email, phone, copy }) => {
      const { supabase, userId, projectId: pid } = guard();
      if (!kit) {
        return {
          ok: false,
          error: "حدّد kit أولاً.",
          kits: listStarterKits(),
        };
      }
      const contract = contentContract(kit);
      if (!contract) return { ok: false, error: `طقم غير معروف: ${kit}`, kits: listStarterKits() };

      const dir = (direction ? getDirection(direction) : null) ?? directionsForKit(kit)[0] ?? null;
      if (!dir) return { ok: false, error: "تعذّر تحديد اتجاه بصري لهذا الطقم." };

      if (plan) {
        return {
          ok: true,
          mode: "plan",
          kit: {
            id: contract.kit.id,
            name: contract.kit.name,
            required: contract.kit.required,
            acceptance: contract.kit.acceptance,
            avoid: contract.kit.avoid,
          },
          direction: { id: dir.id, name: dir.name, signature: dir.signature, avoid: dir.avoid },
          pages: contract.pages,
          copyContract: contract.kit.copyContract,
          next: `اكتب كل النصوص العربية الحقيقية الآن وأعد turbo_build بـ plan=false و kit=${kit} و direction=${dir.id} مع brand و copy كاملة (لا تترك أي مفتاح فارغاً ولا نصاً عاماً).`,
        };
      }

      if (!brandName.trim()) return { ok: false, error: "brandName مطلوب." };

      const composed = composeSite({
        kitId: kit,
        brand: {
          name: brandName,
          tagline: tagline || contract.kit.name,
          email: email || "info@example.com",
          phone: phone || "",
        },
        copy,
      });
      if (!composed) return { ok: false, error: "تعذّر التركيب." };
      if (composed.missing.length) {
        return {
          ok: false,
          mode: "missing_copy",
          missing: composed.missing,
          error: "نصوص ناقصة — أعد turbo_build بـ plan=false بعد ملء كل المفاتيح المذكورة.",
        };
      }

      // 1) عقد التصميم: الطقم + الاتجاه
      await putDoc(
        KIT_DOC,
        [
          `# طقم البداية المعتمد`,
          `id: ${contract.kit.id}`,
          `name: ${contract.kit.name}`,
          `personality: ${contract.kit.personality}`,
          `baseColor: ${contract.kit.baseColor}`,
          ``,
          `## الأقسام الإلزامية`,
          ...contract.kit.required.map((r) => `- ${r}`),
          ``,
          `## معايير القبول`,
          ...contract.kit.acceptance.map((a) => `- ${a}`),
          ``,
          `## محظورات`,
          ...contract.kit.avoid.map((a) => `- ${a}`),
        ].join("\n"),
      );
      await putDoc(
        DIRECTION_DOC,
        [
          `# الاتجاه البصري المعتمد`,
          `id: ${dir.id}`,
          `name: ${dir.name}`,
          `personality: ${dir.personality}`,
          `baseColor: ${dir.baseColor}`,
          `signature: ${dir.signature}`,
          ``,
          `## محظورات هذا الاتجاه`,
          ...dir.avoid.map((a) => `- ${a}`),
        ].join("\n"),
      );

      // 2) الهوية + مكتبة المكوّنات
      const brandFiles = buildBrandKit({
        brandName,
        personality: dir.personality,
        baseColor: dir.baseColor,
        locale: "ar",
        scheme: "light",
        logoStyle: "monogram",
      });

      const all = [...brandFiles.files, ...uiLibraryFiles(), ...composed.files];
      for (const file of all) await putDoc(file.path, file.content);
      designContractReady = true;

      // 3) تدقيق نصوص حتمي لكل صفحة
      const audits = composed.files
        .filter((f) => f.path.endsWith(".html"))
        .map((f) => {
          const a = auditCopy(f.content, { path: f.path });
          return {
            path: f.path,
            ok: a.ok,
            score: a.score,
            issues: a.issues.filter((i) => i.level === "error").slice(0, 5),
          };
        });
      const clean = audits.every((a) => a.ok);

      return {
        ok: true,
        mode: "built",
        written: all.map((f) => f.path),
        direction: dir.id,
        palette: brandFiles.palette,
        copyAudit: audits,
        next: clean
          ? "الموقع مكتوب كاملاً. نفّذ الآن: auto_repair ← run_checks ← browser_check (designGate ≥ 85) ← design_review ← seo_kit ← publish_site."
          : "عالج ملاحظات copyAudit بـ edit_file على الصفحات المذكورة، ثم أكمل: run_checks ← browser_check ← design_review ← publish_site.",
      };
    },
  });

  const envList = tool({
    description: "يسرد أسماء مفاتيح/متغيّرات هذا المشروع المحفوظة (بدون قيمها).",
    inputSchema: z.object({}),
    execute: async () => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("project_secrets")
        .select("name, updated_at")
        .eq("project_id", pid);
      return { secrets: data ?? [] };
    },
  });

  const envGet = tool({
    description:
      "يقرأ قيمة مفتاح مشروع محفوظ لاستخدامه في كود الموقع أو الاتصال بخدمة خارجية. لا تطبع القيمة في ردّك للمستخدم.",
    inputSchema: z.object({ name: z.string() }),
    execute: async ({ name }) => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("project_secrets")
        .select("value")
        .eq("project_id", pid)
        .eq("name", name)
        .maybeSingle();
      return data ? { name, found: true, value: data.value } : { name, found: false };
    },
  });

  const memorySave = tool({
    description:
      "يحفظ معلومة دائمة عن هذا المشروع (قرار معماري، تفضيل المستخدم، هوية بصرية، قاعدة عمل) لتبقى متاحة في كل المحادثات القادمة. استخدمه كلما اتُّخذ قرار مهم.",
    inputSchema: z.object({
      key: z.string().min(1).max(80).describe("مفتاح قصير مثل brand.colors أو decision.auth"),
      value: z.string().min(1).max(8000),
      kind: z.enum(["decision", "preference", "constraint", "brand", "note"]).default("note"),
    }),
    execute: async ({ key, value, kind }) => {
      const { supabase, projectId: pid, userId } = guard();
      const { error } = await supabase
        .from("project_memory")
        .upsert(
          { project_id: pid, user_id: userId, key, value, kind },
          { onConflict: "project_id,key" },
        );
      if (error) return { ok: false, error: error.message };
      return { ok: true, key, kind };
    },
  });

  const memoryList = tool({
    description: "يقرأ كل ذاكرة هذا المشروع. نفّذه في بداية أي محادثة جديدة على مشروع قائم.",
    inputSchema: z.object({}),
    execute: async () => {
      const { supabase, projectId: pid } = guard();
      const { data } = await supabase
        .from("project_memory")
        .select("key, value, kind, updated_at")
        .eq("project_id", pid)
        .order("updated_at", { ascending: false });
      return { memory: data ?? [] };
    },
  });

  const memoryDelete = tool({
    description: "يحذف معلومة من ذاكرة المشروع عندما تصبح غير صحيحة.",
    inputSchema: z.object({ key: z.string().min(1) }),
    execute: async ({ key }) => {
      const { supabase, projectId: pid } = guard();
      await supabase.from("project_memory").delete().eq("project_id", pid).eq("key", key);
      return { ok: true, key };
    },
  });

  const dbMigrate = tool({
    description:
      "أداة احترافية لهجرة قواعد البيانات. تنفّذ أمر SQL (DDL/DML) على قاعدة بيانات المشروع وتحفظه فوراً كملف هجرة في supabase/migrations/ لتوثيقه وتتبعه في Git.",
    inputSchema: z.object({
      sql: z.string().describe("جملة أو جمل SQL كاملة (CREATE TABLE، فهارس، دوال، إلخ)"),
      reason: z.string().describe("سبب هذا التغيير أو وصف مختصر له (سيُستخدم كاسم للملف)"),
    }),
    execute: async ({ sql, reason }) => {
      const pid = guard().projectId;
      const { getTargetConfig, projectSchema, targetRunSql } =
        await import("@/lib/target-supabase.server");
      const cfg = getTargetConfig();
      if (!cfg) return { ok: false, error: "قاعدة البيانات غير مهيأة" };
      const schema = projectSchema(pid);

      try {
        const result = await targetRunSql(cfg, schema, sql);
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:T.]/g, "")
          .slice(0, 14);
        const safeReason = reason
          .replace(/[^a-z0-9_]/gi, "_")
          .toLowerCase()
          .slice(0, 30);
        const filename = `supabase/migrations/${timestamp}_${safeReason}.sql`;
        const fileResult = await writeOne(filename, sql, `Migration: ${reason}`);
        return {
          ok: true,
          executed: true,
          migrationFile: filename,
          fileWritten: fileResult.ok,
          result,
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  const runE2eTests = tool({
    description:
      "أداة اختبار الجودة التفاعلي (QA). تكتب وتنفّذ اختبار Playwright (E2E) للتأكد من تفاعل المكونات الفعلي (نقر أزرار، تعبئة نماذج، مسارات التنقل) وتعيد النتيجة.",
    inputSchema: z.object({
      testName: z.string().describe("اسم الاختبار (مثل login_flow)"),
      script: z.string().describe("كود Playwright الكامل (استيراد test و expect وكتابة الفحص)"),
    }),
    execute: async ({ testName, script }) => {
      const pid = guard().projectId;
      const safeName = testName.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
      const filename = `tests/${safeName}.spec.ts`;
      await writeOne(filename, script, `E2E Test: ${testName}`);
      const result = await runtimeExec(pid, `npx playwright test ${filename}`);
      return {
        ok: result.ok,
        filename,
        exitCode: result.exitCode,
        output: result.output.trim().slice(-2000),
      };
    },
  });

  return {
    db_migrate: dbMigrate,
    run_e2e_tests: runE2eTests,
    write_file: writeFile,
    write_files: writeFiles,

    edit_file: editFile,

    append_file: appendFile,
    delete_file: deleteFile,
    read_file: readFile,
    list_files: listFiles,
    run_command: runCommand,
    shell: shell,
    dev_server: devServer,
    browser_check: browserCheckTool,
    browser_open: browserOpenTool,
    browser_read: browserReadTool,
    browser_act: browserActTool,
    browser_close: browserCloseTool,

    auto_repair: autoRepair,
    run_status: runStatus,

    run_checks: runChecksTool,
    fix_errors: fixErrors,
    visual_audit: visualAudit,
    design_review: designReview,
    capture_reference: captureReference,
    brand_kit: brandKit,
    ui_snippet: uiSnippet,
    starter_kit: starterKitTool,
    copy_brief: copyBriefTool,
    copy_audit: copyAuditTool,

    stack_plan: stackPlanTool,
    seo_kit: seoKit,
    promote_build: promoteBuild,
    publish_site: publishSite,
    configure_custom_domain: configureCustomDomain,
    generate_image: generateImage,
    ask_user: askUser,
    design_directions: designDirectionsTool,
    turbo_build: turboBuild,

    env_list: envList,
    env_get: envGet,
    memory_save: memorySave,
    memory_list: memoryList,
    memory_delete: memoryDelete,
  };
}
