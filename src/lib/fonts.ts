// Bundled fonts (Latin subset, self-hosted by Fontsource)
import "@fontsource/lora/latin-400.css";
import "@fontsource/lora/latin-400-italic.css";
import "@fontsource/lora/latin-700.css";
import "@fontsource/lora/latin-700-italic.css";
import "@fontsource/eb-garamond/latin-400.css";
import "@fontsource/eb-garamond/latin-400-italic.css";
import "@fontsource/eb-garamond/latin-700.css";
import "@fontsource/eb-garamond/latin-700-italic.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-400-italic.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource/atkinson-hyperlegible/latin-700-italic.css";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-400-italic.css";
import "@fontsource/fraunces/latin-700.css";
import "@fontsource/fraunces/latin-700-italic.css";

export interface FontOption {
  id: string;
  name: string;
  stack: string | null; // null = keep the book's own font
}

export const FONTS: FontOption[] = [
  { id: "book", name: "Book default", stack: null },
  {
    id: "serif",
    name: "Serif",
    stack: `Charter, 'Iowan Old Style', Georgia, 'Times New Roman', serif`,
  },
  {
    id: "sans",
    name: "Sans",
    stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  },
  { id: "lora", name: "Lora", stack: `'Lora', Georgia, serif` },
  {
    id: "garamond",
    name: "EB Garamond",
    stack: `'EB Garamond', Garamond, Georgia, serif`,
  },
  { id: "fraunces", name: "Fraunces", stack: `'Fraunces', Georgia, serif` },
  {
    id: "atkinson",
    name: "Atkinson",
    stack: `'Atkinson Hyperlegible', system-ui, sans-serif`,
  },
];

export function getFont(id: string): FontOption {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

// The book renders inside an iframe, which can't see our page's @font-face rules,
// so we copy them across (with urls made absolute).
let faceCache: string | null = null;
function collectFontFaces(): string {
  if (faceCache) return faceCache;
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    const base = sheet.href ?? document.baseURI;
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      out.push(
        rule.cssText.replace(/url\((['"]?)(.*?)\1\)/g, (m, _q, u: string) => {
          if (/^(data:|https?:|blob:)/.test(u)) return m;
          try {
            return `url("${new URL(u, base).href}")`;
          } catch {
            return m;
          }
        }),
      );
    }
  }
  const css = out.join("\n");
  if (css) faceCache = css;
  return css;
}


export const INVERT_FILTER = "invert(1) hue-rotate(180deg)";

// CSS injected into every book chapter
export function typographyCss(
  fontId: string,
  lineHeight: number | null,
  invert: boolean,
) {
  const font = getFont(fontId);
  const parts: string[] = [];
  if (font.stack) {
    parts.push(collectFontFaces());
    parts.push(
      `body, body *:not(code):not(pre):not(kbd):not(samp){font-family:${font.stack} !important;}`,
    );
  }
  if (lineHeight) {
    parts.push(
      `body, body p, body li, body blockquote, body div{line-height:${lineHeight} !important;}`,
    );
  }
  if (invert) {
    // the whole reading area is inverted, so flip pictures back
    parts.push(
      `img, svg, video, canvas, picture{filter:${INVERT_FILTER} !important;}`,
    );
  }
  return parts.join("\n");
}
