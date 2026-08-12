import re
import sys

with open('src/routes/api/chat.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Imports
imports_to_add = """
import { analyzeTaskComplexity, routeModel } from "@/lib/agent/model-router";
import { LoopBreaker } from "@/lib/agent/loop-breaker";
import { globalToolCache } from "@/lib/agent/tool-cache";
"""
if 'analyzeTaskComplexity' not in content:
    content = content.replace('import { compactMessages }', imports_to_add.strip() + '\nimport { compactMessages }')

# 2. Modify buildWeaverSystem
old_build = """export function buildWeaverSystem(activeSkills: string[], mode: string, customPrompt = "") {
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
}"""

new_build = """export function buildWeaverSystem(activeSkills: string[], mode: string, customPrompt = "", isComplexBuild = false) {
  let sys = SYSTEM_PROMPT + MEMORY_RULE;
  if (mode === "build") {
    sys += isComplexBuild ? (DESIGN_KIT + DESIGN_LIBRARY + STACK_LIBRARY) : DESIGN_KIT;
  }
  return (
    sys +
    skillPrompt(activeSkills) +
    customPrompt +
    modePrompt(mode)
  );
}"""
if old_build in content:
    content = content.replace(old_build, new_build)

# 3. Modify hardenTools signature
old_harden_sig = """export function hardenTools<T extends Record<string, unknown>>(
  tools: T,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
  audit?: { userId?: string | null; projectId?: string | null },
): T {"""

new_harden_sig = """export function hardenTools<T extends Record<string, unknown>>(
  tools: T,
  onResult?: (name: string, value: unknown) => void,
  onEvent?: (event: ToolEvent) => void,
  audit?: { userId?: string | null; projectId?: string | null },
  loopBreaker?: LoopBreaker,
): T {"""
if old_harden_sig in content:
    content = content.replace(old_harden_sig, new_harden_sig)

# 4. Modify hardenTools logic
old_harden_logic = """      execute: async (...args: never[]) => {
        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const startedAt = Date.now();
          try {
            const { runInSandbox } = await import("@/lib/sandbox.server");
            const result = await runInSandbox(name, async () => original(...args));
            const ok = isSuccessfulResult(result);"""

new_harden_logic = """      execute: async (...args: never[]) => {
        // Cache Check
        const cached = globalToolCache.get(name, args);
        if (cached !== null) return cached;

        let lastError = "";
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          // Loop Breaker Check
          if (loopBreaker) {
             const check = loopBreaker.checkLoop();
             if (check.breakLoop) {
                return { ok: false, error: "Loop detected: " + check.reason, force_stop: true };
             }
          }

          const startedAt = Date.now();
          try {
            const { runInSandbox } = await import("@/lib/sandbox.server");
            let result = await runInSandbox(name, async () => original(...args));
            
            // Output Limiter
            if (result && typeof result === "object") {
                const r = result as any;
                if (name === "read_file" && typeof r.content === "string" && r.content.length > 3000) {
                   r.content = r.content.substring(0, 3000) + "\\n\\n...[TRUNCATED: File too long. Use read_slice to view specific lines]...";
                } else if (name === "shell" && typeof r.output === "string" && r.output.length > 2000) {
                   r.output = "...[TRUNCATED]...\\n" + r.output.substring(r.output.length - 2000);
                } else if (name === "run_checks" && typeof r.details === "string" && r.details.length > 1000) {
                   r.details = r.details.substring(0, 1000) + "...[TRUNCATED]";
                }
            }
            
            const ok = isSuccessfulResult(result);
            
            if (loopBreaker) {
                loopBreaker.recordToolExecution(name, ok, ok ? null : JSON.stringify(result).slice(0, 100), ["write_file", "edit_file", "write_files", "delete_file", "append_file"].includes(name));
            }

            // Cache Set
            if (ok && ["read_file", "list_files", "web_search", "run_checks"].includes(name)) {
                globalToolCache.set(name, args, result, name === "web_search" ? 5 * 60 * 1000 : 30 * 1000);
            }
            if (ok && ["write_file", "edit_file", "write_files", "delete_file", "append_file"].includes(name)) {
                const path = (args[0] as any)?.path || (args[0] as any)?.filepath || "";
                globalToolCache.invalidateFileCaches(path);
            }
            """
if old_harden_logic in content:
    content = content.replace(old_harden_logic, new_harden_logic)

# 5. Modify POST handler to use routeModel and isComplexBuild
old_post_handler1 = """        const requested =
          typeof body.model === "string" && /^[\\w.-]+\\/[\\w.:-]+$/.test(body.model.trim())
            ? body.model.trim()
            : null;
        const modelId = requested ?? getOpenRouterModelId();"""

new_post_handler1 = """        const requested =
          typeof body.model === "string" && /^[\\w.-]+\\/[\\w.:-]+$/.test(body.model.trim())
            ? body.model.trim()
            : null;
        const complexity = analyzeTaskComplexity(messages as any);
        const isComplexBuild = complexity === "complex";
        const modelId = routeModel(requested ?? undefined, messages as any);
        const loopBreaker = new LoopBreaker(MAX_STEPS);"""
if old_post_handler1 in content:
    content = content.replace(old_post_handler1, new_post_handler1)


old_post_handler3 = """              buildWeaverSystem(activeSkills, mode, customPrompt) +"""
new_post_handler3 = """              buildWeaverSystem(activeSkills, mode, customPrompt, isComplexBuild) +"""
if old_post_handler3 in content:
    content = content.replace(old_post_handler3, new_post_handler3)

old_post_handler4 = """              {
                userId: auth.userId,
                projectId,
              },
            ),"""
new_post_handler4 = """              {
                userId: auth.userId,
                projectId,
              },
              loopBreaker
            ),"""
if old_post_handler4 in content:
    content = content.replace(old_post_handler4, new_post_handler4)


with open('src/routes/api/chat.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched chat.ts successfully')
