export const DESIGN_TOKENS = {
  // 5 Premium Color Palettes the agent can choose from
  palettes: {
    midnight: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#f59e0b', bg: '#0f0f23', text: '#e2e8f0' },
    ocean: { primary: '#0ea5e9', secondary: '#06b6d4', accent: '#f97316', bg: '#0c1222', text: '#f1f5f9' },
    forest: { primary: '#10b981', secondary: '#059669', accent: '#f59e0b', bg: '#0a1a14', text: '#ecfdf5' },
    sunset: { primary: '#f43f5e', secondary: '#ec4899', accent: '#fbbf24', bg: '#18181b', text: '#fafafa' },
    royal: { primary: '#8b5cf6', secondary: '#a78bfa', accent: '#34d399', bg: '#1a1625', text: '#ede9fe' },
  },

  typography: {
    fontFamily: { arabic: 'Cairo, Tajawal, sans-serif', english: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace' },
    scale: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem', '6xl': '3.75rem' },
    lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.75' },
    fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' },
  },

  spacing: { '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem', '5': '1.25rem', '6': '1.5rem', '8': '2rem', '10': '2.5rem', '12': '3rem', '16': '4rem', '20': '5rem', '24': '6rem' },

  radius: { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', '2xl': '1.5rem', full: '9999px' },

  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
    xl: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
    glow: '0 0 15px rgba(99,102,241,0.4)',
    glass: '0 8px 32px rgba(0,0,0,0.12)',
  },

  animations: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease',
    spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  glass: {
    light: 'background: rgba(255,255,255,0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1);',
    medium: 'background: rgba(255,255,255,0.08); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.12);',
    strong: 'background: rgba(255,255,255,0.12); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.15);',
  },
};

export const PREMIUM_CSS_TEMPLATE = [
  ':root {',
  '  --color-primary: var(--theme-primary);',
  '  --color-secondary: var(--theme-secondary);',
  '  --color-accent: var(--theme-accent);',
  '  --color-bg: var(--theme-bg);',
  '  --color-text: var(--theme-text);',
  '  --font-arabic: "Cairo", sans-serif;',
  '  --font-english: "Inter", sans-serif;',
  '  --radius-sm: 0.375rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-xl: 1rem; --radius-2xl: 1.5rem; --radius-full: 9999px;',
  '  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);',
  '  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);',
  '  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);',
  '  --shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);',
  '  --shadow-glow: 0 0 15px rgba(99,102,241,0.4);',
  '  --shadow-glass: 0 8px 32px rgba(0,0,0,0.12);',
  '  --anim-fast: 150ms ease; --anim-normal: 250ms ease; --anim-slow: 350ms ease;',
  '  --anim-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);',
  '}',
  '* { box-sizing: border-box; margin: 0; padding: 0; }',
  'html { scroll-behavior: smooth; }',
  'body { font-family: var(--font-arabic); background-color: var(--color-bg); color: var(--color-text); line-height: 1.7; }',
  '.glass-light { background: rgba(255,255,255,0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); }',
  '.glass-medium { background: rgba(255,255,255,0.08); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.12); }',
  '.glass-strong { background: rgba(255,255,255,0.12); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.15); }',
  '.container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }',
  'a { color: inherit; text-decoration: none; transition: all var(--anim-fast); }',
  '.btn { display: inline-flex; align-items: center; justify-content: center; background: var(--color-primary); color: #fff; padding: 0.75rem 1.5rem; border-radius: var(--radius-full); font-weight: 600; font-family: var(--font-arabic); border: none; cursor: pointer; transition: all var(--anim-fast); box-shadow: var(--shadow-md); }',
  '.btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg), var(--shadow-glow); }',
  '.btn.ghost { background: transparent; color: var(--color-primary); border: 1px solid var(--color-primary); box-shadow: none; }',
  '.btn.ghost:hover { background: rgba(255,255,255,0.05); }',
  '.card { background: var(--color-bg); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-xl); padding: 2rem; box-shadow: var(--shadow-lg); transition: all var(--anim-normal); }',
  '.card:hover { transform: translateY(-4px); box-shadow: var(--shadow-xl); border-color: rgba(255,255,255,0.2); }',
].join('\n');

export function generateBrandCSS(paletteName: keyof typeof DESIGN_TOKENS.palettes): string {
  const p = DESIGN_TOKENS.palettes[paletteName];
  return [
    ':root {',
    '  --theme-primary: ' + p.primary + ';',
    '  --theme-secondary: ' + p.secondary + ';',
    '  --theme-accent: ' + p.accent + ';',
    '  --theme-bg: ' + p.bg + ';',
    '  --theme-text: ' + p.text + ';',
    '}',
  ].join('\n');
}
