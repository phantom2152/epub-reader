import { openDB, type DBSchema } from "idb";

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  cover: Blob | null;
  addedAt: number;
  location: string | null; // last reading position, used later
}

interface ReaderDB extends DBSchema {
  books: { key: string; value: BookMeta };
  files: { key: string; value: ArrayBuffer };
}

const dbPromise = openDB<ReaderDB>("ebook-reader", 1, {
  upgrade(db) {
    db.createObjectStore("books", { keyPath: "id" });
    db.createObjectStore("files");
  },
});

export async function listBooks(): Promise<BookMeta[]> {
  const db = await dbPromise;
  const books = await db.getAll("books");
  return books.sort((a, b) => b.addedAt - a.addedAt);
}

export async function saveBook(meta: BookMeta, data: ArrayBuffer) {
  const db = await dbPromise;
  const tx = db.transaction(["books", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("books").put(meta),
    tx.objectStore("files").put(data, meta.id),
    tx.done,
  ]);
}

export async function getBookFile(id: string) {
  const db = await dbPromise;
  return db.get("files", id);
}

export async function deleteBook(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(["books", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("books").delete(id),
    tx.objectStore("files").delete(id),
    tx.done,
  ]);
}

export async function getBookMeta(id: string) {
  const db = await dbPromise;
  return db.get("books", id);
}

export async function saveLocation(id: string, location: string) {
  const db = await dbPromise;
  const meta = await db.get("books", id);
  if (!meta) return;
  await db.put("books", { ...meta, location });
}
