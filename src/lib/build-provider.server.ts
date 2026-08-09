import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getOpenRouterModelId } from "@/lib/openrouter.server";

/**
 * مزوّد حلقة البناء الرئيسية مع تحويل تلقائي إلى Gemini/Groq
 * عندما يفشل OpenRouter بسبب الرصيد أو غياب المفتاح.
 */

export type BuildProviderId = "openrouter" | "gemini" | "groq";

const DEGRADE_TTL_MS = 15 * 60 * 1000;
let openRouterDegradedAt = 0;

/** يُسجَّل عند فشل OpenRouter بسبب الرصيد/الحصة فيُحوَّل البناء مؤقتاً لمزوّد آخر. */
export function noteOpenRouterUnavailable(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  const credit =
    message.includes("more credits") ||
    message.includes("can only afford") ||
    message.includes("insufficient") ||
    message.includes("402") ||
    message.includes("quota");
  if (credit) openRouterDegradedAt = Date.now();
  return credit;
}

function openRouterDegraded() {
  return openRouterDegradedAt > 0 && Date.now() - openRouterDegradedAt < DEGRADE_TTL_MS;
}

export function buildProviderStatus() {
  return {
    openRouterDegraded: openRouterDegraded(),
    since: openRouterDegradedAt || null,
    keys: {
      openrouter: Boolean(process.env["OPENROUTER_API_KEY"]),
      gemini: Boolean(process.env["GEMINI_API_KEY"]),
      groq: Boolean(process.env["GROQ_API_KEY"]),
    },
  };
}

interface BuildModel {
  provider: BuildProviderId;
  modelId: string;
  model: ReturnType<ReturnType<typeof createOpenAICompatible>>;
}

/**
 * يختار المزوّد الفعلي لحلقة البناء:
 * OpenRouter أولاً، ثم Gemini، ثم Groq — مع تخطّي OpenRouter عند تدهوره.
 */
export function resolveBuildModel(preferredModel: string | null, origin?: string): BuildModel {
  const orKey = process.env["OPENROUTER_API_KEY"];
  const geminiKey = process.env["GEMINI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];

  if (orKey && !openRouterDegraded()) {
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: orKey,
      headers: {
        ...(origin ? { "HTTP-Referer": origin } : {}),
        "X-Title": "Weaver",
      },
    });
    const modelId = preferredModel || getOpenRouterModelId();
    return { provider: "openrouter", modelId, model: provider(modelId) };
  }

  if (geminiKey) {
    const provider = createOpenAICompatible({
      name: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: geminiKey,
    });
    const modelId = process.env["GEMINI_BUILD_MODEL"]?.trim() || "gemini-flash-latest";
    return { provider: "gemini", modelId, model: provider(modelId) };
  }

  if (groqKey) {
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
    });
    const modelId = process.env["GROQ_BUILD_MODEL"]?.trim() || "llama-3.3-70b-versatile";
    return { provider: "groq", modelId, model: provider(modelId) };
  }

  if (orKey) {
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: orKey,
      headers: { "X-Title": "Weaver" },
    });
    const modelId = preferredModel || getOpenRouterModelId();
    return { provider: "openrouter", modelId, model: provider(modelId) };
  }

  throw new Error("لا يوجد أي مزوّد مضبوط (OPENROUTER_API_KEY / GEMINI_API_KEY / GROQ_API_KEY)");
}
