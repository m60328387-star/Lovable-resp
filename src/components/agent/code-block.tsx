import { cn } from '@/lib/utils';
import { Copy, Check, FileCode2 } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

export interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

export function CodeBlock({ code, language = 'text', filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function highlightCode() {
      try {
        // Construct the import path dynamically to bypass bundler static analysis
        // which prevents build crashes when the package is missing.
        const basePkg = 'highlight.js';
        
        const hljsModule = await import(/* @vite-ignore */ `${basePkg}/lib/core`);
        const hljs = hljsModule.default || hljsModule;
        
        const langs = [
          { name: 'javascript', path: `${basePkg}/lib/languages/javascript` },
          { name: 'typescript', path: `${basePkg}/lib/languages/typescript` },
          { name: 'html', path: `${basePkg}/lib/languages/xml` },
          { name: 'css', path: `${basePkg}/lib/languages/css` },
          { name: 'json', path: `${basePkg}/lib/languages/json` },
          { name: 'python', path: `${basePkg}/lib/languages/python` },
          { name: 'bash', path: `${basePkg}/lib/languages/bash` },
          { name: 'sql', path: `${basePkg}/lib/languages/sql` },
          { name: 'xml', path: `${basePkg}/lib/languages/xml` },
          { name: 'markdown', path: `${basePkg}/lib/languages/markdown` },
        ];

        const modules = await Promise.all(
          langs.map(l => import(/* @vite-ignore */ l.path).then(m => m.default || m))
        );

        langs.forEach((l, i) => {
          hljs.registerLanguage(l.name, modules[i]);
        });

        if (!isMounted) return;

        const validLanguage = hljs.getLanguage(language) ? language : 'text';
        
        if (validLanguage !== 'text') {
          const result = hljs.highlight(code, { language: validLanguage });
          setHighlightedCode(result.value);
        }
      } catch (err) {
        console.warn('highlight.js is not installed or failed to load. Falling back to plain text.');
      }
    }

    if (code) {
      highlightCode();
    }

    return () => {
      isMounted = false;
    };
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');
  // Remove the last empty line if it exists to avoid extra space at the bottom
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return (
    <div 
      className={cn(
        "group relative my-4 flex flex-col rounded-xl overflow-hidden border border-white/10 bg-neutral-950/80 backdrop-blur-md shadow-2xl animate-in fade-in duration-500", 
        className
      )} 
      dir="ltr"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 text-xs text-white/70 font-mono">
        <div className="flex items-center gap-2">
          {filename ? (
            <>
              <FileCode2 className="w-4 h-4 text-white/50" />
              <span>{filename}</span>
            </>
          ) : (
            <span className="uppercase tracking-wider">{language}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">نسخ!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>نسخ</span>
            </>
          )}
        </button>
      </div>
      
      <div className="relative overflow-x-auto">
        <div className="min-w-full inline-block">
          <pre className="py-4 text-[13px] font-mono leading-relaxed text-white/90 flex">
            <div className="flex flex-col text-right px-4 border-r border-white/10 select-none text-white/30 shrink-0">
              {lines.map((_, i) => (
                <span key={i + 1} className="inline-block">{i + 1}</span>
              ))}
            </div>
            
            <code
              className={cn("block px-4", `language-${language}`)}
              dangerouslySetInnerHTML={highlightedCode ? { __html: highlightedCode } : undefined}
            >
              {!highlightedCode && code}
            </code>
          </pre>
        </div>
      </div>
      
      {/* Inline styles for syntax highlighting matching a dark glassmorphism theme */}
      <style dangerouslySetInnerHTML={{ __html: `
        .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-section, .hljs-link { color: #c678dd; }
        .hljs-function .hljs-keyword { color: #c678dd; }
        .hljs-subst { color: #e06c75; }
        .hljs-string, .hljs-title, .hljs-name, .hljs-type, .hljs-attribute, .hljs-symbol, .hljs-bullet, .hljs-addition, .hljs-variable, .hljs-template-tag, .hljs-template-variable { color: #98c379; }
        .hljs-comment, .hljs-quote, .hljs-deletion, .hljs-meta { color: #5c6370; font-style: italic; }
        .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-doctag, .hljs-title, .hljs-section, .hljs-type, .hljs-selector-id { font-weight: bold; }
        .hljs-attr { color: #d19a66; }
        .hljs-number { color: #d19a66; }
        .hljs-built_in { color: #e5c07b; }
      `}} />
    </div>
  );
}
