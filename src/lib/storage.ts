import { openDB, type DBSchema } from "idb";

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  cover: Blob | null;
  addedAt: number;
  location: string | null; // last reading position
  progress?: number; // 0-100
  lastReadAt?: number;
}

interface ReaderDB extends DBSchema {
  books: { key: string; value: BookMeta };
  files: { key: string; value: ArrayBuffer };
  locations: { key: string; value: string };
}

const dbPromise = openDB<ReaderDB>("ebook-reader", 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("books", { keyPath: "id" });
      db.createObjectStore("files");
    }
    if (oldVersion < 2) {
      db.createObjectStore("locations");
    }
  },
});

export async function listBooks(): Promise<BookMeta[]> {
  const db = await dbPromise;
  const books = await db.getAll("books");
  return books.sort(
    (a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt),
  );
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
  const tx = db.transaction(["books", "files", "locations"], "readwrite");
  await Promise.all([
    tx.objectStore("books").delete(id),
    tx.objectStore("files").delete(id),
    tx.objectStore("locations").delete(id),
    tx.done,
  ]);
}

export async function getBookMeta(id: string) {
  const db = await dbPromise;
  return db.get("books", id);
}

export async function saveLocation(
  id: string,
  location: string,
  progress?: number,
) {
  const db = await dbPromise;
  const tx = db.transaction("books", "readwrite");
  const meta = await tx.store.get(id);
  if (!meta) return;
  await tx.store.put({
    ...meta,
    location,
    lastReadAt: Date.now(),
    ...(progress !== undefined ? { progress } : {}),
  });
  await tx.done;
}

export async function getLocations(id: string) {
  const db = await dbPromise;
  return db.get("locations", id);
}

export async function saveLocations(id: string, json: string) {
  const db = await dbPromise;
  await db.put("locations", json, id);
}
