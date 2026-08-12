import type { Message } from "ai";
import { DEFAULT_MODEL } from "@/lib/model-settings";

export type Complexity = "simple" | "medium" | "complex";

/**
 * يحلل تاريخ المحادثة والرسالة الأخيرة لتحديد تعقيد المهمة
 */
export function analyzeTaskComplexity(messages: Message[]): Complexity {
  if (!messages || messages.length === 0) return "simple";

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "user") return "medium"; // If assistant, default medium

  const text = lastMessage.content.toLowerCase();
  let score = 0;

  // 1. الطول
  if (text.length > 500) score += 20;
  if (text.length > 2000) score += 30;

  // 2. الكلمات المفتاحية للبناء المعقد
  const complexKeywords = [
    "منصة",
    "مشروع كامل",
    "ابن",
    "تطبيق",
    "saas",
    "بناء",
    "قاعدة بيانات",
    "موقع كامل",
    "لوحة تحكم",
    "مكونات متعددة",
  ];
  if (complexKeywords.some((kw) => text.includes(kw))) {
    score += 40;
  }

  // 3. الكلمات المفتاحية للتعديل المتوسط
  const mediumKeywords = [
    "عدل",
    "صفحة",
    "مكون",
    "أضف",
    "إصلاح",
    "مشكلة",
    "تصميم",
  ];
  if (mediumKeywords.some((kw) => text.includes(kw))) {
    score += 20;
  }

  // 4. تاريخ المحادثة
  if (messages.length > 10) score += 10;
  if (messages.length > 30) score += 20; // Long context needs more context window

  if (score < 30) return "simple";
  if (score < 70) return "medium";
  return "complex";
}

/**
 * يختار النموذج الأنسب بناءً على التعقيد والإعدادات
 */
export function routeModel(
  requestedModel: string | undefined,
  messages: Message[]
): string {
  // Respect auto routing or default
  const isAuto = !requestedModel || requestedModel === "openrouter/auto" || requestedModel === DEFAULT_MODEL;
  
  if (isAuto) {
    const complexity = analyzeTaskComplexity(messages);
    switch (complexity) {
      case "simple":
        // نماذج سريعة ورخيصة
        return "deepseek/deepseek-chat-v3.1";
      case "medium":
        // نماذج متوازنة
        return "google/gemini-2.5-pro"; 
      case "complex":
        // نماذج ذكية مع سياق كبير
        return "anthropic/claude-sonnet-4.6";
    }
  }

  return requestedModel || DEFAULT_MODEL;
}
