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
  applySettings,
  getTheme,
  loadSettings,
  saveSettings,
  type Settings,
} from "../lib/settings";
import Toc, { type TocItem } from "./Toc";
import SettingsPanel from "./SettingsPanel";

interface Progress {
  page: number;
  total: number;
  percent: number;
}

export default function Reader({
  bookId,
  onBack,
}: {
  bookId: string;
  onBack: () => void;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
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
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(settings);

  const theme = getTheme(settings.themeId);

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
      if (!data || !meta || !viewerRef.current) {
        setStatus("error");
        return;
      }

      setTitle(meta.title);
      const b = ePub(data);
      book = b;

      b.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc as unknown as TocItem[]);
      });

      const rendition = b.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "none",
      });
      renditionRef.current = rendition;
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
      book?.destroy();
    };
  }, [bookId]);

  // apply + persist settings whenever they change
  useEffect(() => {
    settingsRef.current = settings;
    saveSettings(settings);
    if (renditionRef.current) applySettings(renditionRef.current, settings);
  }, [settings]);

  // keys pressed while focus is on the main page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") renditionRef.current?.next();
      if (e.key === "ArrowLeft") renditionRef.current?.prev();
    }
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, []);

  // re-layout the book whenever its container changes size (sidebar toggle etc.)
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

  function goTo(href: string) {
    renditionRef.current?.display(href);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="relative flex items-center gap-4 border-b border-zinc-800 px-4 py-2">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Toggle chapters"
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
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          aria-label="Settings"
          className="ml-auto text-lg leading-none text-zinc-300 hover:text-white"
        >
          ⚙
        </button>
        {settingsOpen && (
          <SettingsPanel settings={settings} onChange={setSettings} />
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-zinc-800 p-2">
            <Toc items={toc} active={activeHref} onSelect={goTo} />
          </aside>
        )}

        <div
          className="relative min-w-0 flex-1"
          style={{ backgroundColor: theme.bg }}
        >
          <div className="absolute inset-0 mx-auto max-w-3xl px-6 py-4">
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

      <footer className="border-t border-zinc-800">
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
