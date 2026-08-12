import { analyzeError, ErrorAnalysis } from "./error-analyzer.server";

export interface RetryContext {
  errorMessage: string;
  failedCode?: string;
  correctionPrompt: string;
  analysis: ErrorAnalysis;
  attemptNumber: number;
}

export interface SelfCorrectionOptions<T> {
  maxRetries?: number;
  executeStep: (retryContext?: RetryContext) => Promise<T>;
  onRetryLog?: (attempt: number, summary: string, strategy: string) => void;
  onFailureReport?: (fixesAttempted: RetryContext[], finalError: string) => void;
  getFailedCode?: (error: any) => string | undefined;
}

/**
 * ينفذ خطوة للوكيل مع دعم التصحيح الذاتي في حال حدوث خطأ (بناء، اختبار، إلخ).
 * يعيد المحاولة تلقائياً مع تمرير سياق الخطأ وتحليله إلى الاستدعاء التالي.
 */
export async function executeWithSelfCorrection<T>(options: SelfCorrectionOptions<T>): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;
  const history: RetryContext[] = [];

  while (true) {
    try {
      const result = await options.executeStep(history.length > 0 ? history[history.length - 1] : undefined);
      return result;
    } catch (error: any) {
      attempt++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedCode = options.getFailedCode ? options.getFailedCode(error) : undefined;
      
      if (attempt > maxRetries) {
        console.error(`[SelfCorrection] All ${maxRetries} retries failed.`);
        if (options.onFailureReport) {
          options.onFailureReport(history, errorMessage);
        } else {
          console.error(`[SelfCorrection] Final Error: ${errorMessage}`, history);
        }
        throw error;
      }

      const analysis = analyzeError(errorMessage);
      const correctionPrompt = `حدث خطأ أثناء التنفيذ (المحاولة ${attempt} من ${maxRetries}):\n\nالخطأ:\n${errorMessage}\n\nتصنيف الخطأ: ${analysis.category}\nاقتراح الإصلاح: ${analysis.suggestion}\n\nيرجى تعديل الكود لتصحيح هذا الخطأ بناءً على الاقتراح.`;

      const retryContext: RetryContext = {
        errorMessage,
        failedCode,
        correctionPrompt,
        analysis,
        attemptNumber: attempt,
      };

      history.push(retryContext);

      const summary = `Error in ${analysis.category}: ${errorMessage.slice(0, 100)}`;
      const strategy = analysis.suggestion;

      console.log(`[SelfCorrection] Attempt ${attempt}/${maxRetries} | Summary: ${summary} | Strategy: ${strategy}`);
      if (options.onRetryLog) {
        options.onRetryLog(attempt, summary, strategy);
      }
    }
  }
}
