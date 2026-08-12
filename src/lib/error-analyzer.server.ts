export type ErrorCategory = 'syntax' | 'import' | 'runtime' | 'type' | 'dependency' | 'unknown';

export interface ErrorContext {
  files?: string[];
  language?: string;
  framework?: string;
}

export interface ErrorAnalysis {
  category: ErrorCategory;
  suggestion: string;
  affectedFile?: string;
}

/**
 * يحلل رسالة الخطأ ويقترح إصلاحات سياقية لمساعدة الوكيل في التصحيح الذاتي.
 */
export function analyzeError(error: string, context?: ErrorContext): ErrorAnalysis {
  const errStr = error.toLowerCase();
  let affectedFile: string | undefined;

  // محاولة استخراج مسار الملف المتأثر
  const fileMatch = error.match(/([\w./-]+\.(ts|tsx|js|jsx|css|html))/i);
  if (fileMatch && fileMatch[1]) {
    affectedFile = fileMatch[1];
  }

  // أخطاء الاستيراد
  if (errStr.includes('cannot find module') || errStr.includes('failed to resolve import') || errStr.includes('is not exported')) {
    return {
      category: 'import',
      suggestion: 'تأكد من صحة مسار الاستيراد، وتحقق من تصدير الوحدة من الملف المصدر. راجع مسارات alias مثل @/lib/...',
      affectedFile,
    };
  }

  // أخطاء الحزم / الاعتماديات
  if (errStr.includes('npm err') || errStr.includes('command not found') || errStr.includes('missing package')) {
    return {
      category: 'dependency',
      suggestion: 'قد تكون هناك حزمة ناقصة. جرب تثبيتها عبر npm install أو تحقق من package.json.',
      affectedFile,
    };
  }

  // أخطاء النوع (TypeScript)
  if (errStr.includes('type') && (errStr.includes('is not assignable') || errStr.includes('property') || errStr.includes('does not exist'))) {
    return {
      category: 'type',
      suggestion: 'يوجد عدم تطابق في أنواع TypeScript. راجع تعريف الواجهات (interfaces) وتأكد من تمرير البيانات بالشكل الصحيح.',
      affectedFile,
    };
  }

  // أخطاء بناء الجملة (Syntax)
  if (errStr.includes('syntaxerror') || errStr.includes('unexpected token') || errStr.includes('parsing error')) {
    return {
      category: 'syntax',
      suggestion: 'يوجد خطأ في صياغة الكود (Syntax). تحقق من الأقواس المفتوحة، الفواصل الناقصة، أو بنية JSX.',
      affectedFile,
    };
  }

  // أخطاء وقت التشغيل الشائعة (Runtime)
  if (errStr.includes('is not defined') || errStr.includes('cannot read properties of undefined') || errStr.includes('null is not an object')) {
    return {
      category: 'runtime',
      suggestion: 'متغير أو خاصية غير معرفة (undefined أو null). أضف شروط التحقق (Optional Chaining) وتأكد من تهيئة الحالة بشكل صحيح.',
      affectedFile,
    };
  }

  return {
    category: 'unknown',
    suggestion: 'اقرأ رسالة الخطأ بعناية وحاول تصحيح المشكلة بناءً على السياق، أو استخدم أدوات البحث لقراءة الملف المتأثر.',
    affectedFile,
  };
}
