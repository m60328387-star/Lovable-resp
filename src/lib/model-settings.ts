import { useCallback, useEffect, useState } from "react";

export const STORAGE_KEY = "weaver:openrouter-model";
export const DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1";

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
  { id: "openai/gpt-5.1", label: "GPT-5.1", note: "استدلال قوي" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", note: "سريع واقتصادي" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "سياق كبير" },
  { id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", note: "اقتصادي للأكواد" },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder", note: "متخصص بالبرمجة" },
];

export function useModelSetting() {
  const [model, setModelState] = useState(DEFAULT_MODEL);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved?.startsWith("anthropic/claude")) {
      window.localStorage.setItem(STORAGE_KEY, DEFAULT_MODEL);
      setModelState(DEFAULT_MODEL);
    } else if (saved) {
      setModelState(saved);
    }
  }, []);

  const setModel = useCallback((next: string) => {
    const value = next.trim() || DEFAULT_MODEL;
    setModelState(value);
    window.localStorage.setItem(STORAGE_KEY, value);
  }, []);

  return { model, setModel };
}
