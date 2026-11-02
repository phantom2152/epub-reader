import type { Book } from "epubjs";

export interface SearchHit {
  cfi: string;
  excerpt: string;
  href: string;
  chapter?: string;
}

interface SectionLike {
  href: string;
  document?: Document;
  load: (request?: unknown) => Promise<unknown>;
  unload: () => void;
  cfiFromRange: (range: Range) => string;
}

interface TocLike {
  href: string;
  label: string;
  subitems?: TocLike[];
}

export const MAX_HITS = 300;
export const MIN_QUERY = 2;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "of the" matches "of  the", "of\nthe", non-breaking spaces, etc.
export const queryPattern = (q: string) =>
  q.trim().split(/\s+/).map(escapeRe).join("\\s+");

function findInSection(item: SectionLike, query: string, limit: number) {
  const doc = item.document;
  const root = doc?.body ?? doc?.documentElement;
  if (!doc || !root) return [];

  const re = new RegExp(queryPattern(query), "gi");
  const out: SearchHit[] = [];

  // text nodes only, skipping anything inside <script> / <style>
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode: (n: Node) => (n.parentElement?.closest("script,style") ? 2 : 1),
  });

  for (
    let node = walker.nextNode();
    node && out.length < limit;
    node = walker.nextNode()
  ) {
    const text = node.textContent ?? "";
    if (!text) continue;

    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;

      let cfi: string;
      try {
        const range = doc.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        cfi = item.cfiFromRange(range);
      } catch {
        continue;
      }

      const from = Math.max(0, start - 60);
      const to = Math.min(text.length, end + 60);
      out.push({
        cfi,
        href: item.href,
        excerpt:
          (from > 0 ? "…" : "") +
          text.slice(from, to).replace(/\s+/g, " ") +
          (to < text.length ? "…" : ""),
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function searchBook(
  book: Book,
  query: string,
  opts: {
    signal: AbortSignal;
    onProgress: (done: number, total: number, found: number) => void;
  },
): Promise<{ hits: SearchHit[]; truncated: boolean }> {
  await book.ready;
  const items = (book.spine as unknown as { spineItems: SectionLike[] })
    .spineItems;
  const hits: SearchHit[] = [];
  let truncated = false;

  for (let i = 0; i < items.length; i++) {
    if (opts.signal.aborted) break;
    const item = items[i];
    try {
      await item.load(book.load.bind(book));
      const room = MAX_HITS - hits.length;
      const found = findInSection(item, query, room + 1); // +1 to detect "more"
      if (found.length > room) {
        truncated = true;
        found.length = room;
      }
      hits.push(...found);
    } catch (e) {
      console.warn("search: skipped a section", item.href, e);
    } finally {
      item.unload();
    }
    opts.onProgress(i + 1, items.length, hits.length);
    if (truncated) break;
  }
  return { hits, truncated };
}

// ---- chapter names for results ----

const norm = (h: string) => {
  const p = h.split("#")[0];
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};
const samePath = (a: string, b: string) =>
  !!a && !!b && (a === b || a.endsWith("/" + b) || b.endsWith("/" + a));

// Maps a spine file to the nearest chapter title at or before it in the TOC
export function makeChapterLabeler(book: Book, toc: TocLike[]) {
  const items = (book.spine as unknown as { spineItems: { href: string }[] })
    .spineItems;
  const indexOf = (href: string) => {
    const h = norm(href);
    return items.findIndex((s) => samePath(norm(s.href), h));
  };

  const flat: TocLike[] = [];
  const walk = (list: TocLike[]) =>
    list.forEach((t) => {
      flat.push(t);
      if (t.subitems) walk(t.subitems);
    });
  walk(toc);

  const marks = flat
    .map((t) => ({ idx: indexOf(t.href), label: t.label.trim() }))
    .filter((m) => m.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  return (spineHref: string) => {
    const i = indexOf(spineHref);
    let label = "";
    let at = -1;
    for (const m of marks) {
      if (m.idx > i) break;
      if (m.idx > at) {
        label = m.label;
        at = m.idx;
      }
    }
    return label;
  };
}
