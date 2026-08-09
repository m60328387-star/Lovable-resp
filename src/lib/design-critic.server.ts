/** مراجعة بصرية نقدية: يرسل لقطة الشاشة إلى مسار الرؤية (Gemini ثم OpenRouter) ويعيد نقداً قابلاً للتنفيذ. */
import { routedCall, type RoutedContent } from "@/lib/model-router.server";

const VISION_FALLBACK = "google/gemini-2.5-flash";

function visionModel(): string {
  return process.env["OPENROUTER_VISION_MODEL"] || VISION_FALLBACK;
}

const CRITIC_PROMPT = `أنت مدير فني صارم يراجع واجهات المواقع. أمامك لقطة شاشة حقيقية لصفحة تم بناؤها للتو.
راجعها كمصمم محترف وأعد تقريراً عربياً موجزاً بهذا الشكل بالضبط:

VERDICT: pass أو fail
SCORE: رقم من 0 إلى 100
ISSUES:
- كل مشكلة في سطر واحد: (نوعها) ثم الوصف ثم الإصلاح المطلوب بدقة (قيمة/مسافة/لون/حجم خط).
STRENGTHS:
- نقطتان كحد أقصى.

قيّم بصرامة: التسلسل البصري، الإيقاع بين الأقسام، اتساق المسافات، جودة الطباعة العربية وتباينها،
العمق والطبقات، جودة الصور، اتساق الأيقونات، التزام RTL، الفراغ الميت، وأي شيء يبدو "مولّداً آلياً" أو قالبياً.
اعتبر النتيجة fail إذا كان التصميم عادياً أو مسطّحاً أو غير متسق حتى لو خلا من الأخطاء.`;

export interface CriticResult {
  ok: boolean;
  model: string;
  review: string;
  error?: string;
}

export async function reviewScreenshot(
  base64Jpeg: string,
  context: string,
  referenceBase64?: string,
): Promise<CriticResult> {
  const model = visionModel();

  const content: RoutedContent = [
    { type: "text", text: `${CRITIC_PROMPT}\n\nسياق الصفحة: ${context}` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
  ];

  if (referenceBase64) {
    content.push({
      type: "text",
      text: "الصورة التالية هي المرجع البصري الذي يجب الاقتراب من مستواه. قارن بينهما وحدّد الفجوات.",
    });
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${referenceBase64}` },
    });
  }

  try {
    const result = await routedCall({
      kind: "vision",
      content,
      maxTokens: 1400,
      openRouterModel: model,
    });
    return {
      ok: Boolean(result.text),
      model: `${result.provider}:${result.model}`,
      review: result.text,
    };
  } catch (error) {
    return { ok: false, model, review: "", error: String(error).slice(0, 300) };
  }
}
