/**
 * موجّه النماذج (Model Router) — قواعد ثابتة بلا تكلفة إضافية.
 *
 *   USER → ORCHESTRATOR → TASK KIND → { GEMINI | GROQ | OPENROUTER }
 *
 * لا يوجد نموذج وسيط يحلّل الطلب: التوجيه يتم حسب نوع المهمة مباشرة،
 * ومع كل مسار سلسلة fallback تنتهي دائماً عند OpenRouter.
 */

export type TaskKind = "fast" | "reasoning" | "coding" | "vision";

export type ProviderId = "groq" | "gemini" | "openrouter";

interface ProviderConfig {
  id: ProviderId;
  baseURL: string;
  apiKey: () => string | undefined;
  supportsVision: boolean;
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  groq: {
    id: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: () => process.env["GROQ_API_KEY"],
    supportsVision: false,
  },
  gemini: {
    id: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: () => process.env["GEMINI_API_KEY"],
    supportsVision: true,
  },
  openrouter: {
    id: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: () => process.env["OPENROUTER_API_KEY"],
    supportsVision: true,
  },
};

interface Candidate {
  provider: ProviderId;
  model: string;
}

function envModel(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

/** سلسلة المرشحين لكل نوع مهمة، بالترتيب: الأنسب أولاً ثم البدائل. */
export function candidatesFor(kind: TaskKind, openRouterModel?: string): Candidate[] {
  const orFallback = (fallback: string): Candidate => ({
    provider: "openrouter",
    model: openRouterModel?.trim() || fallback,
  });

  switch (kind) {
    // مهام سريعة: تلخيص، تصنيف، استخراج، تسمية — Groq أولاً (شبه فوري ومجاني)
    case "fast":
      return [
        { provider: "groq", model: envModel("GROQ_FAST_MODEL", "llama-3.3-70b-versatile") },
        { provider: "gemini", model: envModel("GEMINI_FAST_MODEL", "gemini-flash-latest") },
        orFallback("google/gemini-flash-1.5"),
      ];
    // الرؤية والتصميم: Gemini أولاً (أقوى بصرياً وأرخص)
    case "vision":
      return [
        { provider: "gemini", model: envModel("GEMINI_VISION_MODEL", "gemini-flash-latest") },
        orFallback("google/gemini-flash-1.5"),
      ];

    // الاستدلال والقرارات المعمارية: أقوى نموذج أولاً ثم بدائل أرخص
    case "reasoning":
    case "coding":
    default:
      return [
        orFallback("deepseek/deepseek-chat-v3.1"),
        orFallback("nvidia/nemotron-3-ultra-550b-a55b:free"),
        { provider: "gemini", model: envModel("GEMINI_REASONING_MODEL", "gemini-pro-latest") },

        { provider: "gemini", model: envModel("GEMINI_FAST_MODEL", "gemini-flash-latest") },
      ];
  }
}

export type RoutedContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface RoutedResult {
  text: string;
  provider: ProviderId;
  model: string;
  attempts: Array<{ provider: ProviderId; model: string; error: string }>;
}

function hasImage(content: RoutedContent) {
  return Array.isArray(content) && content.some((part) => part.type === "image_url");
}

async function callProvider(
  candidate: Candidate,
  opts: { system?: string; content: RoutedContent; maxTokens?: number },
): Promise<string> {
  const config = PROVIDERS[candidate.provider];
  const key = config.apiKey();
  if (!key) throw new Error(`مفتاح ${candidate.provider} غير مضبوط`);

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(candidate.provider === "openrouter" ? { "X-Title": "Weaver Intel" } : {}),
    },
    body: JSON.stringify({
      model: candidate.model,
      max_tokens: opts.maxTokens ?? 2000,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.content },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${candidate.provider} ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${candidate.provider}: رد فارغ`);
  return text;
}

/** ينفّذ الطلب على أول مزوّد متاح لنوع المهمة، وينتقل للبديل عند أي فشل. */
export async function routedCall(opts: {
  kind: TaskKind;
  system?: string;
  content: RoutedContent;
  maxTokens?: number;
  /** نموذج OpenRouter المفضّل عند الوصول لهذا المسار. */
  openRouterModel?: string;
}): Promise<RoutedResult> {
  const needsVision = hasImage(opts.content);
  const attempts: RoutedResult["attempts"] = [];

  const chain = candidatesFor(opts.kind, opts.openRouterModel).filter((candidate) => {
    if (needsVision && !PROVIDERS[candidate.provider].supportsVision) return false;
    return Boolean(PROVIDERS[candidate.provider].apiKey());
  });

  if (chain.length === 0) {
    throw new Error("لا يوجد أي مزوّد مضبوط (OPENROUTER_API_KEY / GEMINI_API_KEY / GROQ_API_KEY)");
  }

  for (const candidate of chain) {
    try {
      const text = await callProvider(candidate, opts);
      return { text, provider: candidate.provider, model: candidate.model, attempts };
    } catch (error) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(
    `فشل كل المزوّدين: ${attempts.map((a) => `${a.provider}(${a.error})`).join(" | ")}`,
  );
}

/** حالة المزوّدين لعرضها في لوحة المراقبة. */
export function routerStatus() {
  return {
    providers: (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
      id,
      configured: Boolean(PROVIDERS[id].apiKey()),
    })),
    routes: (["fast", "reasoning", "vision", "coding"] as TaskKind[]).map((kind) => ({
      kind,
      chain: candidatesFor(kind).map((c) => `${c.provider}:${c.model}`),
    })),
  };
}
