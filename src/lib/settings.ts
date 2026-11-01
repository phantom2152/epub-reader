import type { Rendition } from "epubjs";

export interface Theme {
  id: string;
  name: string;
  bg: string;
  fg: string;
}

export const THEMES: Theme[] = [
  { id: "light", name: "Light", bg: "#ffffff", fg: "#1a1a1a" },
  { id: "sepia", name: "Sepia", bg: "#f4ecd8", fg: "#5b4636" },
  { id: "gray", name: "Gray", bg: "#3a3a3c", fg: "#e5e5e7" },
  { id: "dark", name: "Dark", bg: "#121212", fg: "#d4d4d4" },
];

export interface Settings {
  themeId: string;
  fontSize: number; // percent
}

export const DEFAULT_SETTINGS: Settings = { themeId: "light", fontSize: 100 };
export const FONT_MIN = 70;
export const FONT_MAX = 200;
export const FONT_STEP = 10;

const KEY = "reader-settings";

const clampFont = (n: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, n));

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      themeId: THEMES.some((t) => t.id === parsed.themeId)
        ? parsed.themeId
        : DEFAULT_SETTINGS.themeId,
      fontSize: clampFont(Number(parsed.fontSize) || DEFAULT_SETTINGS.fontSize),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable, settings just won't persist
  }
}

export function applySettings(rendition: Rendition, s: Settings) {
  const t = getTheme(s.themeId);
  rendition.themes.override("color", t.fg, true);
  rendition.themes.override("background", t.bg, true);
  rendition.themes.fontSize(`${s.fontSize}%`);
}
