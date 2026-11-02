// Theme preview (step 1): swaps ONLY the neutral zinc/gray surfaces + text.
// "light" is the default theme. "black" is the original dark look: it adds no
// attribute/CSS (its values live in index.css @theme).
// Semantic colours (red/green/blue/violet/amber...) are intentionally NOT touched.
// Anything hardcoded (bg-black, bg-[#...], inline hex, canvas, charts) will NOT
// follow the theme — that is the point of this preview.

import { useCallback, useState } from 'react';

export type ThemeId = 'black' | 'forest' | 'purple' | 'light';

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
  // The original dark look (values live in index.css @theme). No overrides.
  { id: 'black', label: 'Black', swatch: ['#050505', '#111111', '#222222'], vars: {} },
  {
    // Light theme with a faint lavender tint (website look). Same flipped neutral
    // scale as 'light'; only page/border surfaces are tinted.
    id: 'purple',
    label: 'Purple',
    swatch: ['#f6f4fb', '#ffffff', '#e4e0ec'],
    vars: {
      '--color-zinc-950': '#f6f4fb',
      '--color-zinc-900': '#ffffff',
      '--color-zinc-800': '#e4e0ec',
      '--color-zinc-700': '#d7d2e3',
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
  {
    id: 'forest',
    label: 'Forest',
    swatch: ['#060d0a', '#0c1612', '#16241d'],
    vars: zinc(['#060d0a', '#0c1612', '#16241d', '#22372d', '#3f5a4d', '#6f8c7d', '#9bb5a7']),
  },
  {
    // Default theme: flips the whole neutral scale (incl. white + gray text),
    // so bg-white buttons become dark and text-white becomes near-black.
    // bg-black / bg-[#...] / inline styles stay dark.
    id: 'light',
    label: 'Light (Default)',
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
    return isThemeId(v) ? v : 'light';
  } catch {
    return 'light';
  }
}

// Html-level selectors beat Tailwind's :root @theme variables, so no !important needed.
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const themeCss = THEMES.filter(t => t.id !== 'black')
    .map(t => {
      const body = Object.entries(t.vars).map(([k, v]) => `${k}:${v};`).join('');
      const scheme = t.id === 'light' || t.id === 'purple' ? 'light' : 'dark';
      return `html[data-theme="${t.id}"]{${body}color-scheme:${scheme};}`;
    })
    .join('\n');
  // Safety net: any leftover Tailwind `bg-black` follows the theme page colour.
  // (bg-black/20 etc. are different classes and are not affected.)
  // Anything inside [data-theme-lock] keeps the ORIGINAL (default) look, whatever theme is active.
  // Used for onboarding / tutorial pop-ups that were designed for the default look.
  const lock =
    'html[data-theme] [data-theme-lock]{' +
    '--color-white:#ffffff;' +
    '--color-zinc-950:#050505;--color-zinc-900:#111111;--color-zinc-800:#222222;' +
    '--color-zinc-700:#3f3f46;--color-zinc-600:#52525c;--color-zinc-500:#71717b;--color-zinc-400:#9f9fa9;' +
    '--color-zinc-300:#d4d4d8;--color-zinc-200:#e4e4e7;--color-zinc-100:#f4f4f5;--color-zinc-50:#fafafa;' +
    '--color-gray-100:#f3f4f6;--color-gray-200:#e5e7eb;--color-gray-300:#d1d5dc;--color-gray-400:#99a1af;--color-gray-500:#6a7282;' +
    '}';
  const css = themeCss + '\nhtml[data-theme] .bg-black{background-color:var(--color-zinc-950);}\n' + lock;
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