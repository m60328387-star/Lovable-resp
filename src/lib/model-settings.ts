import { useCallback, useSyncExternalStore } from "react";

export const STORAGE_KEY = "weaver:openrouter-model";
export const DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1";
const MODEL_CHANGED_EVENT = "weaver:model-changed";

export const MODEL_OPTIONS: { id: string; label: string; note: string }[] = [
  {
    id: "openrouter/auto",
    label: "Auto (اختيار تلقائي)",
    note: "يختار OpenRouter أنسب نموذج للطلب",
  },
  {
    id: "deepseek/deepseek-chat-v3.1:free",
    label: "DeepSeek V3.1 — مجاني",
    note: "مجاني بالكامل، جيد للأكواد",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder — مجاني",
    note: "مجاني ومتخصص بالبرمجة",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    label: "GLM 4.5 Air — مجاني",
    note: "مجاني وسريع للمهام العامة",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B — مجاني",
    note: "مجاني، مناسب للمحادثة والتلخيص",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6 — الأذكى",
    note: "أعلى جودة لكنه الأغلى (اختياري)",
  },
  { id: "openai/gpt-5.1", label: "GPT-5.1", note: "استدلال قوي" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", note: "سريع واقتصادي" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "سياق كبير" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", note: "اقتصادي للأكواد" },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder", note: "متخصص بالبرمجة" },
];

function readStoredModel() {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function subscribeToModel(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(MODEL_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MODEL_CHANGED_EVENT, onStoreChange);
  };
}

export function useModelSetting() {
  const model = useSyncExternalStore(subscribeToModel, readStoredModel, () => DEFAULT_MODEL);

  const setModel = useCallback((next: string) => {
    const value = next.trim() || DEFAULT_MODEL;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // تظل جلسة المتصفح الحالية قابلة للاستخدام حتى عند منع التخزين المحلي.
    }
    window.dispatchEvent(new Event(MODEL_CHANGED_EVENT));
  }, []);

  return { model, setModel };
}
