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

export default function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listBooks().then(setBooks);
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
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
        setError(`Could not read "${file.name}"`);
      }
    }
    setBooks(await listBooks());
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleDelete(id: string) {
    await deleteBook(id);
    setBooks(await listBooks());
  }

  return (
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
          onChange={(e) => handleFiles(e.target.files)}
        />
      </header>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {books.length === 0 ? (
        <p className="text-zinc-400">
          No books yet. Add an EPUB to get started.
        </p>
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
                <p className="line-clamp-1 text-xs text-zinc-400">{b.author}</p>
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
  );
}
