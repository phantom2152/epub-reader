import { useEffect, useRef, useState } from "react";
import ePub, { type Book, type Rendition } from "epubjs";
import { getBookFile, getBookMeta, saveLocation } from "../lib/storage";
import Toc, { type TocItem } from "./Toc";

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
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.innerWidth >= 768,
  );

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
      book = ePub(data);

      book.loaded.navigation.then((nav) => {
        if (!cancelled) setToc(nav.toc as unknown as TocItem[]);
      });

      const rendition = book.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "none",
      });
      renditionRef.current = rendition;

      rendition.on(
        "relocated",
        (loc: { start: { cfi: string; href: string } }) => {
          saveLocation(bookId, loc.start.cfi);
          setActiveHref(loc.start.href);
        },
      );

      // keys pressed while focus is inside the book's iframe
      rendition.on("keyup", (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") rendition.next();
        if (e.key === "ArrowLeft") rendition.prev();
      });

      await rendition.display(meta.location ?? undefined);
      if (!cancelled) setStatus("ready");
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
      <header className="flex items-center gap-4 border-b border-zinc-800 px-4 py-2">
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
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-zinc-800 p-2">
            <Toc items={toc} active={activeHref} onSelect={goTo} />
          </aside>
        )}

        <div className="relative min-w-0 flex-1 bg-white">
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

      <footer className="flex justify-between border-t border-zinc-800 px-4 py-2">
        <button
          onClick={() => renditionRef.current?.prev()}
          className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
        >
          ← Prev
        </button>
        <button
          onClick={() => renditionRef.current?.next()}
          className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
        >
          Next →
        </button>
      </footer>
    </div>
  );
}
