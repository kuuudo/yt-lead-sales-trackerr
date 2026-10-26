// Theme preview (step 1): swaps ONLY the neutral zinc/gray surfaces + text.
// "black" is the default and adds no attribute/CSS, so the app looks exactly
// as it does today until someone picks something else.
// Semantic colours (red/green/blue/violet/amber...) are intentionally NOT touched.
// Anything hardcoded (bg-black, bg-[#...], inline hex, canvas, charts) will NOT
// follow the theme — that is the point of this preview.

import { useCallback, useState } from 'react';

export type ThemeId = 'black' | 'navy' | 'charcoal' | 'forest' | 'light';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** swatch preview only: [page, card, border] */
  swatch: [string, string, string];
  vars: Record<string, string>;
}

const zinc = (v: [string, string, string, string, string, string, string]) => ({
  '--color-zinc-950': v[0],
  '--color-zinc-900': v[1],
  '--color-zinc-800': v[2],
  '--color-zinc-700': v[3],
  '--color-zinc-600': v[4],
  '--color-zinc-500': v[5],
  '--color-zinc-400': v[6],
});

export const THEMES: ThemeDef[] = [
  // Default: your current look (values live in index.css @theme). No overrides.
  { id: 'black', label: 'Black (Default)', swatch: ['#050505', '#111111', '#222222'], vars: {} },
  {
    id: 'navy',
    label: 'Midnight Navy',
    swatch: ['#0b0b14', '#12121d', '#1d1d2b'],
    vars: zinc(['#0b0b14', '#12121d', '#1d1d2b', '#2c2c3f', '#4a4a63', '#7a7a96', '#a0a0b8']),
  },
  {
    id: 'charcoal',
    label: 'Warm Charcoal',
    swatch: ['#0f0e0d', '#171513', '#221f1c'],
    vars: zinc(['#0f0e0d', '#171513', '#221f1c', '#332f2b', '#54504a', '#85807a', '#aaa59e']),
  },
  {
    id: 'forest',
    label: 'Forest',
    swatch: ['#060d0a', '#0c1612', '#16241d'],
    vars: zinc(['#060d0a', '#0c1612', '#16241d', '#22372d', '#3f5a4d', '#6f8c7d', '#9bb5a7']),
  },
  {
    // Preview-only: flips the whole neutral scale (incl. white + gray text),
    // so bg-white buttons become dark and text-white becomes near-black.
    // bg-black / bg-[#...] / inline styles stay dark on purpose, so you can see them.
    id: 'light',
    label: 'Light (preview)',
    swatch: ['#f4f4f6', '#ffffff', '#e4e4e9'],
    vars: {
      '--color-zinc-950': '#f4f4f6',
      '--color-zinc-900': '#ffffff',
      '--color-zinc-800': '#e4e4e9',
      '--color-zinc-700': '#d1d1d9',
      '--color-zinc-600': '#a1a1ad',
      '--color-zinc-500': '#6b6b78',
      '--color-zinc-400': '#52525e',
      '--color-zinc-300': '#3f3f4a',
      '--color-zinc-200': '#2a2a33',
      '--color-zinc-100': '#18181d',
      '--color-zinc-50': '#0b0b0e',
      '--color-gray-100': '#18181d',
      '--color-gray-200': '#2a2a33',
      '--color-gray-300': '#3f3f4a',
      '--color-gray-400': '#52525e',
      '--color-gray-500': '#6b6b78',
      '--color-white': '#0b0b0e',
    },
  },
];

const STORAGE_KEY = 'vs-theme';
const STYLE_ID = 'vs-theme-css';

function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some(t => t.id === v);
}

export function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isThemeId(v) ? v : 'black';
  } catch {
    return 'black';
  }
}

// Html-level selectors beat Tailwind's :root @theme variables, so no !important needed.
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const css = THEMES.filter(t => t.id !== 'black')
    .map(t => {
      const body = Object.entries(t.vars).map(([k, v]) => `${k}:${v};`).join('');
      const scheme = t.id === 'light' ? 'light' : 'dark';
      return `html[data-theme="${t.id}"]{${body}color-scheme:${scheme};}`;
    })
    .join('\n');
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

/** Put a theme on <html>. Pass 'black' (or null) to clear it. */
export function applyTheme(id: ThemeId | null) {
  if (typeof document === 'undefined') return;
  ensureStyle();
  const root = document.documentElement;
  if (!id || id === 'black') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
}

export function setTheme(id: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  applyTheme(id);
}

// Apply the saved theme at import time, before React's first render (no flash).
applyTheme(getStoredTheme());

export function useTheme() {
  const [theme, setState] = useState<ThemeId>(getStoredTheme);
  const choose = useCallback((id: ThemeId) => {
    setTheme(id);
    setState(id);
  }, []);
  return { theme, setTheme: choose };
}
