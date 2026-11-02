import { useEffect, useRef, useState } from "react";
import ePub, { type Book, type Rendition } from "epubjs";
import {
  getBookFile,
  getBookMeta,
  getLocations,
  saveLocation,
  saveLocations,
} from "../lib/storage";
import {
  applyLayout,
  applySettings,
  getTheme,
  layoutOptions,
  loadSettings,
  pageMaxWidth,
  registerTypography,
  saveSettings,
  type Layout,
  type Settings,
} from "../lib/settings";
import { makeChapterLabeler, searchBook, type SearchHit } from "../lib/search";
import Toc, { type TocItem } from "./Toc";
import SettingsPanel from "./SettingsPanel";
import SearchPanel from "./SearchPanel";

interface Progress {
  page: number;
  total: number;
  percent: number;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch((e) => console.warn(e));
  }
}

export default function Reader({
  bookId,
  onBack,
  onMissing,
}: {
  bookId: string;
  onBack: () => void;
  onMissing: () => void;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const settingsWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHref, setActiveHref] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.innerWidth >= 768,
  );
  const [tab, setTab] = useState<"toc" | "search">("toc");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focus, setFocus] = useState(false); // focus mode: header/footer hidden
  const [peek, setPeek] = useState(false); // header/footer temporarily shown in focus mode
  const settingsOpenRef = useRef(false);
  const settingsRef = useRef(settings);
  const layoutRef = useRef<Layout>(settings.layout); // layout the rendition currently uses

  const theme = getTheme(settings);
  const chromeHidden = focus && !peek && !settingsOpen;

  // Load the book and render it
  useEffect(() => {
    let cancelled = false;
    let book: Book | null = null;

    async function init() {
      const [data, meta] = await Promise.all([
        getBookFile(bookId),
        getBookMeta(bookId),
      ]);
      if (cancelled) return;
      if (!data || !meta) {
        onMissing(); // book isn't in this browser's library, so send them home
        return;
      }
      if (!viewerRef.current) {
        setStatus("error");
        return;
      }

      setTitle(meta.title);
      const b = ePub(data);
      book = b;
      bookRef.current = b;

      b.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc as unknown as TocItem[]);
      });

      const lo = layoutOptions(settingsRef.current.layout);
      layoutRef.current = settingsRef.current.layout;
      const rendition = b.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        flow: lo.flow,
        spread: lo.spread,
        minSpreadWidth: lo.minSpreadWidth,
      });
      renditionRef.current = rendition;
      registerTypography(rendition, () => settingsRef.current);
      applySettings(rendition, settingsRef.current);

      let lastCfi = "";

      const updateProgress = () => {
        if (cancelled || !lastCfi || !b.locations.length()) return;
        const idx = Number(b.locations.locationFromCfi(lastCfi)) || 0;
        const pct = Number(b.locations.percentageFromCfi(lastCfi)) || 0;
        setProgress({
          page: Math.max(0, idx) + 1,
          total: b.locations.length(),
          percent: Math.round(pct * 100),
        });
      };

      rendition.on(
        "relocated",
        (loc: { start: { cfi: string; href: string } }) => {
          lastCfi = loc.start.cfi;
          saveLocation(bookId, loc.start.cfi);
          setActiveHref(loc.start.href);
          updateProgress();
        },
      );

      // keys pressed while focus is inside the book's iframe
      rendition.on("keyup", (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") rendition.next();
        if (e.key === "ArrowLeft") rendition.prev();
      });

      // the book is in an iframe, so clicks/keys inside it need their own handlers
      rendition.on("click", () => {
        setSettingsOpen(false);
        setPeek(false);
      });
      rendition.on("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          if (settingsOpenRef.current) setSettingsOpen(false);
          else setFocus(false);
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === "f") {
          setFocus((f) => !f);
          setPeek(false);
        }
        if (k === "b") setSidebarOpen((o) => !o);
      });

      await rendition.display(meta.location ?? undefined);
      if (!cancelled) setStatus("ready");

      // Build (or load cached) page locations in the background
      async function buildLocations() {
        const cached = await getLocations(bookId);
        if (cached) {
          b.locations.load(cached);
        } else {
          await b.ready;
          await b.locations.generate(1024);
          if (cancelled) return;
          await saveLocations(bookId, b.locations.save());
        }
        updateProgress();
      }
      buildLocations().catch((e) => console.error("locations failed", e));
    }

    init().catch((e) => {
      console.error(e);
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      renditionRef.current = null;
      bookRef.current = null;
      highlightRef.current = null;
      book?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // apply + persist settings whenever they change
  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
    const r = renditionRef.current;
    if (!r) return;
    applySettings(r, settings);
    if (layoutRef.current !== settings.layout) {
      layoutRef.current = settings.layout;
      applyLayout(r, settings.layout);
    }
  }, [settings]);

  // keys pressed while focus is on the main page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // don't turn pages while typing in the search box etc.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") renditionRef.current?.next();
      if (e.key === "ArrowLeft") renditionRef.current?.prev();
    }
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, []);

  // close the settings panel on click-outside or Escape
  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!settingsWrapRef.current?.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  // re-layout the book whenever its container changes size (sidebar toggle, layout change, etc.)
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        renditionRef.current?.resize(el.clientWidth, el.clientHeight),
      );
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  // keyboard shortcuts: F = focus mode, B = sidebar, Esc = leave focus mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // if the settings panel is open, Esc just closes it (handled elsewhere)
      if (e.key === "Escape" && !settingsOpenRef.current) setFocus(false);

      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        setFocus((f) => !f);
        setPeek(false);
      } else if (k === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  async function goTo(href: string) {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book) return;

    try {
      await rendition.display(href);
    } catch {
      // TOC path didn't resolve, so match the chapter file against the real spine
      const [rawPath, fragment] = href.split("#");
      let path = rawPath;
      try {
        path = decodeURIComponent(rawPath);
      } catch {
        // keep the raw path
      }
      const fileName = path.split("/").pop();

      const items = (
        book.spine as unknown as { spineItems: { href: string }[] }
      ).spineItems;
      const match = items.find(
        (i) =>
          i.href === path ||
          i.href.endsWith("/" + path) ||
          path.endsWith("/" + i.href) ||
          i.href.split("/").pop() === fileName,
      );

      if (match) {
        try {
          await rendition.display(
            fragment ? `${match.href}#${fragment}` : match.href,
          );
        } catch {
          await rendition.display(match.href); // anchor missing, go to chapter start
        }
      } else {
        console.warn("No spine match for TOC href:", href);
      }
    }

    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  // ---- search ----

  async function runSearch(
    query: string,
    signal: AbortSignal,
    onProgress: (done: number, total: number, found: number) => void,
  ) {
    const book = bookRef.current;
    if (!book) throw new Error("Book is not ready yet");
    const { hits, truncated } = await searchBook(book, query, {
      signal,
      onProgress,
    });
    const labelFor = makeChapterLabeler(book, toc);
    return {
      hits: hits.map((h) => ({ ...h, chapter: labelFor(h.href) })),
      truncated,
    };
  }

  function clearHighlight() {
    const r = renditionRef.current;
    if (r && highlightRef.current) {
      try {
        r.annotations.remove(highlightRef.current, "highlight");
      } catch {
        // already gone, nothing to do
      }
    }
    highlightRef.current = null;
  }

  async function goToHit(hit: SearchHit) {
    const r = renditionRef.current;
    if (!r) return;
    clearHighlight();
    try {
      await r.display(hit.cfi);
    } catch (e) {
      console.warn("Could not jump to search result", e);
      return;
    }
    try {
      r.annotations.highlight(hit.cfi, {}, () => {}, "search-hit", {
        fill: "#facc15",
        "fill-opacity": "0.45",
      });
      highlightRef.current = hit.cfi;
    } catch (e) {
      console.warn("Could not highlight search result", e);
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function openSearch() {
    setSidebarOpen(true);
    setTab("search");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  return (
    <div className="flex h-screen flex-col">
      {
        <>
          <div
            onMouseEnter={() => setPeek(true)}
            onClick={() => setPeek(true)}
            className="fixed inset-x-0 top-0 z-20 h-3"
          />
          <div
            onMouseEnter={() => setPeek(true)}
            onClick={() => setPeek(true)}
            className="fixed inset-x-0 bottom-0 z-20 h-3"
          />
        </>
      }
      <header
        onMouseLeave={() => setPeek(false)}
        className={`flex items-center gap-4 border-b border-zinc-800 px-4 py-2 ${
          focus
            ? `fixed inset-x-0 top-0 z-30 bg-zinc-950 transition-transform duration-200 ${
                chromeHidden ? "-translate-y-full" : "translate-y-0"
              }`
            : "relative"
        }`}
      >
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Toggle sidebar"
          className="text-lg leading-none text-zinc-300 hover:text-white"
        >
          ☰
        </button>
        <button
          onClick={onBack}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Library
        </button>
        <h1 className="line-clamp-1 text-sm font-medium">{title}</h1>

        <div className="ml-auto flex items-center gap-4">
          <button
            onClick={openSearch}
            aria-label="Search in book"
            className="text-lg leading-none text-zinc-300 hover:text-white"
          >
            🔍
          </button>
          <button
            onClick={() => {
              setFocus((f) => !f);
              setPeek(false);
            }}
            aria-label={focus ? "Exit focus mode" : "Enter focus mode"}
            title={focus ? "Exit focus mode (F)" : "Focus mode (F)"}
            className="text-lg leading-none text-zinc-300 hover:text-white"
          >
            ⛶
          </button>
          <div ref={settingsWrapRef}>
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              aria-label="Settings"
              className="text-lg leading-none text-zinc-300 hover:text-white"
            >
              ⚙
            </button>
            {settingsOpen && (
              <SettingsPanel settings={settings} onChange={setSettings} />
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* always mounted (just hidden), so search results and TOC state survive toggling */}
        <aside
          className={`w-72 shrink-0 flex-col border-r border-zinc-800 ${
            sidebarOpen ? "flex" : "hidden"
          }`}
        >
          <div className="flex border-b border-zinc-800 text-sm">
            {(["toc", "search"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2 ${
                  tab === t
                    ? "border-b-2 border-indigo-500 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t === "toc" ? "Chapters" : "Search"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className={tab === "toc" ? "" : "hidden"}>
              <Toc items={toc} active={activeHref} onSelect={goTo} />
            </div>
            <div className={tab === "search" ? "" : "hidden"}>
              <SearchPanel
                search={runSearch}
                onGo={goToHit}
                onClear={clearHighlight}
                inputRef={searchInputRef}
              />
            </div>
          </div>
        </aside>

        <div
          className="relative min-w-0 flex-1"
          style={{ backgroundColor: theme.bg }}
        >
          <div
            className="absolute inset-0 mx-auto px-6 py-4"
            style={{ maxWidth: pageMaxWidth(settings) }}
          >
            <div ref={viewerRef} className="h-full w-full" />
          </div>
          {status === "loading" && (
            <p className="absolute inset-0 flex items-center justify-center text-zinc-500">
              Loading…
            </p>
          )}
          {status === "error" && (
            <p className="absolute inset-0 flex items-center justify-center text-red-500">
              Could not open this book.
            </p>
          )}
        </div>
      </div>

      <footer
        onMouseLeave={() => setPeek(false)}
        className={`border-t border-zinc-800 ${
          focus
            ? `fixed inset-x-0 bottom-0 z-30 bg-zinc-950 transition-transform duration-200 ${
                chromeHidden ? "translate-y-full" : "translate-y-0"
              }`
            : ""
        }`}
      >
        <div className="h-0.5 bg-zinc-800">
          <div
            className="h-full bg-indigo-500 transition-[width]"
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={() => renditionRef.current?.prev()}
            className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
          >
            ← Prev
          </button>
          <span className="text-xs text-zinc-400">
            {progress
              ? `Page ${progress.page} / ${progress.total} · ${progress.percent}%`
              : "Calculating pages…"}
          </span>
          <button
            onClick={() => renditionRef.current?.next()}
            className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
          >
            Next →
          </button>
        </div>
      </footer>
    </div>
  );
}
