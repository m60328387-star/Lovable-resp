/** تسعير تقريبي (دولار لكل مليون توكن) لنماذج OpenRouter الشائعة. */
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "openrouter/auto": { in: 1, out: 4 },
  "deepseek/deepseek-chat-v3.1:free": { in: 0, out: 0 },
  "qwen/qwen3-coder:free": { in: 0, out: 0 },
  "z-ai/glm-4.5-air:free": { in: 0, out: 0 },
  "meta-llama/llama-3.3-70b-instruct:free": { in: 0, out: 0 },
  "anthropic/claude-sonnet-4.6": { in: 3, out: 15 },
  "anthropic/claude-opus-4.1": { in: 15, out: 75 },
  "openai/gpt-5.1": { in: 1.25, out: 10 },
  "openai/gpt-5-mini": { in: 0.25, out: 2 },
  "google/gemini-2.5-pro": { in: 1.25, out: 10 },
  "deepseek/deepseek-chat-v3.1": { in: 0.27, out: 1.1 },
  "qwen/qwen3-coder": { in: 0.3, out: 1.2 },
};

const FALLBACK = { in: 2, out: 8 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICING[model] ?? FALLBACK;
  const cost = (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
  return Math.round(cost * 1e6) / 1e6;
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
