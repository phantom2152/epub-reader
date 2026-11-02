export const MAX_BYTES = 200 * 1024 * 1024; // 200 MB, the file is held in memory

export type LinkErrorKind =
  | "invalid"
  | "mixed"
  | "blocked"
  | "timeout"
  | "http";

export class LinkError extends Error {
  kind: LinkErrorKind;
  constructor(kind: LinkErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface LinkInfo {
  url: string;
  host: string;
  name: string;
  size: number | null;
  type: string | null;
  looksLikeEpub: boolean;
}

const BLOCKED =
  "Couldn’t read that link from the browser. The server may not allow other websites to access its files (CORS), you may be offline, or the link may be down, and browsers don’t say which. You can download the file yourself and add it with “From device”, or drag it onto the library.";

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function parseLink(input: string): URL {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new LinkError("invalid", "That doesn’t look like a valid link.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new LinkError("invalid", "Only http and https links are supported.");
  }
  if (location.protocol === "https:" && u.protocol === "http:") {
    throw new LinkError(
      "mixed",
      "This page is served over https, so the browser blocks plain http links. Try the https version of the link.",
    );
  }
  return u;
}

function nameFrom(res: Response, u: URL): string {
  // only readable cross-origin if the server exposes Content-Disposition
  const cd = res.headers.get("content-disposition");
  if (cd) {
    const star = /filename\*\s*=\s*(?:[\w-]+'[^']*')?([^;]+)/i.exec(cd);
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
    const raw = (star?.[1] ?? plain?.[1])?.trim();
    if (raw) {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last) || "book.epub";
  } catch {
    return last || "book.epub";
  }
}

async function request(u: URL, method: "HEAD" | "GET", signal: AbortSignal) {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort);
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, 15_000);
  try {
    const res = await fetch(u, {
      method,
      signal: ctrl.signal,
      credentials: "omit",
    });
    // for GET we only wanted the headers, so don't download the body
    if (method === "GET") res.body?.cancel().catch(() => {});
    return res;
  } catch (e) {
    if (signal.aborted) throw e;
    if (timedOut) {
      throw new LinkError("timeout", "The server took too long to answer.");
    }
    throw new LinkError("blocked", BLOCKED);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchLinkInfo(
  input: string,
  signal: AbortSignal,
): Promise<LinkInfo> {
  const u = parseLink(input);

  let res: Response;
  try {
    res = await request(u, "HEAD", signal);
    if (!res.ok) res = await request(u, "GET", signal);
  } catch (e) {
    // some servers refuse HEAD outright, so try once with GET
    if (e instanceof LinkError && e.kind === "blocked") {
      res = await request(u, "GET", signal);
    } else {
      throw e;
    }
  }

  if (!res.ok) {
    throw new LinkError(
      "http",
      `The server answered ${res.status}${res.statusText ? " " + res.statusText : ""}.`,
    );
  }

  const lenRaw = Number(res.headers.get("content-length"));
  const size = Number.isFinite(lenRaw) && lenRaw > 0 ? lenRaw : null;
  const type = res.headers.get("content-type")?.split(";")[0].trim() || null;
  const name = nameFrom(res, u);

  return {
    url: u.href,
    host: u.host,
    name,
    size,
    type,
    looksLikeEpub: /\.epub$/i.test(name) || type === "application/epub+zip",
  };
}
