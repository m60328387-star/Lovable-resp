import { getSql } from "@/lib/db";

/**
 * Build state tracking for Weaver projects.
 *
 * Keeps a persistent, machine-readable snapshot of where a project build is,
 * what it should do next, and the last verification result. The agent loop
 * reads this at the start of every turn and writes it after every action,
 * so a build can resume across disconnects, restarts, and browser closes.
 */

export type BuildPhase =
  | "intake"
  | "discovery"
  | "spec"
  | "architect"
  | "graph"
  | "execute"
  | "verify"
  | "review"
  | "deploy"
  | "monitor"
  | "done"
  | "blocked";

export type BuildState = {
  phase: BuildPhase;
  startedAt?: string | undefined;
  updatedAt?: string | undefined;
  completedSteps: string[];
  currentTask?:
    | {
        key: string;
        title: string;
        status: "pending" | "running" | "done" | "failed";
        attempt: number;
      }
    | undefined;
  stats?:
    | {
        filesWritten: number;
        checksPassed: number;
        checksFailed: number;
        costEstimateUsd?: number | undefined;
      }
    | undefined;
  meta?: Record<string, unknown> | undefined;
};

export type NextAction =
  | "ask_user"
  | "write_spec"
  | "build_task_graph"
  | "execute_next_task"
  | "run_checks"
  | "auto_repair"
  | "visual_audit"
  | "deploy"
  | "verify_deploy"
  | "done"
  | `execute_task:${string}`;

export type CheckResult = {
  ok: boolean;
  filesChecked: number;
  errors: number;
  warnings: number;
  summary: string;
};

function isBuildState(value: unknown): value is BuildState {
  return (
    typeof value === "object" &&
    value !== null &&
    "phase" in value &&
    typeof (value as { phase?: unknown }).phase === "string"
  );
}

export function defaultBuildState(phase: BuildPhase = "intake"): BuildState {
  return {
    phase,
    completedSteps: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadBuildState(projectId: string): Promise<BuildState> {
  const sql = getSql();
  const rows = await sql`
    SELECT build_state, status, next_action, last_error, last_check, build_progress
    FROM public.projects
    WHERE id = ${projectId}
    LIMIT 1
  `;
  const row = rows[0] as unknown as
    | {
        build_state: unknown;
        status: string;
        next_action: string | null;
        last_error: string | null;
        last_check: unknown;
        build_progress: number;
      }
    | undefined;
  if (!row) return defaultBuildState("intake");

  const raw = row.build_state;
  const state = isBuildState(raw) ? raw : defaultBuildState((row.status as BuildPhase) ?? "intake");

  return {
    ...state,
    phase: (row.status as BuildPhase) ?? state.phase,
  };
}

export async function saveBuildState(
  projectId: string,
  state: Partial<BuildState>,
  nextAction?: NextAction | null,
  error?: string | null,
): Promise<BuildState> {
  const sql = getSql();
  const current = await loadBuildState(projectId);
  const merged: BuildState = {
    ...current,
    ...state,
    completedSteps: state.completedSteps ?? current.completedSteps,
    updatedAt: new Date().toISOString(),
  };

  const progress = deriveProgress(merged.phase, merged.completedSteps);

  await sql`
    UPDATE public.projects
    SET build_state = ${sql.json(merged as never)},
        status = ${merged.phase},
        next_action = ${nextAction ?? (merged.phase === "done" ? "done" : null)},
        last_error = ${error ?? null},
        build_progress = ${progress},
        updated_at = now()
    WHERE id = ${projectId}
  `;

  return merged;
}

export async function setProjectPhase(
  projectId: string,
  phase: BuildPhase,
  nextAction?: NextAction,
  error?: string | null,
): Promise<BuildState> {
  const sql = getSql();
  const current = await loadBuildState(projectId);
  const merged: BuildState = {
    ...current,
    phase,
    updatedAt: new Date().toISOString(),
    startedAt: current.startedAt ?? (phase !== "intake" ? new Date().toISOString() : undefined),
  };

  await sql`
    UPDATE public.projects
    SET status = ${phase},
        build_state = ${sql.json(merged as never)},
        next_action = ${nextAction ?? null},
        last_error = ${error ?? null},
        build_progress = ${deriveProgress(phase, merged.completedSteps)},
        updated_at = now()
    WHERE id = ${projectId}
  `;

  return merged;
}

export async function markStepCompleted(
  projectId: string,
  step: string,
  nextAction?: NextAction,
): Promise<BuildState> {
  const current = await loadBuildState(projectId);
  const completed = new Set([...current.completedSteps, step]);
  return saveBuildState(projectId, { completedSteps: Array.from(completed) }, nextAction, null);
}

export async function setCurrentTask(
  projectId: string,
  task: BuildState["currentTask"] | null,
): Promise<BuildState> {
  return saveBuildState(projectId, { currentTask: task ?? undefined });
}

export async function saveCheckResult(projectId: string, result: CheckResult): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.projects
    SET last_check = ${sql.json(result as never)},
        updated_at = now()
    WHERE id = ${projectId}
  `;
}

export async function setDeployedUrl(projectId: string, url: string | null): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.projects
    SET deployed_url = ${url ?? null},
        updated_at = now()
    WHERE id = ${projectId}
  `;
}

export function deriveProgress(phase: BuildPhase, completedSteps: string[]): number {
  const phaseWeights: Record<BuildPhase, number> = {
    intake: 5,
    discovery: 10,
    spec: 20,
    architect: 30,
    graph: 40,
    execute: 60,
    verify: 75,
    review: 85,
    deploy: 95,
    monitor: 98,
    done: 100,
    blocked: 0,
  };

  const base = phaseWeights[phase] ?? 0;
  const stepBonus = Math.min(completedSteps.length * 2, 15);
  return Math.min(100, base + stepBonus);
}

export function describeNextAction(
  action: NextAction | null | undefined,
  phase?: BuildPhase,
): string {
  if (!action) {
    switch (phase) {
      case "intake":
        return "تحليل الطلب واستخراج المتطلبات";
      case "spec":
        return "كتابة المواصفات";
      case "graph":
        return "رسم المهام";
      case "execute":
        return "تنفيذ المهام";
      case "verify":
        return "فحص الجودة";
      case "deploy":
        return "النشر";
      case "done":
        return "اكتمال المشروع";
      default:
        return "جاري التقدم";
    }
  }

  const labels: Record<string, string> = {
    ask_user: "ينتظر إجابة منك",
    write_spec: "كتابة المواصفات",
    build_task_graph: "رسم المهام",
    execute_next_task: "تنفيذ المهمة التالية",
    run_checks: "فحص الجودة",
    auto_repair: "إصلاح الأخطاء تلقائياً",
    visual_audit: "تدقيق بصري",
    deploy: "النشر",
    verify_deploy: "التحقق من النشر",
    done: "اكتمال المشروع",
  };

  if (action.startsWith("execute_task:")) {
    return `تنفيذ المهمة ${action.slice("execute_task:".length)}`;
  }

  return labels[action] ?? action;
}

export async function reconcileProjectState(projectId: string): Promise<BuildState> {
  const sql = getSql();
  const [taskRows, fileRows, specRows] = await Promise.all([
    sql`
      SELECT task_key, title, status, note
      FROM public.tasks
      WHERE project_id = ${projectId}
      ORDER BY position ASC
    `,
    sql`
      SELECT count(*)::int AS count
      FROM public.files
      WHERE project_id = ${projectId}
    `,
    sql`
      SELECT count(*)::int AS count
      FROM public.specs
      WHERE project_id = ${projectId}
    `,
  ]);

  const tasks = taskRows as unknown as Array<{
    task_key: string;
    title: string;
    status: string;
    note: string | null;
  }>;

  const fileCount = (fileRows[0] as unknown as { count: number }).count ?? 0;
  const specCount = (specRows[0] as unknown as { count: number }).count ?? 0;

  const current = await loadBuildState(projectId);

  let phase = current.phase;
  let nextAction: NextAction | undefined;

  if (specCount === 0 && phase !== "intake") {
    phase = "intake";
    nextAction = "write_spec";
  } else if (tasks.length === 0 && specCount > 0 && phase !== "graph") {
    phase = "spec";
    nextAction = "build_task_graph";
  } else if (tasks.length > 0 && fileCount === 0 && phase !== "execute") {
    phase = "graph";
    nextAction = "execute_next_task";
  } else if (fileCount > 0) {
    const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "running");
    const nextPending = pendingTasks[0];
    if (nextPending) {
      phase = "execute";
      nextAction = `execute_task:${nextPending.task_key}`;
    } else if (tasks.every((t) => t.status === "done")) {
      phase = "verify";
      nextAction = "run_checks";
    } else {
      phase = "execute";
      nextAction = "execute_next_task";
    }
  }

  const firstPending = tasks.find((t) => t.status === "pending" || t.status === "running");

  return saveBuildState(
    projectId,
    {
      phase,
      currentTask: firstPending
        ? {
            key: firstPending.task_key,
            title: firstPending.title,
            status: firstPending.status === "running" ? "running" : "pending",
            attempt: 0,
          }
        : undefined,
      stats: {
        filesWritten: fileCount,
        checksPassed: 0,
        checksFailed: 0,
        ...(current.stats ?? {}),
      },
    },
    nextAction,
    null,
  );
}
