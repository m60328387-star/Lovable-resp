import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  generateText,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createOpenRouterProvider, getOpenRouterModelId } from "@/lib/openrouter.server";
import { resolveBuildModel, noteOpenRouterUnavailable } from "@/lib/build-provider.server";
import { authenticateRequest, type AuthedContext } from "@/lib/chat-auth.server";
import type { Json } from "@/integrations/supabase/types";
import {
  reconcileProjectState,
  saveBuildState,
  setDeployedUrl,
  type BuildPhase,
  type NextAction,
} from "@/lib/build-state.server";

import { runChecks, type Issue } from "@/lib/verify.server";
import { estimateCostUsd } from "@/lib/pricing";
import {
  getTargetConfig,
  targetSchema,
  targetRunSql,
  targetSelect,
  targetInsert,
  projectSchema,
} from "@/lib/target-supabase.server";
import {
  getSelfRepo,
  selfEdit,
  selfList,
  selfMap,
  selfRead,
  selfSearch,
  selfWrite,
} from "@/lib/self-repo.server";
import { DESIGN_KIT } from "@/lib/design-kit";
import { DESIGN_LIBRARY } from "@/lib/design-library";
import { buildDesignBlueprint, type DesignBlueprintKind } from "@/lib/design-blueprints";
import { buildProjectExecutionContext } from "@/lib/project-execution.server";
import { STACK_LIBRARY, buildStackPlan, type StackKind } from "@/lib/stack-library";
import { skillPrompt } from "@/lib/skills";
import { modePrompt } from "@/lib/modes";
import { webSearch, webFetch } from "@/lib/web.server";
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
import {
  applyModelOverrides,
  buildSemanticIndex,
  codeSearch,
  embeddingProvider,
  fastModelId,
  llmCall,
  projectMap,
  readSlice,
  reasoningModelId,
  semanticSearch,
  visionModelId,
} from "@/lib/intel.server";
import { buildBrandKit } from "@/lib/brand-kit";
import { buildSeoKit } from "@/lib/seo-kit";
import { reviewScreenshot } from "@/lib/design-critic.server";
import { compactMessages } from "@/lib/context-compaction";
import { resolveMaxOutputTokens, noteTokenBudgetError } from "@/lib/token-budget.server";
import {
  tgGetMe,
  tgSetWebhook,
  tgWebhookInfo,
  tgSendMessage,
  webhookSecret,
} from "@/lib/telegram.server";
import { MEMORY_RULE, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

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
function planningTools(auth: PlanningAuth, projectId: string | null) {
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

function workspaceTools(auth: AuthedContext | null, projectId: string | null, origin: string) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return { supabase: auth.supabase, userId: auth.userId, projectId };
  };

  /** الكتابة الفعلية لملف واحد — يشاركها write_file و write_files. */
  async function writeOne(path: string, content: string, summary: string, force = false) {
    // لا نرفض الملفات الكبيرة: الرفض كان يضيّع محتوى كتبه النموذج فعلاً (يظهر في الدردشة ولا يُحفظ).
    if (content.length > 400_000) {
      return {
        ok: false,
        path,
        error: "الملف أكبر من 400000 حرف. اكتب الجزء الأول ثم أكمل عبر append_file.",
      };
    }
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
        hint: result.ok
          ? "لا أخطاء في المتصفح — يمكنك متابعة design_review ثم النشر."
          : "أصلح كل خطأ ثم أعد browser_check حتى ok=true.",
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

  /** يضع أمراً في طابور المنفّذ وينتظر نتيجته الحقيقية. */
  const queueCommand = async (command: string, reason: string, waitSeconds: number) => {
    const { supabase, userId, projectId: pid } = guard();
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
      const passed = result.ok && verdict === "pass" && (score === null || score >= 80);
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
      const kit = buildBrandKit({
        brandName,
        personality,
        ...(baseColor?.trim() ? { baseColor } : {}),
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
        written,
        palette: kit.palette,
        fonts: kit.fonts,
        summary: kit.summary,
        headSnippet: kit.files.find((f) => f.path === "brand/head.html")?.content ?? "",
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

  return {
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
    stack_plan: stackPlanTool,
    seo_kit: seoKit,
    promote_build: promoteBuild,
    publish_site: publishSite,
    configure_custom_domain: configureCustomDomain,
    generate_image: generateImage,
    ask_user: askUser,
    env_list: envList,
    env_get: envGet,
    memory_save: memorySave,
    memory_list: memoryList,
    memory_delete: memoryDelete,
  };
}

/** أدوات التطوير الذاتي: تعديل كود منصة Weaver نفسها عبر مستودعها. */
/** أدوات التعديل الذاتي بمراجعة: تقترح تغييراً على كود المنصة بدل كتابته مباشرة. */
function platformTools(auth: AuthedContext | null) {
  return {
    propose_platform_change: tool({
      description:
        "يقترح تعديلاً على كود منصة Weaver نفسها ويحفظه كطلب مراجعة يظهر للمالك في صفحة «تطوير المنصة» مع Diff، ولا يُكتب حتى يعتمده. استخدمه بدل self_write_file عند أي تعديل على المنصة إلا إذا طلب المالك التطبيق المباشر.",
      inputSchema: z.object({
        title: z.string().describe("عنوان مختصر للتغيير"),
        description: z.string().describe("شرح ما سيتغيّر ولماذا"),
        files: z
          .array(z.object({ path: z.string(), content: z.string() }))
          .describe("الملفات بمحتواها الكامل بعد التعديل"),
      }),
      execute: async ({ title, description, files }) => {
        if (!auth) throw new Error("الجلسة غير صالحة");
        const { getSql } = await import("@/lib/db");
        const { ensurePlatformTables } = await import("@/lib/platform.server");
        const { getSelfRepo, selfRead, assertAllowed } = await import("@/lib/self-repo.server");
        await ensurePlatformTables();
        const repo = getSelfRepo();
        if (!repo) throw new Error("مستودع المنصة غير مضبوط");
        const payload: { path: string; before: string; after: string }[] = [];
        for (const f of files.slice(0, 20)) {
          const clean = assertAllowed(f.path);
          const current = await selfRead(repo, clean);
          payload.push({ path: clean, before: current.content, after: f.content });
        }
        const sql = getSql();
        const rows = await sql`
          INSERT INTO public.platform_changes (user_id, title, description, files)
          VALUES (${auth.userId}, ${title}, ${description ?? ""}, ${JSON.stringify(payload)}::jsonb)
          RETURNING id
        `;
        return {
          ok: true,
          changeId: String(rows[0]?.["id"] ?? ""),
          files: payload.map((f) => f.path),
          note: "بانتظار اعتماد المالك من صفحة تطوير المنصة",
        };
      },
    }),
    platform_settings_get: tool({
      description:
        "يقرأ إعدادات المنصة الحالية (النماذج، الحدود، الهوية) التي يضبطها المالك بلا كود.",
      inputSchema: z.object({}),
      execute: async () => {
        const { loadPlatformSettings } = await import("@/lib/platform.server");
        return loadPlatformSettings();
      },
    }),
  };
}

function selfTools() {
  const repo = getSelfRepo();
  if (!repo) return {};

  return {
    self_list_files: tool({
      description:
        "يسرد ملفات كود منصة Weaver نفسها (المستودع). استخدمه عندما يطلب المستخدم تعديل المنصة نفسها (ميزة، إصلاح، تغيير لون أو نص).",
      inputSchema: z.object({
        prefix: z.string().describe("بادئة المسار مثل src/components أو نص فارغ للكل"),
      }),
      execute: async ({ prefix }) => ({ files: await selfList(repo, prefix) }),
    }),
    self_read_file: tool({
      description: "يقرأ ملفاً من كود منصة Weaver نفسها. اقرأ دائماً قبل أي تعديل ذاتي.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => selfRead(repo, path),
    }),
    self_write_file: tool({
      description:
        "يكتب/يحدّث ملفاً في كود منصة Weaver نفسها ويعمل commit على الفرع الافتراضي. استخدمه فقط بعد self_read_file وبمحتوى كامل للملف، وبعد موافقة صريحة من المستخدم على تعديل المنصة.",
      inputSchema: z.object({
        path: z.string().describe("مسار الملف داخل مستودع Weaver"),
        content: z.string().describe("المحتوى الكامل للملف بعد التعديل"),
        message: z.string().describe("رسالة الـ commit بالعربية"),
        confirmed: z
          .boolean()
          .describe("true فقط إذا وافق المستخدم صراحةً في هذه المحادثة على تعديل كود المنصة"),
      }),
      execute: async ({ path, content, message, confirmed }) => {
        if (!confirmed) {
          return {
            error:
              "تعديل كود المنصة يحتاج موافقة صريحة من المستخدم. اسأله أولاً ثم أعد المحاولة مع confirmed=true.",
          };
        }
        // منع الكتابة على ملفات حسّاسة تكسر الأمان أو النشر
        const blocked = [
          /^\.env/i,
          /^supabase\/config\.toml$/i,
          /^src\/integrations\/supabase\//i,
          /^\.github\/workflows\//i,
          /(^|\/)package-lock\.json$|(^|\/)bun\.lock/i,
        ];
        const clean = path.replace(/^\.?\//, "");
        if (blocked.some((rule) => rule.test(clean))) {
          return { error: `الملف ${clean} محميّ ولا يمكن تعديله ذاتياً.` };
        }
        return selfWrite(repo, clean, content, message);
      },
    }),
    self_map: tool({
      description:
        "خريطة كود منصة Weaver: المجلدات وعدد ملفاتها وأكبر الملفات. استخدمه أولاً قبل أي إصلاح ذاتي لتحديد مكان العمل بأقل توكينز.",
      inputSchema: z.object({}),
      execute: async () => selfMap(repo),
    }),
    self_search: tool({
      description:
        "بحث نصّي داخل كود المنصة يعيد المسار ورقم السطر والنص. استخدمه للعثور على مكان الميزة أو الخطأ بدل التخمين.",
      inputSchema: z.object({
        query: z.string().describe("النص المطلوب البحث عنه"),
        prefix: z.string().describe("نطاق البحث مثل src أو deploy — استخدم src افتراضياً"),
      }),
      execute: async ({ query, prefix }) => selfSearch(repo, query, prefix || "src"),
    }),
    self_edit_file: tool({
      description:
        "تعديل جراحي على ملف من كود المنصة: يستبدل مقاطع محددة بدل إعادة كتابة الملف كاملاً، ويمر ببوابة تحقق قبل الالتزام. هذه الأداة المفضّلة لإصلاح المنصة.",
      inputSchema: z.object({
        path: z.string().describe("مسار الملف داخل مستودع Weaver"),
        edits: z
          .array(z.object({ find: z.string(), replace: z.string() }))
          .describe("مقاطع فريدة للاستبدال (find يجب أن يظهر مرة واحدة فقط)"),
        message: z.string().describe("رسالة الـ commit بالعربية"),
      }),
      execute: async ({ path, edits, message }) => {
        try {
          return await selfEdit(repo, path, edits, message);
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
    self_auto_repair: tool({
      description:
        "حلقة إصلاح مغلقة: يقرأ سجل آخر نشر فاشل، يستخرج رسائل الأخطاء والملفات المتورطة ويعيد محتواها لتصلحها مباشرة عبر self_edit_file ثم تعيد النشر.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getSql } = await import("@/lib/db");
        const { ensurePlatformTables } = await import("@/lib/platform.server");
        await ensurePlatformTables();
        const sql = getSql();
        const rows = await sql`
          SELECT status, log, created_at FROM public.platform_deploys
          ORDER BY created_at DESC LIMIT 1
        `;
        const last = rows[0];
        if (!last) return { ok: true, note: "لا يوجد سجل نشر بعد" };
        const log = String(last["log"] ?? "");
        if (last["status"] === "success")
          return { ok: true, note: "آخر نشر ناجح — لا حاجة للإصلاح" };
        const lines = log.split("\n");
        const errors = lines
          .filter((l) => /error|failed|cannot find|is not|TS\d{4}/i.test(l))
          .slice(-40);
        const paths = [
          ...new Set(
            [
              ...log.matchAll(
                /(?:^|[\s(])((?:src|deploy)\/[\w./-]+\.(?:tsx?|jsx?|css|json|mjs|sh))/g,
              ),
            ].map((m) => m[1] as string),
          ),
        ].slice(0, 5);
        const files: { path: string; content: string }[] = [];
        for (const p of paths) {
          const f = await selfRead(repo, p);
          if (f.found) files.push({ path: p, content: f.content.slice(0, 20000) });
        }
        return {
          ok: false,
          status: last["status"],
          errors,
          suspectFiles: paths,
          files,
          next: "أصلح الملفات أعلاه بـ self_edit_file ثم أعد deploy_platform.",
        };
      },
    }),
    deploy_platform: tool({
      description:
        "ينشر آخر إصدار من كود منصة Weaver على خادم Contabo (سحب من GitHub ثم إعادة بناء الحاويات وفحص صحي)، أو يتراجع عن آخر نشر. استخدمه بعد self_write_file عندما يطلب المالك تفعيل التعديلات على الخادم.",
      inputSchema: z.object({
        action: z.enum(["deploy", "rollback"]).describe("deploy للنشر أو rollback للتراجع"),
        confirmed: z.boolean().describe("true فقط بعد موافقة المالك الصريحة"),
      }),
      execute: async ({ action, confirmed }) => {
        if (!confirmed) return { error: "النشر يحتاج موافقة صريحة من المالك." };
        const { deployWithGuard } = await import("@/lib/platform.server");
        const result = await deployWithGuard(action);
        return {
          ok: result.ok,
          status: result.status,
          health: result.health ?? null,
          rolledBack: result.rolledBack ?? false,
          log: result.log.slice(-4000),
        };
      },
    }),
  };
}

/** أدوات الذكاء التحليلي: فهم أعمق وأسرع للمحتوى والمشروع. */
function intelTools(auth: AuthedContext | null, projectId: string | null) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return projectId;
  };

  return {
    project_map: tool({
      description:
        "خريطة كاملة للمشروع: كل ملف بحجمه ومخططه (أقسام/عناوين/دوال) دون قراءة المحتوى الكامل. استخدمه أولاً دائماً قبل أي تعديل لفهم الموقع بسرعة وبأقل توكينز.",
      inputSchema: z.object({}),
      execute: async () => projectMap(guard()),
    }),
    file_outline: tool({
      description:
        "مخطط ملف واحد: أقسامه وعناوينه ودواله مع أرقام الأسطر — بديل خفيف عن read_file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const map = await projectMap(guard());
        const file = map.files.find((f) => f.path === path);
        return file ? { ...file, found: true } : { path, found: false };
      },
    }),
    read_slice: tool({
      description:
        "يقرأ مقطعاً محدداً من ملف بالأسطر (from/to) بدل الملف كاملاً — أسرع وأدق للتعديلات الجراحية.",
      inputSchema: z.object({ path: z.string(), from: z.number(), to: z.number() }),
      execute: async ({ path, from, to }) => readSlice(guard(), path, from, to),
    }),
    code_search: tool({
      description:
        "بحث نصي مرتّب داخل كل ملفات المشروع يعيد المسار ورقم السطر والمقتطف. استخدمه لإيجاد موضع أي عنصر أو نص أو دالة فوراً.",
      inputSchema: z.object({ query: z.string(), limit: z.number() }),
      execute: async ({ query, limit }) => codeSearch(guard(), query, limit),
    }),
    semantic_index: tool({
      description:
        "يبني فهرساً دلالياً (Embeddings) لملفات المشروع لتمكين البحث بالمعنى. يتطلب مفتاح تضمين (OPENAI_API_KEY أو JINA_API_KEY أو VOYAGE_API_KEY).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!embeddingProvider()) {
          return { ok: false, error: "لا يوجد مفتاح تضمين مضبوط — استخدم code_search بدلاً منه." };
        }
        return buildSemanticIndex(guard());
      },
    }),
    semantic_search: tool({
      description:
        "بحث بالمعنى داخل فهرس المشروع (بعد semantic_index). يعيد المقاطع الأقرب دلالياً للسؤال.",
      inputSchema: z.object({ query: z.string(), limit: z.number() }),
      execute: async ({ query, limit }) => {
        if (!embeddingProvider()) {
          return { ok: false, error: "لا يوجد مفتاح تضمين — استخدم code_search." };
        }
        return semanticSearch(guard(), query, limit);
      },
    }),
    analyze_content: tool({
      description:
        "يحلّل نصاً طويلاً أو ملفات المشروع بنموذج سريع ويعيد خلاصة مركّزة/استخراجاً منظّماً حسب التعليمة. استخدمه لضغط المحتوى الضخم قبل التفكير فيه.",
      inputSchema: z.object({
        instruction: z.string().describe("ما المطلوب استخراجه أو تلخيصه"),
        text: z.string().describe("النص المراد تحليله، أو اتركه فارغاً واستخدم paths"),
        paths: z.array(z.string()).describe("مسارات ملفات من المشروع تُضاف للتحليل"),
      }),
      execute: async ({ instruction, text, paths }) => {
        const pid = guard();
        let body = text ?? "";
        for (const path of (paths ?? []).slice(0, 6)) {
          const slice = await readSlice(pid, path, 1, 1200);
          if (slice.found) body += `\n\n=== ${path} ===\n${slice.text}`;
        }
        if (!body.trim()) return { ok: false, error: "لا يوجد محتوى للتحليل" };
        const answer = await llmCall({
          model: fastModelId(),
          kind: "fast",
          system: "أنت محلل محتوى دقيق. أجب بالعربية، منظّماً ومختصراً بلا حشو.",
          content: `${instruction}\n\nالمحتوى:\n${body.slice(0, 120_000)}`,
          maxTokens: 2500,
        });
        return { ok: true, model: fastModelId(), analysis: answer };
      },
    }),
    deep_think: tool({
      description:
        "تحليل عميق بنموذج تفكير قوي لقرار معماري أو تشخيص مشكلة معقّدة. يعيد استنتاجاً وخطوات تنفيذ. استخدمه عند التردد بدل التخمين.",
      inputSchema: z.object({ question: z.string(), context: z.string() }),
      execute: async ({ question, context }) => {
        const answer = await llmCall({
          model: reasoningModelId(),
          kind: "reasoning",
          system:
            "أنت مهندس برمجيات أول. حلّل بعمق، وازن البدائل، ثم اعطِ قراراً واحداً واضحاً وخطوات تنفيذ مرقّمة بالعربية.",
          content: `السؤال: ${question}\n\nالسياق:\n${(context ?? "").slice(0, 60_000)}`,
          maxTokens: 3000,
        });
        return { ok: true, model: reasoningModelId(), analysis: answer };
      },
    }),
    analyze_image: tool({
      description:
        "يحلّل صورة أو لقطة شاشة عبر رابط (أو data URL) بنموذج رؤية: يصف التصميم، يستخرج النص، ويقترح تحسينات دقيقة.",
      inputSchema: z.object({ url: z.string(), question: z.string() }),
      execute: async ({ url, question }) => {
        const answer = await llmCall({
          model: visionModelId(),
          kind: "vision",
          system: "أنت ناقد تصميم ومحلّل بصري دقيق. أجب بالعربية بنقاط عملية قابلة للتنفيذ.",
          content: [
            { type: "text" as const, text: question || "حلّل هذه الصورة بدقة." },
            { type: "image_url" as const, image_url: { url } },
          ],
          maxTokens: 2000,
        });
        return { ok: true, model: visionModelId(), analysis: answer };
      },
    }),
    research: tool({
      description:
        "بحث معمّق: ينفّذ عدة استعلامات، يقرأ أفضل المصادر فعلياً، ثم يعيد خلاصة موثّقة بالروابط. استخدمه قبل بناء أي شيء يحتاج معايير أو توثيق حديث.",
      inputSchema: z.object({ topic: z.string(), queries: z.array(z.string()) }),
      execute: async ({ topic, queries }) => {
        const list = (queries ?? []).filter(Boolean).slice(0, 4);
        const all = list.length > 0 ? list : [topic];
        const found = (await Promise.all(all.map((q) => webSearch(q, 4)))).flat();
        const unique = Array.from(new Map(found.map((r) => [r.url, r])).values()).slice(0, 6);
        const pages = await Promise.all(
          unique.slice(0, 4).map(async (r) => {
            try {
              const page = await webFetch(r.url, 6000);
              return `=== ${r.title} (${r.url}) ===\n${(page as { content?: string }).content ?? ""}`;
            } catch {
              return `=== ${r.title} (${r.url}) ===\n${r.snippet}`;
            }
          }),
        );
        const summary = await llmCall({
          model: fastModelId(),
          kind: "fast",
          system: "أنت باحث تقني. لخّص بالعربية بنقاط عملية مع ذكر الرابط بجانب كل معلومة مهمة.",
          content: `الموضوع: ${topic}\n\nالمصادر:\n${pages.join("\n\n").slice(0, 100_000)}`,
          maxTokens: 2500,
        });
        return { ok: true, sources: unique, summary };
      },
    }),
  };
}

/** أدوات البحث على الإنترنت (مجانية بلا اشتراك). */
function webTools() {
  return {
    web_search: tool({
      description:
        "يبحث على الإنترنت فعلياً (DuckDuckGo) ويعيد نتائج بعناوين وروابط ومقتطفات. استخدمه لأي معلومة حديثة أو متغيّرة: أسعار، إصدارات، توثيق، أخبار، مقارنات.",
      inputSchema: z.object({
        query: z.string().describe("استعلام البحث"),
        limit: z.number().describe("عدد النتائج المطلوبة 1-10"),
      }),
      execute: async ({ query, limit }) => ({ query, results: await webSearch(query, limit) }),
    }),
    web_fetch: tool({
      description:
        "يفتح رابطاً ويعيد محتوى الصفحة نصاً/Markdown نظيفاً للقراءة. استخدمه بعد web_search لقراءة المصادر المهمة فعلياً قبل الاستنتاج.",
      inputSchema: z.object({ url: z.string().describe("رابط كامل يبدأ بـ https://") }),
      execute: async ({ url }) => webFetch(url),
    }),
  };
}

/**
 * يعيد الأصل العام الصحيح للروابط المنشورة.
 * إذا كان الطلب قادماً من عنوان IP خام (مثل http://194.163.155.52) نستخدم
 * WEAVER_PUBLIC_URL إن وُجد حتى لا تظهر روابط المشاريع بعنوان IP غير آمن.
 */
export function resolvePublicOrigin(requestOrigin: string) {
  const configured = (process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app")
    .trim()
    .replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(requestOrigin).hostname;
  } catch {
    return configured || requestOrigin;
  }
  const isRawIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isRawIp && !isLocal) return configured;
  return requestOrigin;
}

/** يحوّل أصل الطلب إلى رابط عام ثابت صالح لـ Webhook تيليغرام. */
function publicBase(origin: string) {
  const url = new URL(origin);
  const match = url.host.match(/^id-preview--([0-9a-f-]+)\.(.+)$/i);
  if (match) return `https://project--${match[1]}-dev.${match[2]}`;
  return url.origin;
}

/** أدوات بوتات تيليغرام: تسجيل بوت للمشروع وربط الـWebhook وإرسال الرسائل. */
function botTools(auth: AuthedContext | null, projectId: string | null, origin: string) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return { supabase: auth.supabase, userId: auth.userId, projectId };
  };

  const loadBot = async () => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase
      .from("bots")
      .select("id, token, username, persona, model, enabled, webhook_url")
      .eq("project_id", pid)
      .eq("platform", "telegram")
      .maybeSingle();
    return data;
  };

  return {
    bot_setup: tool({
      description:
        "يسجّل بوت تيليغرام لهذا المشروع ويربط الـWebhook تلقائياً بحيث يبدأ البوت بالرد على المستخدمين فوراً. يحتاج توكن البوت من @BotFather (مرة واحدة؛ بعدها يكفي تمرير persona للتحديث).",
      inputSchema: z.object({
        token: z.string().describe("توكن البوت من BotFather، أو نص فارغ للاحتفاظ بالتوكن المسجّل"),
        persona: z
          .string()
          .describe("تعليمات وشخصية البوت: من هو، ماذا يفعل، أسلوبه، وما لا يفعله"),
      }),
      execute: async ({ token, persona }) => {
        const { supabase, userId, projectId: pid } = guard();
        const existing = await loadBot();
        const botToken = token.trim() || existing?.token;
        if (!botToken)
          throw new Error("لا يوجد توكن مسجّل؛ اطلب من المستخدم توكن البوت من @BotFather");

        const me = await tgGetMe(botToken);
        const url = `${publicBase(origin)}/api/public/tg/${pid}`;
        await tgSetWebhook(botToken, url, await webhookSecret(botToken));

        const row = {
          project_id: pid,
          user_id: userId,
          platform: "telegram",
          token: botToken,
          username: me.username ?? null,
          persona,
          webhook_url: url,
          enabled: true,
        };
        const { error } = existing
          ? await supabase.from("bots").update(row).eq("id", existing.id)
          : await supabase.from("bots").insert(row);
        if (error) throw new Error(error.message);

        return {
          username: me.username,
          link: me.username ? `https://t.me/${me.username}` : null,
          webhook: url,
          message: "تم ربط البوت؛ أي رسالة تصل إليه سيرد عليها تلقائياً.",
        };
      },
    }),

    bot_status: tool({
      description: "يعرض حالة بوت تيليغرام لهذا المشروع: اسم المستخدم، الويب هوك، وعدد الرسائل.",
      inputSchema: z.object({}),
      execute: async () => {
        const { supabase } = guard();
        const bot = await loadBot();
        if (!bot) return { linked: false };
        const info = await tgWebhookInfo(bot.token).catch(() => null);
        const { count } = await supabase
          .from("bot_messages")
          .select("id", { count: "exact", head: true })
          .eq("bot_id", bot.id);
        return {
          linked: true,
          username: bot.username,
          enabled: bot.enabled,
          webhook: bot.webhook_url,
          messages: count ?? 0,
          telegram: info,
        };
      },
    }),

    bot_send: tool({
      description: "يرسل رسالة من البوت إلى محادثة محددة (اختبار أو إشعار). يحتاج chat_id.",
      inputSchema: z.object({
        chat_id: z.string().describe("معرّف المحادثة في تيليغرام"),
        text: z.string().describe("نص الرسالة (HTML بسيط مسموح)"),
      }),
      execute: async ({ chat_id, text }) => {
        const bot = await loadBot();
        if (!bot) throw new Error("لا يوجد بوت مرتبط بهذا المشروع؛ استخدم bot_setup أولاً");
        await tgSendMessage(bot.token, chat_id, text);
        return { sent: true, chat_id };
      },
    }),
  };
}

/** أدوات قاعدة بيانات المشروع: مخطط مستقل لكل مشروع داخل نفس القاعدة. */
function targetSupabaseTools(projectId: string) {
  const cfg = getTargetConfig();
  if (!cfg) return {};
  const schema = projectSchema(projectId);

  const inspect = tool({
    description:
      "يفحص مخطط قاعدة بيانات هذا المشروع (جداول وأعمدة مساحته المستقلة). استخدمه قبل أي تعديل.",
    inputSchema: z.object({}),
    execute: async () => ({ schema: await targetSchema(cfg, schema) }),
  });

  const sql = tool({
    description:
      "ينفّذ SQL فعلياً داخل مساحة هذا المشروع (CREATE TABLE، فهارس، دوال). لا تكتب اسم المخطط؛ الجداول تُنشأ تلقائياً داخل مساحة المشروع.",
    inputSchema: z.object({
      sql: z.string().describe("جملة أو جمل SQL كاملة"),
      reason: z.string().describe("سبب هذا التغيير ولأي مهمة"),
    }),
    execute: async ({ sql: statement, reason }) => ({
      reason,
      result: await targetRunSql(cfg, schema, statement),
    }),
  });

  const readRows = tool({
    description: "يقرأ صفوفاً من جدول داخل مساحة هذا المشروع.",
    inputSchema: z.object({
      table: z.string(),
      where: z.string().describe("شرط SQL بدون كلمة where، أو نص فارغ"),
      limit: z.number().describe("عدد الصفوف (1-200)"),
    }),
    execute: async ({ table, where, limit }) => ({
      rows: await targetSelect(cfg, schema, table, where, limit),
    }),
  });

  const insertRows = tool({
    description: "يدرج صفوفاً في جدول داخل مساحة هذا المشروع.",
    inputSchema: z.object({
      table: z.string(),
      rows: z.array(z.record(z.string(), z.unknown())).describe("الصفوف المراد إدراجها"),
    }),
    execute: async ({ table, rows }) => ({
      inserted: await targetInsert(cfg, schema, table, rows),
    }),
  });

  return {
    db_inspect: inspect,
    db_sql: sql,
    db_select: readRows,
    db_insert: insertRows,
  };
}

type ChatRequestBody = {
  messages?: unknown;
  projectId?: unknown;
  model?: unknown;
  skills?: unknown;
  mode?: unknown;
};

/** حد الخطوات لكل رسالة، وحد زمني يمنع قطع الاتصال في منتصف البناء. */
const MAX_STEPS = Number(process.env["WEAVER_MAX_STEPS"] ?? 160);
const TIME_BUDGET_MS = Number(process.env["WEAVER_TIME_BUDGET_MS"] ?? 240_000);

/** إعداد التفكير الموسّع: أقصى ذكاء افتراضياً مع إمكانية التخفيف عبر متغيّر بيئة. */
function reasoningConfig(): { enabled: boolean; effort?: "high" | "medium" | "low" } {
  const raw = (process.env["WEAVER_REASONING_EFFORT"] ?? "high").toLowerCase();
  if (raw === "off" || raw === "false" || raw === "none") return { enabled: false };
  const effort = raw === "low" || raw === "medium" ? raw : "high";
  return { enabled: true, effort };
}

function budgetReached(startedAt: number) {
  return () => Date.now() - startedAt > TIME_BUDGET_MS;
}

type AnyTool = { execute?: (...args: never[]) => unknown };

type LifecycleState = {
  hasDesignBlueprint: boolean;
  hasTasks: boolean;
  allTasksDone: boolean;
  hasFiles: boolean;
  checksPassed: boolean;
  /** آخر design_review على النسخة الحالية انتهى بـ pass — بوابة إلزامية قبل النشر. */
  designPassed: boolean;
  published: boolean;
  acted: boolean;
};

const BUILD_INTENT_PATTERN =
  /(?:ابن|بناء|أنش|انش|صمّم|صمم|طوّر|طور|أضف|اضف|عدّل|عدل|أصلح|اصلح|نفّذ|نفذ|انشر|موقع|تطبيق|مشروع|ميزة|كود|صفحة|أكمل|اكمل|تابع|build|create|implement|develop|fix|continue|deploy)/i;

/** يميّز طلب التنفيذ عن السؤال العام حتى لا تدخل المحادثات العادية في حلقة بناء. */
export function hasBuildIntent(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = (lastUser?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  return BUILD_INTENT_PATTERN.test(text);
}

/** آخر نصّ كتبه المستخدم — يُستخدم لاختيار الأدوات المرسلة للنموذج. */
function lastUserText(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return (lastUser?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .toLowerCase();
}

/**
 * يحدّد مجموعات الأدوات المرسلة في هذه الجولة.
 * إرسال كل الأدوات دائماً كان يضيف آلاف التوكينات إلى كل خطوة من خطوات الوكيل،
 * وهو أحد أكبر أسباب البطء وطول الصمت مقارنة بالمنصات الكبرى.
 */
export function selectToolGroups(mode: string, messages: UIMessage[]) {
  const text = lastUserText(messages);
  const mentions = (pattern: RegExp) => pattern.test(text);
  if (mode === "platform") {
    return { workspace: false, bot: false, db: false, connectors: false, platform: true };
  }
  return {
    workspace: mode === "build",
    bot: mode === "bot" || mentions(/telegram|تيليغرام|بوت|bot/),
    db:
      mode === "build" &&
      mentions(/قاعدة|جدول|sql|database|supabase|بيانات|تسجيل|حساب|auth|مستخدم/),
    connectors: mentions(
      /connector|رابط خارجي|api|notion|airtable|slack|github|resend|unsplash|بريد|webhook/,
    ),
    platform: mentions(/weaver نفس|المنصة نفسها|عدّل المنصة|طوّر المنصة|self_/),
  };
}

/** البناء مكتمل فعلياً حين توجد ملفات + نجح الفحص + تم النشر — حالة محفوظة في قاعدة البيانات. */
export function isBuildComplete(state: LifecycleState) {
  return (
    state.hasDesignBlueprint &&
    state.hasTasks &&
    state.allTasksDone &&
    state.hasFiles &&
    state.checksPassed &&
    state.designPassed &&
    state.published
  );
}

export function isBuildIncomplete(state: LifecycleState, buildIntent: boolean) {
  if (!buildIntent) return false;
  // إن كان المشروع مكتملاً بالفعل فلا نطلب استئنافاً حتى لو كانت الجولة نصّية فقط.
  return !isBuildComplete(state);
}

/** الخطوة التالية الوحيدة المطلوبة لإغلاق البناء — تُرسَل للواجهة وتُحقن في التعليمات. */
export function nextBuildAction(state: LifecycleState): string | null {
  if (!state.hasFiles && !state.hasDesignBlueprint)
    return "أنشئ عقد التصميم عبر design_blueprint ثم brand_kit قبل كتابة ملفات الواجهة.";
  if (!state.hasFiles)
    return "اكتب ملفات المشروع الفعلية عبر write_file (ابدأ بـ index.html و styles.css).";
  if (!state.hasTasks || !state.allTasksDone)
    return "نفّذ حزمة المهمة الجاهزة من دفتر التنفيذ، ثم أغلقها عبر update_task مع دليل قبول؛ لا تنتقل للفحص النهائي قبل انتهاء الرسم.";
  if (!state.checksPassed)
    return "شغّل run_checks وأصلح كل خطأ عبر fix_errors/write_file حتى ينجح الفحص.";
  if (!state.designPassed)
    return "نفّذ browser_check ثم design_review على النسخة الحالية وأصلح كل ملاحظة حتى passed=true (النشر محجوب قبلها).";
  if (!state.published) return "انشر المشروع عبر publish_site واذكر الرابط /s/<slug>.";
  return null;
}

function isSuccessfulResult(value: unknown) {
  if (!value || typeof value !== "object") return true;
  const result = value as { ok?: unknown; error?: unknown };
  return result.ok !== false && !result.error;
}

function applyToolResult(state: LifecycleState, name: string, value: unknown) {
  if (!isSuccessfulResult(value)) return;
  if (
    [
      "write_file",
      "write_files",
      "append_file",
      "edit_file",
      "delete_file",
      "promote_build",
      "run_checks",
      "fix_errors",
      "run_command",
      "shell",
      "publish_site",
    ].includes(name)
  ) {
    state.acted = true;
  }
  if (name === "build_task_graph") state.hasTasks = true;
  if (name === "design_blueprint") state.hasDesignBlueprint = true;
  if (name === "update_task") {
    const result = value as { status?: string; allTasksDone?: boolean };
    state.allTasksDone = result.allTasksDone === true;
  }
  if (
    [
      "write_file",
      "write_files",
      "append_file",
      "edit_file",
      "delete_file",
      "promote_build",
    ].includes(name)
  ) {
    state.hasFiles = true;
    state.checksPassed = false;
    // أي تعديل على الملفات يُبطل المراجعة البصرية السابقة — يجب إعادتها قبل النشر.
    state.designPassed = false;
    state.published = false;
  }
  if (name === "run_checks" || name === "fix_errors") {
    const result = value as { ok?: boolean };
    state.checksPassed = result.ok === true;
  }
  if (name === "design_review") {
    const result = value as { passed?: boolean };
    state.designPassed = result.passed === true;
  }
  if (name === "publish_site") state.published = true;
}

function lifecyclePhase(state: LifecycleState): BuildPhase {
  if (state.published) return "done";
  if (state.checksPassed) return "verify";
  if (state.hasFiles) return "execute";
  if (state.hasTasks) return "graph";
  return "intake";
}

function lifecycleNextAction(state: LifecycleState): NextAction | undefined {
  if (state.published) return "done";
  if (!state.hasFiles) return "execute_next_task";
  if (!state.checksPassed) return "run_checks";
  return "deploy";
}

const RETRYABLE_TOOLS = new Set([
  "write_file",
  "write_files",
  "append_file",
  "edit_file",
  "delete_file",
  "run_checks",
  "fix_errors",
  "publish_site",
  "run_command",
  "shell",
  "dev_server",
  "browser_check",
  "browser_open",
  "browser_read",
  "browser_act",
  "browser_close",

  "auto_repair",
  "promote_build",
  "generate_image",
  "visual_audit",
  "web_search",
  "web_fetch",
  "research",
  "analyze_content",
  "deep_think",
  "analyze_image",
  "semantic_index",
]);

const RETRY_DELAYS_MS = [400, 1200];

/**
 * نتائج الأدوات المنظّمة ({ ok:false }) نتيجة حتمية وليست عطلاً عابراً:
 * إعادة محاولتها كانت تضيف ثوانيَ صمت لكل خطوة (وتعيد فحصاً فاشلاً بلا داعٍ).
 * لا نعيد المحاولة إلا على الأعطال العابرة فعلاً (شبكة/مهلة/5xx/حدّ معدّل).
 */
const TRANSIENT_ERROR =
  /(fetch failed|network|timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|socket|rate limit|429|50[0-4]\b|temporarily|overloaded)/i;

function isTransientError(message: string) {
  return TRANSIENT_ERROR.test(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ToolEvent = {
  name: string;
  ok: boolean;
  attempt: number;
  durationMs: number;
  detail?: string | undefined;
};

/**
 * يمنع خطأ أداة واحدة من إسقاط البثّ كاملاً، ويعيد المحاولة تلقائياً
 * مع تأخير تصاعدي (backoff) للأدوات الحسّاسة مثل write_file و run_checks.
 */
export function hardenTools<T extends Record<string, unknown>>(
  tools: T,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
  audit?: { userId?: string | null; projectId?: string | null },
): T {
  const logAudit = (
    name: string,
    ok: boolean,
    durationMs: number,
    attempt: number,
    detail?: string | undefined,
  ) => {
    void import("@/lib/audit.server")
      .then(({ recordAudit }) =>
        recordAudit({
          userId: audit?.userId ?? null,
          projectId: audit?.projectId ?? null,
          kind: name.startsWith("connector") || name === "http_request" ? "connector" : "tool",
          name,
          ok,
          durationMs,
          attempt,
          detail: detail ?? null,
        }),
      )
      .catch(() => undefined);
  };
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(tools)) {
    const t = value as AnyTool;
    if (typeof t?.execute !== "function") {
      out[name] = value;
      continue;
    }
    const original = t.execute.bind(t);
    const maxAttempts = RETRYABLE_TOOLS.has(name) ? RETRY_DELAYS_MS.length + 1 : 1;
    out[name] = {
      ...(value as object),
      execute: async (...args: never[]) => {
        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const startedAt = Date.now();
          try {
            const { runInSandbox } = await import("@/lib/sandbox.server");
            const result = await runInSandbox(name, async () => original(...args));
            const ok = isSuccessfulResult(result);
            const okDetail = ok ? undefined : JSON.stringify(result).slice(0, 400);
            onEvent?.({ name, ok, attempt, durationMs: Date.now() - startedAt, detail: okDetail });
            logAudit(name, ok, Date.now() - startedAt, attempt, okDetail);
            // النتيجة المنظّمة تُعاد فوراً — نجحت أو فشلت — بلا إعادة محاولة
            onResult?.(name, result);
            return result;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            console.error(`[weaver:tool:${name}] attempt ${attempt}`, lastError);
            onEvent?.({
              name,
              ok: false,
              attempt,
              durationMs: Date.now() - startedAt,
              detail: lastError,
            });
            logAudit(name, false, Date.now() - startedAt, attempt, lastError);
            if (attempt === maxAttempts || !isTransientError(lastError)) {
              return { ok: false, error: lastError, tool: name, attempts: attempt };
            }
          }
          await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 2000);
        }
        return { ok: false, error: lastError, tool: name, attempts: maxAttempts };
      },
    };
  }
  return out as T;
}

/** أدوات الروابط الخارجية (Connectors) ونداءات HTTP العامة. */
function connectorTools(projectId: string | null, userId: string | null = null) {
  /** يمنع الوكيل من استعمال رابط عطّله المالك من صفحة الروابط. */
  const assertEnabled = async (connectorId: string) => {
    const { enabledConnectorIds } = await import("@/lib/connector-settings.server");
    const allowed = await enabledConnectorIds(userId);
    if (allowed && !allowed.includes(connectorId)) {
      return `الرابط ${connectorId} معطّل من إعدادات الروابط. فعّله من صفحة «الروابط» أو استخدم رابطاً مفعّلاً.`;
    }
    return null;
  };
  return {
    connector_list: tool({
      description:
        "يسرد الروابط الخارجية المجانية المتاحة (Telegram، GitHub، Notion، Airtable، Resend، Slack، Unsplash، بيانات مفتوحة…) مع حالة المفتاح لكل واحد. نفّذه قبل أي تكامل خارجي.",
      inputSchema: z.object({}),
      execute: async () => {
        const { listConnectorStatus } = await import("@/lib/connectors.server");
        const { enabledConnectorIds } = await import("@/lib/connector-settings.server");
        const allowed = await enabledConnectorIds(userId);
        const all = await listConnectorStatus(projectId);
        return { connectors: allowed ? all.filter((c) => allowed.includes(c.id)) : all };
      },
    }),
    connector_call: tool({
      description:
        "ينفّذ نداءً على رابط خارجي من سجل الروابط باستخدام مفتاح المشروع تلقائياً (لا تكتب المفتاح أبداً). حدّد connectorId والمسار والطريقة والجسم.",
      inputSchema: z.object({
        connectorId: z.string().describe("معرّف الرابط من connector_list"),
        path: z.string().describe("المسار بعد قاعدة العنوان، مثل /user/repos"),
        method: z.string().describe("GET أو POST أو PATCH أو DELETE"),
        query: z.record(z.string(), z.string()).describe("معاملات الاستعلام، أو كائن فارغ"),
        body: z.string().describe("جسم الطلب كنص JSON، أو نص فارغ"),
      }),
      execute: async ({ connectorId, path, method, query, body }) => {
        const blocked = await assertEnabled(connectorId);
        if (blocked) return { ok: false, error: blocked };
        const { callConnector } = await import("@/lib/connectors.server");
        let parsed: unknown = undefined;
        if (body && body.trim()) {
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
        }
        return callConnector({
          projectId,
          connectorId,
          path,
          method,
          query: query ?? {},
          ...(parsed === undefined ? {} : { body: parsed }),
        });
      },
    }),
    http_request: tool({
      description:
        "نداء HTTP عام على أي واجهة برمجية عامة (بلا عناوين داخلية). استخدمه فقط عندما لا يوجد رابط جاهز في connector_list.",
      inputSchema: z.object({
        url: z.string().describe("رابط https كامل"),
        method: z.string().describe("GET أو POST أو PATCH أو DELETE"),
        headers: z.record(z.string(), z.string()).describe("ترويسات إضافية أو كائن فارغ"),
        body: z.string().describe("جسم الطلب كنص، أو نص فارغ"),
      }),
      execute: async ({ url, method, headers, body }) => {
        const { httpCall } = await import("@/lib/connectors.server");
        return httpCall({
          url,
          method,
          headers: headers ?? {},
          ...(body && body.trim() ? { body } : {}),
        });
      },
    }),
  };
}

/** مجموعة أدوات Weaver الكاملة — يشاركها مسار الدردشة والعامل الخلفي. */
export function buildWeaverToolset(
  auth: AuthedContext,
  projectId: string | null,
  origin: string,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
) {
  return hardenTools(
    {
      ...planningTools(auth, projectId),
      ...webTools(),
      ...intelTools(auth, projectId),
      ...workspaceTools(auth, projectId, origin),
      ...botTools(auth, projectId, origin),
      ...(projectId ? targetSupabaseTools(projectId) : {}),
      ...connectorTools(projectId, auth.userId),
      ...selfTools(),
      ...platformTools(auth),
    },

    onResult,
    onEvent,
    { userId: auth.userId, projectId },
  );
}

/** نص النظام الكامل — يشاركه مسار الدردشة والعامل الخلفي. */
export function buildWeaverSystem(activeSkills: string[], mode: string, customPrompt = "") {
  return (
    SYSTEM_PROMPT +
    MEMORY_RULE +
    DESIGN_KIT +
    DESIGN_LIBRARY +
    STACK_LIBRARY +
    skillPrompt(activeSkills) +
    customPrompt +
    modePrompt(mode)
  );
}

/** لقطة حالة المشروع الحقيقية تُحقن في كل جولة حتى لا يعيد النموذج عملاً منجزاً ولا يتوقف قبل الإغلاق. */
function statusPrompt(state: LifecycleState, buildIntent: boolean, runtimeReady = true) {
  if (!buildIntent) return "";
  const next = nextBuildAction(state);
  const lines = [
    "",
    "=== حالة المشروع الحالية (من قاعدة البيانات، ليست تخميناً) ===",
    `عقد التصميم محفوظ: ${state.hasDesignBlueprint ? "نعم" : "لا"}`,
    `كل مهام الرسم منجزة: ${state.allTasksDone ? "نعم" : "لا"}`,
    `ملفات مكتوبة: ${state.hasFiles ? "نعم" : "لا"}`,
    `آخر run_checks ناجح: ${state.checksPassed ? "نعم" : "لا"}`,
    `مراجعة بصرية ناجحة على النسخة الحالية: ${state.designPassed ? "نعم" : "لا"}`,
    `منشور: ${state.published ? "نعم" : "لا"}`,
  ];
  if (!runtimeReady) {
    lines.push(
      "بيئة التنفيذ (المنفّذ) غير متاحة الآن: ممنوع طلب تشغيلها من المستخدم أو إنهاء المشروع بانتظارها.",
      "أكمل البناء والتحقق عبر run_checks و fix_errors و visual_audit ثم انشر عبر publish_site.",
    );
  }
  if (next) {
    lines.push(
      `الخطوة التالية الإلزامية في هذه الجولة: ${next}`,
      "ممنوع إنهاء الجولة بنص فقط أو بطلب مراجعة/موافقة قبل تنفيذ هذه الخطوة بأداة فعلية.",
    );
  } else {
    lines.push(
      "المشروع مكتمل ومنشور — لا تعِد البناء من الصفر، نفّذ فقط ما يطلبه المستخدم صراحةً.",
    );
  }
  return lines.join("\n") + "\n";
}

export { MAX_STEPS, TIME_BUDGET_MS, budgetReached, applyToolResult, statusPrompt };
export type { LifecycleState };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["OPENROUTER_API_KEY"];
        if (!key && !process.env["GEMINI_API_KEY"] && !process.env["GROQ_API_KEY"]) {
          return new Response("Missing model provider key", { status: 500 });
        }

        const auth = await authenticateRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const projectId = typeof body.projectId === "string" ? body.projectId : null;
        const origin = resolvePublicOrigin(new URL(request.url).origin);

        const requested =
          typeof body.model === "string" && /^[\w.-]+\/[\w.:-]+$/.test(body.model.trim())
            ? body.model.trim()
            : null;
        const modelId = requested ?? getOpenRouterModelId();
        const activeSkills = Array.isArray(body.skills)
          ? body.skills.filter((s): s is string => typeof s === "string").slice(0, 12)
          : [];
        const mode = typeof body.mode === "string" ? body.mode : "build";
        const buildIntent = mode === "build" && hasBuildIntent(messages as UIMessage[]);
        // اختيار الأدوات حسب الوضع والنيّة: إرسال كل الأدوات في كل خطوة كان
        // يضخّم الطلب ويبطّئ زمن أول توكن في كل دورة من دورات الوكيل.
        const needs = selectToolGroups(mode, messages as UIMessage[]);

        const lifecycle: LifecycleState = {
          hasDesignBlueprint: false,
          hasTasks: false,
          allTasksDone: false,
          hasFiles: false,
          checksPassed: false,
          designPassed: false,
          published: false,
          acted: false,
        };
        if (projectId) {
          try {
            const [
              { count: taskCount },
              { count: openTaskCount },
              { count: fileCount },
              { data: project },
              { data: latestCheck },
              { data: latestDesign },
              { data: latestFile },
              { count: blueprintCount },
            ] = await Promise.all([
              auth.supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId),
              auth.supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId)
                .neq("status", "done"),
              auth.supabase
                .from("files")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId),
              auth.supabase.from("projects").select("published").eq("id", projectId).maybeSingle(),
              auth.supabase
                .from("runs")
                .select("status")
                .eq("project_id", projectId)
                .eq("kind", "check")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              auth.supabase
                .from("runs")
                .select("status, created_at")
                .eq("project_id", projectId)
                .eq("kind", "design")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              auth.supabase
                .from("files")
                .select("updated_at")
                .eq("project_id", projectId)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              auth.supabase
                .from("project_memory")
                .select("key", { count: "exact", head: true })
                .eq("project_id", projectId)
                .eq("key", "design.blueprint"),
            ]);
            lifecycle.hasTasks = (taskCount ?? 0) > 0;
            lifecycle.allTasksDone = lifecycle.hasTasks && (openTaskCount ?? 0) === 0;
            lifecycle.hasFiles = (fileCount ?? 0) > 0;
            lifecycle.checksPassed = latestCheck?.status === "passed";
            // المراجعة البصرية تُعتبر سارية فقط إن كانت أحدث من آخر تعديل على الملفات.
            const designAt = latestDesign?.created_at ? Date.parse(latestDesign.created_at) : 0;
            const filesAt = latestFile?.updated_at ? Date.parse(latestFile.updated_at) : 0;
            lifecycle.designPassed =
              latestDesign?.status === "passed" && filesAt - designAt <= 60_000;
            lifecycle.published = project?.published === true;
            lifecycle.hasDesignBlueprint = (blueprintCount ?? 0) > 0;
          } catch {
            /* حالة الاكتمال مساعدة؛ الأدوات نفسها تبقى مصدر الحقيقة. */
          }
        }

        // نقطة استرجاع تلقائية قبل كل رسالة — تُنفَّذ في الخلفية حتى لا تؤخّر بدء الردّ
        if (projectId) {
          const lastUser = [...(messages as UIMessage[])].reverse().find((m) => m.role === "user");
          const label =
            (lastUser?.parts ?? [])
              .map((p) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .trim()
              .slice(0, 120) || "قبل رسالة جديدة";
          void (async () => {
            try {
              const { data: current } = await auth.supabase
                .from("files")
                .select("path, content")
                .eq("project_id", projectId);
              if (current && current.length > 0) {
                await auth.supabase.from("checkpoints").insert({
                  project_id: projectId,
                  user_id: auth.userId,
                  label,
                  file_count: current.length,
                  files: current as unknown as Json,
                });
              }
            } catch {
              /* نقطة الاسترجاع اختيارية ولا تُفشل المحادثة */
            }
          })();
        }

        // كل قراءات التهيئة تتم على التوازي حتى لا تتراكم زمنياً قبل أول توكن
        const platformModule = await import("@/lib/platform.server");
        const [customRows, platform, platformPrompt, executionContext] = await Promise.all([
          auth.supabase
            .from("custom_skills")
            .select("slug, name, prompt")
            .eq("enabled", true)
            .then((r) => r.data ?? [])
            .catch(() => []),
          platformModule.loadPlatformSettings(),
          platformModule.activePromptOverride(),
          buildProjectExecutionContext(auth.supabase, projectId),
        ]);

        // المهارات المخصّصة التي أنشأها المالك (skill-creator)
        let customPrompt = "";
        const active = (customRows as Array<{ slug: string; name: string; prompt: string }>).filter(
          (r) => activeSkills.includes(`custom:${r.slug}`),
        );
        if (active.length > 0) {
          customPrompt = `\n\n=== مهارات مخصّصة مفعّلة (التزم بها حرفياً) ===\n${active
            .map((r) => `مهارة "${r.name}":\n${r.prompt}`)
            .join("\n\n")}`;
        }

        applyModelOverrides(platform);
        const effectiveModel = requested ?? platform.primaryModel ?? modelId;
        const routed = resolveBuildModel(effectiveModel, origin);

        let stepsUsed = 0;
        // تثبيت حالة البناء الحقيقية (مشتقّة من قاعدة البيانات) عند أي نهاية للجولة.
        const persistBuildState = async () => {
          if (!projectId) return;
          try {
            // المصالحة تشتق الطور والخطوة التالية من قاعدة البيانات وتحفظهما.
            await reconcileProjectState(projectId);
          } catch {
            try {
              await saveBuildState(
                projectId,
                { phase: lifecyclePhase(lifecycle) },
                lifecycleNextAction(lifecycle),
                null,
              );
            } catch {
              // حالة البناء مساعدة؛ لا نُفشل الردّ
            }
          }
        };
        try {
          const result = streamText({
            model: routed.model,
            system:
              buildWeaverSystem(activeSkills, mode, customPrompt) +
              (platformPrompt
                ? `\n\nتعليمات إضافية من مالك المنصة (إلزامية):\n${platformPrompt}\n`
                : "") +
              statusPrompt(lifecycle, buildIntent, runtimeConfigured()) +
              executionContext,

            // ضغط سياق ذكي: يمنع انفجار حجم الطلب في المشاريع الكبيرة
            // (مخرجات أدوات ضخمة + عشرات الخطوات) وهو أهم سبب لتوقّف البناء في المنتصف.
            messages: await convertToModelMessages(compactMessages(messages as UIMessage[])),
            tools: hardenTools(
              {
                ...planningTools(auth, projectId),

                ...webTools(),
                ...(needs.workspace ? workspaceTools(auth, projectId, origin) : {}),
                ...(needs.bot ? botTools(auth, projectId, origin) : {}),
                ...(needs.db && projectId ? targetSupabaseTools(projectId) : {}),
                ...intelTools(auth, projectId),
                ...(needs.connectors ? connectorTools(projectId, auth.userId) : {}),
                ...(needs.platform ? selfTools() : {}),
                ...(needs.platform ? platformTools(auth) : {}),
              },
              (name, value) => applyToolResult(lifecycle, name, value),
              undefined,
              {
                userId: auth.userId,
                projectId,
              },
            ),
            // بعض النماذج ترسل اسم أداة فارغاً أو غير مطابق — نصحّحه بدل إسقاط الجولة.
            repairToolCall: async ({ toolCall, tools: available }) => {
              const names = Object.keys(available);
              const raw = String(toolCall.toolName ?? "").trim();
              const match =
                names.find((n) => n === raw) ??
                names.find((n) => n.toLowerCase() === raw.toLowerCase()) ??
                names.find((n) => raw && (n.includes(raw) || raw.includes(n)));
              if (!match) {
                // لا نحوّل الاسم الفارغ إلى أداة تحتاج مُدخلات. قراءة الملفات نقطة استرجاع آمنة.
                if (names.includes("list_files"))
                  return { ...toolCall, toolName: "list_files", input: "{}" };
                if (names.includes("memory_list"))
                  return { ...toolCall, toolName: "memory_list", input: "{}" };
                return null;
              }
              if (match === "run_status" && (!toolCall.input || toolCall.input === "{}")) {
                return { ...toolCall, toolName: match, input: "{}" };
              }
              return { ...toolCall, toolName: match };
            },
            stopWhen: [stepCountIs(platform.maxSteps || MAX_STEPS), budgetReached(startedAt)],
            maxOutputTokens: resolveMaxOutputTokens(platform.maxTokens),

            // تفكير موسّع لأقصى ذكاء (قابل للضبط عبر WEAVER_REASONING_EFFORT: high|medium|low|off)
            providerOptions: { openrouter: { reasoning: reasoningConfig() } },

            onStepFinish: () => {
              stepsUsed += 1;
            },

            onFinish: async ({ totalUsage }) => {
              try {
                const inputTokens = totalUsage?.inputTokens ?? 0;
                const outputTokens = totalUsage?.outputTokens ?? 0;
                if (inputTokens || outputTokens) {
                  await auth.supabase.from("usage_events").insert({
                    project_id: projectId,
                    user_id: auth.userId,
                    model: modelId,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: totalUsage?.totalTokens ?? inputTokens + outputTokens,
                    cost_usd: estimateCostUsd(modelId, inputTokens, outputTokens),
                  });
                }
              } catch {
                // تسجيل الاستهلاك لا يجب أن يُفشل الردّ
              }
              await persistBuildState();
            },

            onAbort: async () => {
              // حتى عند القطع نُثبّت حالة البناء الحقيقية حتى لا تتجمّد الواجهة.
              await persistBuildState();
            },

            onError: async () => {
              await persistBuildState();
            },
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
            sendReasoning: true,
            headers: { "X-Weaver-Model": routed.modelId, "X-Weaver-Provider": routed.provider },
            // نُعلم الواجهة أن الجولة انتهت بسبب حد الخطوات/الوقت لا لأن العمل اكتمل،
            // فتستأنف تلقائياً بدل أن يتوقف البناء في المنتصف.
            messageMetadata: ({ part }) =>
              part.type === "finish"
                ? {
                    truncated:
                      stepsUsed >= (platform.maxSteps || MAX_STEPS) ||
                      Date.now() - startedAt > TIME_BUDGET_MS,
                    incomplete: isBuildIncomplete(lifecycle, buildIntent),
                    complete: isBuildComplete(lifecycle),
                    nextAction: nextBuildAction(lifecycle),
                    lifecycle,
                    steps: stepsUsed,
                  }
                : undefined,

            onError: (error) => {
              const message = error instanceof Error ? error.message : String(error);
              console.error("[weaver:stream]", message);
              const learned = noteTokenBudgetError(error);
              const degraded = noteOpenRouterUnavailable(error);
              if (degraded) {
                return `رصيد OpenRouter غير كافٍ الآن — حوّلت البناء تلقائياً إلى Gemini/Groq. أعد الإرسال وسيكمل من آخر حالة محفوظة.`;
              }
              if (learned) {
                return `رصيد OpenRouter لا يسمح بحجم الرد المطلوب. خفّضت الحدّ تلقائياً إلى ${learned} توكن — أعد الإرسال وسيكمل البناء من آخر حالة محفوظة.`;
              }
              return `انقطعت هذه الجولة بسبب خطأ من المزوّد: ${message}\n\nسيستأنف Weaver التنفيذ تلقائياً من آخر حالة محفوظة.`;
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "OpenRouter error";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
