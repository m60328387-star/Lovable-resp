import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type DialogMode = 'confirm' | 'prompt';

interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  defaultValue?: string;
}

interface DialogState extends DialogOptions {
  isOpen: boolean;
  mode: DialogMode;
  resolve: (value: any) => void;
}

interface ConfirmContextType {
  confirm: (options: Omit<DialogOptions, 'defaultValue'>) => Promise<boolean>;
  prompt: (options: DialogOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback((options: Omit<DialogOptions, 'defaultValue'>) => {
    return new Promise<boolean>((resolve) => {
      setDialogState({ ...options, mode: 'confirm', isOpen: true, resolve });
    });
  }, []);

  const prompt = useCallback((options: DialogOptions) => {
    return new Promise<string | null>((resolve) => {
      setInputValue(options.defaultValue || '');
      setDialogState({ ...options, mode: 'prompt', isOpen: true, resolve });
    });
  }, []);

  const handleClose = useCallback((value: any) => {
    if (dialogState) {
      dialogState.resolve(value);
      setDialogState(prev => prev ? { ...prev, isOpen: false } : null);
      setTimeout(() => {
        setDialogState(null);
      }, 200); // Wait for exit animation
    }
  }, [dialogState]);

  // Keyboard accessibility and focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dialogState?.isOpen) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(dialogState.mode === 'prompt' ? null : false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dialogState.mode === 'prompt') {
          handleClose(inputValue);
        } else {
          handleClose(true);
        }
      } else if (e.key === 'Tab') {
        // Focus trap
        if (!dialogRef.current) return;
        const focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogState, inputValue, handleClose]);

  useEffect(() => {
    if (dialogState?.isOpen) {
      if (dialogState.mode === 'prompt') {
        inputRef.current?.focus();
      } else {
        confirmButtonRef.current?.focus();
      }
    }
  }, [dialogState]);

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      {typeof document !== 'undefined' && dialogState?.isOpen && ReactDOM.createPortal(
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md transition-opacity duration-200 ease-out"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClose(dialogState.mode === 'prompt' ? null : false);
            }
          }}
        >
          <div 
            ref={dialogRef}
            className="relative w-full max-w-md p-6 mx-4 bg-white/80 dark:bg-black/60 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-300"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby={dialogState.message ? "dialog-desc" : undefined}
          >
            <button
              onClick={() => handleClose(dialogState.mode === 'prompt' ? null : false)}
              className="absolute top-4 left-4 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 id="dialog-title" className="text-xl font-bold text-slate-900 dark:text-white mb-3 font-sans">
              {dialogState.title}
            </h2>
            
            {dialogState.message && (
              <p id="dialog-desc" className="text-slate-600 dark:text-slate-300 mb-6 font-sans leading-relaxed">
                {dialogState.message}
              </p>
            )}

            {dialogState.mode === 'prompt' && (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full px-4 py-3 mb-6 bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-slate-900 dark:text-white placeholder:text-slate-400"
                placeholder="أدخل النص هنا..."
              />
            )}

            <div className="flex gap-3 justify-end font-sans">
              <button
                onClick={() => handleClose(dialogState.mode === 'prompt' ? null : false)}
                className="px-5 py-2.5 text-slate-700 dark:text-slate-200 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-xl transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {dialogState.cancelText || 'إلغاء'}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={() => handleClose(dialogState.mode === 'prompt' ? inputValue : true)}
                className={cn(
                  "px-5 py-2.5 text-white rounded-xl transition-all font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
                  dialogState.destructive 
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-600 shadow-[0_4px_14px_0_rgba(220,38,38,0.39)]" 
                    : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-600 shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]"
                )}
              >
                {dialogState.confirmText || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context.confirm;
}

export function usePrompt() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('usePrompt must be used within a ConfirmDialogProvider');
  }
  return context.prompt;
}
