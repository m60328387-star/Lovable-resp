type DataClient = {
  // يتعمد هذا الحد قبول عميل Cloud وعميل Postgres المحلي ذوي الواجهة المتطابقة.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type TaskRow = {
  task_key: string;
  title: string;
  layer: string;
  depends_on: string[] | null;
  acceptance: string | null;
  verification: string[] | null;
  status: string;
  note: string | null;
  position: number;
};

type FileRow = { path: string; content: string | null; version: number };

function readyTasks(tasks: TaskRow[]) {
  const done = new Set(tasks.filter((task) => task.status === "done").map((task) => task.task_key));
  return tasks.filter(
    (task) =>
      task.status === "pending" &&
      (task.depends_on ?? []).every((dependency) => done.has(dependency)),
  );
}

function taskPacket(task: TaskRow | undefined) {
  if (!task) return "لا توجد حزمة جاهزة؛ افحص المهام المحجوبة أو أنشئ الموجة التالية.";
  return [
    `الحزمة الحالية: ${task.task_key} — ${task.title}`,
    `الطبقة: ${task.layer}`,
    `معيار القبول: ${task.acceptance || "يجب تحديده قبل التنفيذ"}`,
    `أدلة التحقق: ${(task.verification ?? []).join(", ") || "build"}`,
    "نفّذ هذه الحزمة فقط، حدّثها running قبل الكتابة وdone بعد إرفاق دليل تحقق. لا تبدأ حزمة أخرى في الجولة نفسها إلا إن كانت صغيرة ومستقلة.",
  ].join("\n");
}

/** سياق تنفيذي حتمي صغير يُعاد بناؤه من قاعدة البيانات في كل جولة. */
export async function buildProjectExecutionContext(
  client: DataClient,
  projectId: string | null,
): Promise<string> {
  if (!projectId) return "";
  try {
    const [taskResult, fileResult, specResult, memoryResult] = await Promise.all([
      client
        .from("tasks")
        .select("task_key,title,layer,depends_on,acceptance,verification,status,note,position")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      client
        .from("files")
        .select("path,content,version")
        .eq("project_id", projectId)
        .order("path", { ascending: true }),
      client
        .from("specs")
        .select("version,data")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("project_memory")
        .select("key,value,kind")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);
    const tasks = (taskResult.data ?? []) as TaskRow[];
    const files = (fileResult.data ?? []) as FileRow[];
    const ready = readyTasks(tasks);
    const running = tasks.find((task) => task.status === "running");
    const current = running ?? ready[0];
    const counts = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {});
    const fileMap = files
      .filter((file) => !file.path.startsWith(".weaver/shot-"))
      .slice(0, 120)
      .map((file) => `${file.path} (v${file.version}, ${(file.content ?? "").length}b)`)
      .join(" · ");
    const decisions = ((memoryResult.data ?? []) as Array<{ key: string; value: string }>)
      .slice(0, 10)
      .map((item) => `${item.key}: ${item.value.slice(0, 240)}`)
      .join(" | ");
    const spec = specResult.data as { version?: number; data?: unknown } | null;
    return (
      [
        "",
        "=== دفتر تنفيذ المشروع الكبير (مصدر الحقيقة، يُعاد من قاعدة البيانات كل جولة) ===",
        `المواصفات: ${spec ? `v${spec.version ?? 1} محفوظة` : "غير موجودة"}`,
        `المهام: ${tasks.length} | منجزة ${counts["done"] ?? 0} | جارية ${counts["running"] ?? 0} | جاهزة ${ready.length} | محجوبة/فاشلة ${(counts["blocked"] ?? 0) + (counts["failed"] ?? 0)}`,
        taskPacket(current),
        `خريطة الملفات (${files.length}): ${fileMap || "لا ملفات"}`,
        decisions ? `قرارات ثابتة: ${decisions}` : "",
        "قاعدة الموجات: احتفظ بـ 6–12 مهمة تفصيلية جاهزة فقط. عندما تنتهي الموجة، أضف الموجة التالية إلى الرسم بدل إنشاء خطة عملاقة دفعة واحدة.",
        "قاعدة السياق: اقرأ فقط الملفات اللازمة للحزمة الحالية عبر project_map/code_search/read_slice؛ لا تستخدم تاريخ المحادثة كحالة للمشروع.",
      ]
        .filter(Boolean)
        .join("\n") + "\n"
    );
  } catch {
    return "\n=== دفتر التنفيذ ===\nتعذرت قراءة الدفتر؛ استخدم project_map وذاكرة المشروع قبل التنفيذ.\n";
  }
}

import { analyzeError, ErrorAnalysis } from "./error-analyzer.server";

export interface RetryContext {
  errorMessage: string;
  failedCode?: string;
  correctionPrompt: string;
  analysis: ErrorAnalysis;
  attemptNumber: number;
}

export interface SelfCorrectionOptions<T> {
  maxRetries?: number;
  executeStep: (retryContext?: RetryContext) => Promise<T>;
  onRetryLog?: (attempt: number, summary: string, strategy: string) => void;
  onFailureReport?: (fixesAttempted: RetryContext[], finalError: string) => void;
  getFailedCode?: (error: any) => string | undefined;
}

/**
 * ينفذ خطوة للوكيل مع دعم التصحيح الذاتي في حال حدوث خطأ (بناء، اختبار، إلخ).
 * يعيد المحاولة تلقائياً مع تمرير سياق الخطأ وتحليله إلى الاستدعاء التالي.
 */
export async function executeWithSelfCorrection<T>(options: SelfCorrectionOptions<T>): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;
  const history: RetryContext[] = [];

  while (true) {
    try {
      const result = await options.executeStep(history.length > 0 ? history[history.length - 1] : undefined);
      return result;
    } catch (error: any) {
      attempt++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedCode = options.getFailedCode ? options.getFailedCode(error) : undefined;
      
      if (attempt > maxRetries) {
        console.error(`[SelfCorrection] All ${maxRetries} retries failed.`);
        if (options.onFailureReport) {
          options.onFailureReport(history, errorMessage);
        } else {
          console.error(`[SelfCorrection] Final Error: ${errorMessage}`, history);
        }
        throw error;
      }

      const analysis = analyzeError(errorMessage);
      const correctionPrompt = `حدث خطأ أثناء التنفيذ (المحاولة ${attempt} من ${maxRetries}):\n\nالخطأ:\n${errorMessage}\n\nتصنيف الخطأ: ${analysis.category}\nاقتراح الإصلاح: ${analysis.suggestion}\n\nيرجى تعديل الكود لتصحيح هذا الخطأ بناءً على الاقتراح.`;

      const retryContext: RetryContext = {
        errorMessage,
        failedCode,
        correctionPrompt,
        analysis,
        attemptNumber: attempt,
      };

      history.push(retryContext);

      const summary = `Error in ${analysis.category}: ${errorMessage.slice(0, 100)}`;
      const strategy = analysis.suggestion;

      console.log(`[SelfCorrection] Attempt ${attempt}/${maxRetries} | Summary: ${summary} | Strategy: ${strategy}`);
      if (options.onRetryLog) {
        options.onRetryLog(attempt, summary, strategy);
      }
    }
  }
}
