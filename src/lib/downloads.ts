import { readMetadata } from "./epub";
import { saveBook } from "./storage";
import { MAX_BYTES, formatBytes } from "./link";

export type DownloadStatus = "downloading" | "saving" | "done" | "error";

export interface Download {
  id: string;
  name: string;
  received: number;
  total: number | null;
  status: DownloadStatus;
  error?: string;
}

// Lives outside React, so downloads keep going while you move between
// the library and the reader (the page never reloads).
let downloads: Download[] = [];
const listeners = new Set<() => void>();
const addedListeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();

export const getDownloads = () => downloads;

export function subscribeDownloads(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// called whenever a downloaded book has been saved to the library
export function onBookAdded(cb: () => void) {
  addedListeners.add(cb);
  return () => {
    addedListeners.delete(cb);
  };
}

function setDownloads(next: Download[]) {
  downloads = next;
  listeners.forEach((l) => l());
}

function patch(id: string, p: Partial<Download>) {
  setDownloads(downloads.map((d) => (d.id === id ? { ...d, ...p } : d)));
}

const exists = (id: string) => downloads.some((d) => d.id === id);

export function cancelDownload(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  setDownloads(downloads.filter((d) => d.id !== id));
}

export const dismissDownload = cancelDownload;

function withTimeout<T>(p: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function startDownload(opts: {
  url: string;
  name: string;
  size: number | null;
}) {
  const id = crypto.randomUUID();
  setDownloads([
    ...downloads,
    {
      id,
      name: opts.name,
      received: 0,
      total: opts.size,
      status: "downloading",
    },
  ]);
  void run(id, opts.url);
}

async function run(id: string, url: string) {
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  const tooBig = `This file is larger than ${formatBytes(MAX_BYTES)}, which is too big to hold in the browser.`;

  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    if (!res.body) throw new Error("This browser can’t stream downloads.");

    const lenRaw = Number(res.headers.get("content-length"));
    const total = Number.isFinite(lenRaw) && lenRaw > 0 ? lenRaw : null;
    if (total && total > MAX_BYTES) throw new Error(tooBig);
    patch(id, { total });

    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    let lastEmit = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (received > MAX_BYTES) {
        ctrl.abort();
        throw new Error(tooBig);
      }
      const now = performance.now();
      if (now - lastEmit > 100) {
        lastEmit = now;
        patch(id, { received });
      }
    }

    patch(id, { received, status: "saving" });
    const data = await new Blob(chunks).arrayBuffer();

    // a real EPUB is a zip archive, which always starts with "PK"
    const sig = new Uint8Array(data, 0, Math.min(2, data.byteLength));
    if (sig.length < 2 || sig[0] !== 0x50 || sig[1] !== 0x4b) {
      throw new Error(
        "This isn’t an EPUB. The link returned a web page or another type of file.",
      );
    }

    let meta: Awaited<ReturnType<typeof readMetadata>>;
    try {
      meta = await withTimeout(readMetadata(data), 30_000, "timeout");
    } catch {
      throw new Error("This file couldn’t be read as an EPUB.");
    }

    await saveBook(
      {
        id: crypto.randomUUID(),
        title: meta.title,
        author: meta.author,
        cover: meta.cover,
        addedAt: Date.now(),
        location: null,
      },
      data,
    );

    if (exists(id)) {
      patch(id, { status: "done", name: meta.title });
      setTimeout(() => cancelDownload(id), 6000);
    }
    addedListeners.forEach((l) => l());
  } catch (e) {
    if (!exists(id)) return; // cancelled by the user
    console.error(e);
    const message =
      e instanceof TypeError
        ? "The connection was interrupted."
        : (e as Error).message || "The download failed.";
    patch(id, { status: "error", error: message });
  } finally {
    controllers.delete(id);
  }
}
