import type { Rendition } from "epubjs";
import { FONTS, typographyCss } from "./fonts";

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

export const CUSTOM_ID = "custom";

export type Layout = "single" | "double" | "auto" | "scroll";

export const LAYOUTS: { id: Layout; name: string; hint: string }[] = [
  { id: "single", name: "1 page", hint: "One page at a time" },
  { id: "double", name: "2 pages", hint: "Two pages side by side" },
  { id: "auto", name: "Auto", hint: "Two pages when the window is wide" },
  { id: "scroll", name: "Scroll", hint: "Scroll through each chapter" },
];

export type PageWidth = "narrow" | "medium" | "wide";

export const PAGE_WIDTHS: { id: PageWidth; name: string; px: number }[] = [
  { id: "narrow", name: "Narrow", px: 560 },
  { id: "medium", name: "Medium", px: 720 },
  { id: "wide", name: "Wide", px: 920 },
];

export interface Settings {
  themeId: string; // a preset id, or 'custom'
  fontSize: number; // percent
  customBg: string;
  customFg: string;
  autoFg: boolean; // pick text color automatically from customBg
  layout: Layout;
  fontId: string;
  lineHeight: number | null; // null = the book's own line spacing
  pageWidth: PageWidth;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: "light",
  fontSize: 100,
  customBg: "#1e1e2e",
  customFg: "#cdd6f4",
  autoFg: true,
  layout: "single",
  fontId: "book",
  lineHeight: null,
  pageWidth: "medium",
};
export const FONT_MIN = 70;
export const FONT_MAX = 200;
export const FONT_STEP = 10;

export const LH_MIN = 1.2;
export const LH_MAX = 2.4;
export const LH_STEP = 0.1;
export const LH_START = 1.5;

const KEY = "reader-settings";
const UI_STATE_KEY = "reader-ui-state";

export interface ReaderUiState {
  sidebarOpen: boolean;
  focus: boolean;
}

export function loadReaderUiState(defaultSidebarOpen: boolean): ReaderUiState {
  const defaults = { sidebarOpen: defaultSidebarOpen, focus: false };
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaults;
    const stored = parsed as Record<string, unknown>;
    return {
      sidebarOpen:
        typeof stored.sidebarOpen === "boolean"
          ? stored.sidebarOpen
          : defaultSidebarOpen,
      focus: typeof stored.focus === "boolean" ? stored.focus : false,
    };
  } catch {
    return defaults;
  }
}

export function saveReaderUiState(state: ReaderUiState) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable, UI state just won't persist
  }
}

const clampFont = (n: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, n));
const isHex = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

// WCAG relative luminance of a #rrggbb color (0 = black, 1 = white)
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// near-black on light backgrounds, near-white on dark ones
export function autoTextColor(bg: string) {
  return luminance(bg) > 0.179 ? "#1a1a1a" : "#f5f5f5";
}

export function getTheme(s: Settings): Theme {
  if (s.themeId === CUSTOM_ID) {
    return {
      id: CUSTOM_ID,
      name: "Custom",
      bg: s.customBg,
      fg: s.autoFg ? autoTextColor(s.customBg) : s.customFg,
    };
  }
  return THEMES.find((t) => t.id === s.themeId) ?? THEMES[0];
}

export function layoutOptions(layout: Layout) {
  switch (layout) {
    case "double":
      return { flow: "paginated", spread: "always", minSpreadWidth: 1 };
    case "auto":
      return { flow: "paginated", spread: "auto", minSpreadWidth: 900 };
    case "scroll":
      return { flow: "scrolled-doc", spread: "none", minSpreadWidth: 800 };
    default:
      return { flow: "paginated", spread: "none", minSpreadWidth: 800 };
  }
}

// max width of the reading area (includes the 48px of horizontal padding)
export function pageMaxWidth(s: Settings) {
  const base = PAGE_WIDTHS.find((w) => w.id === s.pageWidth)?.px ?? 720;
  const pages = s.layout === "double" || s.layout === "auto" ? 2 : 1;
  return base * pages + 48;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return {
      themeId:
        p.themeId === CUSTOM_ID || THEMES.some((t) => t.id === p.themeId)
          ? p.themeId
          : DEFAULT_SETTINGS.themeId,
      fontSize: clampFont(Number(p.fontSize) || DEFAULT_SETTINGS.fontSize),
      customBg: isHex(p.customBg) ? p.customBg : DEFAULT_SETTINGS.customBg,
      customFg: isHex(p.customFg) ? p.customFg : DEFAULT_SETTINGS.customFg,
      autoFg:
        typeof p.autoFg === "boolean" ? p.autoFg : DEFAULT_SETTINGS.autoFg,
      layout: LAYOUTS.some((l) => l.id === p.layout)
        ? p.layout
        : DEFAULT_SETTINGS.layout,
      fontId: FONTS.some((f) => f.id === p.fontId)
        ? p.fontId
        : DEFAULT_SETTINGS.fontId,
      lineHeight:
        typeof p.lineHeight === "number" &&
        p.lineHeight >= LH_MIN &&
        p.lineHeight <= LH_MAX
          ? p.lineHeight
          : null,
      pageWidth: PAGE_WIDTHS.some((w) => w.id === p.pageWidth)
        ? p.pageWidth
        : DEFAULT_SETTINGS.pageWidth,
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

// ---- typography injection (font family + line spacing) ----

interface ContentsLike {
  document: Document;
}

const STYLE_ID = "reader-typography";

function writeStyle(doc: Document, css: string) {
  let el = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement("style");
    el.id = STYLE_ID;
    doc.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

// Call once after renderTo: styles every chapter as it loads
export function registerTypography(
  rendition: Rendition,
  getSettings: () => Settings,
) {
  rendition.hooks.content.register((contents: ContentsLike) => {
    const s = getSettings();
    writeStyle(contents.document, typographyCss(s.fontId, s.lineHeight));
  });
}

// Updates chapters that are already on screen
function applyTypography(rendition: Rendition, s: Settings) {
  const css = typographyCss(s.fontId, s.lineHeight);
  const contents = rendition.getContents() as unknown as ContentsLike[];
  contents.forEach((c) => writeStyle(c.document, css));
}

export function applySettings(rendition: Rendition, s: Settings) {
  const t = getTheme(s);
  rendition.themes.override("color", t.fg, true);
  rendition.themes.override("background", t.bg, true);
  rendition.themes.fontSize(`${s.fontSize}%`);
  applyTypography(rendition, s);
}

// Used for live changes after the book is already open.
// (The initial layout is passed to renderTo instead.)
export function applyLayout(rendition: Rendition, layout: Layout) {
  const o = layoutOptions(layout);
  rendition.spread(o.spread, o.minSpreadWidth);
  rendition.flow(o.flow);
}
