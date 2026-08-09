import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";

export function getOpenRouterModelId() {
  return process.env["OPENROUTER_MODEL"] || DEFAULT_OPENROUTER_MODEL;
}

/**
 * OpenRouter provider for Weaver. Uses the user's own OPENROUTER_API_KEY.
 */
export function createOpenRouterProvider(apiKey: string, referer?: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      ...(referer ? { "HTTP-Referer": referer } : {}),
      "X-Title": "Weaver",
    },
  });
}
