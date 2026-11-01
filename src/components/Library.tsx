import { useEffect, useRef, useState } from "react";
import { deleteBook, listBooks, saveBook, type BookMeta } from "../lib/storage";
import { readMetadata } from "../lib/epub";

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

export default function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0); // enter/leave fire for child elements too

  useEffect(() => {
    listBooks().then(setBooks);
  }, []);

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

  async function handleDelete(id: string) {
    await deleteBook(id);
    setBooks(await listBooks());
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
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add book"}
          </button>
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
              Drag EPUB files here, or click “Add book”.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((b) => (
              <li key={b.id} className="group relative">
                <button
                  onClick={() => onOpen(b.id)}
                  className="block w-full text-left"
                >
                  <div className="aspect-2/3 overflow-hidden rounded bg-zinc-800 shadow">
                    <Cover blob={b.cover} title={b.title} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">
                    {b.title}
                  </p>
                  <p className="line-clamp-1 text-xs text-zinc-400">
                    {b.author}
                  </p>
                </button>
                <button
                  onClick={() => handleDelete(b.id)}
                  aria-label={`Delete ${b.title}`}
                  className="absolute right-1 top-1 hidden rounded bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-red-600 group-hover:block"
                >
                  ✕
                </button>
              </li>
            ))}
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
    </div>
  );
}
