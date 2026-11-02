import { useEffect, useRef, useState } from "react";
import {
  deleteBook,
  getBookFile,
  listBooks,
  saveBook,
  setFinished,
  type BookMeta,
} from "../lib/storage";
import { readMetadata } from "../lib/epub";
import ConfirmDialog from "./ConfirmDialog";
import { onBookAdded } from "../lib/downloads";
import AddMenu from "./AddMenu";
import LinkDialog from "./LinkDialog";

function Cover({ blob, title }: { blob: Blob | null; title: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-800 p-3 text-center text-sm text-zinc-400">
        {title}
      </div>
    );
  }
  return <img src={url} alt={title} className="h-full w-full object-cover" />;
}

const isEpub = (f: File) =>
  f.name.toLowerCase().endsWith(".epub") || f.type === "application/epub+zip";

const hasFiles = (e: React.DragEvent) =>
  Array.from(e.dataTransfer.types).includes("Files");

// explicit flag wins; otherwise a book read to ~the end counts as finished
const isFinished = (b: BookMeta) => b.finished ?? (b.progress ?? 0) >= 99;

function progressLabel(b: BookMeta) {
  if (isFinished(b)) return "Finished";
  const p = b.progress ?? 0;
  if (p > 0) return `${p}%`;
  return b.location ? "" : "New";
}

function downloadName(b: BookMeta) {
  const clean = Array.from(b.title)
    .filter((c) => c.charCodeAt(0) >= 32) // drop control characters
    .join("")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 120);
  return `${clean || "book"}.epub`;
}

function BookMenu({
  book,
  finished,
  onToggleFinished,
  onDownload,
  onDelete,
}: {
  book: BookMeta;
  finished: boolean;
  onToggleFinished: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "block w-full px-3 py-2 text-left hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="absolute right-1 top-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Options for ${book.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="card-menu-btn flex h-7 w-7 items-center justify-center rounded bg-black/70 text-lg leading-none text-white transition-opacity hover:bg-black/90"
      >
        ⋮
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl"
        >
          <li role="none">
            <button
              role="menuitem"
              onClick={run(onToggleFinished)}
              className={item}
            >
              {finished ? "Mark as not finished" : "Mark as finished"}
            </button>
          </li>
          <li role="none">
            <button role="menuitem" onClick={run(onDownload)} className={item}>
              Download .epub
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={run(onDelete)}
              className={`${item} text-red-400`}
            >
              Delete
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export default function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pending, setPending] = useState<{
    kind: "delete" | "download";
    book: BookMeta;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0); // enter/leave fire for child elements too

  useEffect(() => {
    listBooks().then(setBooks);
  }, []);

  useEffect(
    () =>
      onBookAdded(() => {
        listBooks().then(setBooks);
      }),
    [],
  );

  async function addFiles(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);

    const errors: string[] = [];
    for (const file of files) {
      if (!isEpub(file)) {
        errors.push(`"${file.name}" is not an EPUB`);
        continue;
      }
      try {
        const data = await file.arrayBuffer();
        const { title, author, cover } = await readMetadata(data);
        await saveBook(
          {
            id: crypto.randomUUID(),
            title,
            author,
            cover,
            addedAt: Date.now(),
            location: null,
          },
          data,
        );
      } catch (e) {
        console.error(e);
        errors.push(`Could not read "${file.name}"`);
      }
    }

    if (errors.length) setError(errors.join(" · "));
    setBooks(await listBooks());
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function toggleFinished(b: BookMeta) {
    await setFinished(b.id, !isFinished(b));
    setBooks(await listBooks());
  }

  async function downloadBook(b: BookMeta) {
    const data = await getBookFile(b.id);
    if (!data) {
      setError(`Could not find the file for "${b.title}"`);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/epub+zip" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName(b);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function confirmPending() {
    if (!pending) return;
    const { kind, book } = pending;
    setPending(null);
    if (kind === "delete") {
      await deleteBook(book.id);
      setBooks(await listBooks());
    } else {
      await downloadBook(book);
    }
  }

  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault(); // required, otherwise the browser won't allow a drop
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      className="relative min-h-screen"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Library</h1>
          <AddMenu
            busy={busy}
            onDevice={() => inputRef.current?.click()}
            onLink={() => setLinkOpen(true)}
          />
          <input
            ref={inputRef}
            type="file"
            accept=".epub,application/epub+zip"
            multiple
            hidden
            onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
          />
        </header>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {books.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-zinc-700 p-12 text-center text-zinc-400">
            <p>No books yet.</p>
            <p className="mt-1 text-sm">
              Drag EPUB files here, or use the + button.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((b) => {
              const finished = isFinished(b);
              const percent = finished ? 100 : (b.progress ?? 0);
              return (
                <li key={b.id} className="group relative">
                  <button
                    onClick={() => onOpen(b.id)}
                    className="block w-full text-left"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded bg-zinc-800 shadow">
                      <Cover blob={b.cover} title={b.title} />
                      {percent > 0 && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                          <div
                            className={`h-full ${
                              finished ? "bg-emerald-500" : "bg-indigo-500"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium">
                      {b.title}
                    </p>
                    <p className="line-clamp-1 text-xs text-zinc-400">
                      {b.author}
                    </p>
                    <p
                      className={`mt-0.5 h-4 text-xs ${
                        finished ? "text-emerald-400" : "text-indigo-400"
                      }`}
                    >
                      {progressLabel(b)}
                    </p>
                  </button>
                  <BookMenu
                    book={b}
                    finished={finished}
                    onToggleFinished={() => toggleFinished(b)}
                    onDownload={() => setPending({ kind: "download", book: b })}
                    onDelete={() => setPending({ kind: "delete", book: b })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80">
          <div className="rounded-xl border-2 border-dashed border-indigo-400 px-12 py-10 text-lg text-indigo-300">
            Drop EPUB files to add them
          </div>
        </div>
      )}
      {linkOpen && <LinkDialog onClose={() => setLinkOpen(false)} />}
      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "delete"
              ? "Delete this book?"
              : "Download this book?"
          }
          message={
            pending.kind === "delete"
              ? `“${pending.book.title}” will be removed from this browser, along with your reading position. This can’t be undone, so download a copy first if you want to keep it.`
              : `Save “${pending.book.title}” to your device as an .epub file?`
          }
          confirmLabel={pending.kind === "delete" ? "Delete" : "Download"}
          danger={pending.kind === "delete"}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
