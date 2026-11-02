import { useEffect, useRef, useState } from "react";
import { startDownload } from "../lib/downloads";
import {
  LinkError,
  MAX_BYTES,
  fetchLinkInfo,
  formatBytes,
  type LinkInfo,
} from "../lib/link";

type Phase =
  | { kind: "input" }
  | { kind: "checking" }
  | { kind: "ready"; info: LinkInfo }
  | { kind: "error"; message: string };

// a real filename ends in an extension; random IDs from CDN links don't
const hasExtension = (name: string) => /\.[a-z0-9]{2,5}$/i.test(name);

export default function LinkDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // stop any in-flight check when the dialog goes away
  useEffect(() => () => abortRef.current?.abort(), []);

  async function check() {
    const value = url.trim();
    if (!value || phase.kind === "checking") return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: "checking" });

    try {
      const info = await fetchLinkInfo(value, ctrl.signal);
      if (!ctrl.signal.aborted) setPhase({ kind: "ready", info });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      console.warn("Link check failed", e);
      setPhase({
        kind: "error",
        message:
          e instanceof LinkError
            ? e.message
            : "Something went wrong while checking the link.",
      });
    }
  }

  function add(info: LinkInfo) {
    startDownload({
      url: info.url,
      name: hasExtension(info.name) ? info.name : "Downloading book…",
      size: info.size,
    });
    onClose();
  }

  const ready = phase.kind === "ready" ? phase.info : null;
  const tooBig = !!ready && ready.size !== null && ready.size > MAX_BYTES;
  const nameKnown = !!ready && hasExtension(ready.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add book from link"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">Add book from link</h2>

        {ready ? (
          <>
            <dl className="mt-4 space-y-2 rounded bg-zinc-800 p-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-400">
                  File
                </dt>
                {nameKnown ? (
                  <dd className="break-all font-medium">{ready!.name}</dd>
                ) : (
                  <dd className="text-zinc-300">
                    Not provided by the server
                    <span className="block text-xs text-zinc-500">
                      The title is read from the book after download.
                    </span>
                  </dd>
                )}
              </div>
              <div className="flex gap-6">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-400">
                    Size
                  </dt>
                  <dd>
                    {ready.size
                      ? formatBytes(ready.size)
                      : "Shown when download starts"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-zinc-400">
                    Type
                  </dt>
                  <dd className="truncate">{ready.type ?? "Unknown"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-400">
                  From
                </dt>
                <dd className="break-all">{ready.host}</dd>
              </div>
            </dl>

            {!ready.looksLikeEpub && (
              <p className="mt-3 text-sm text-amber-400">
                This doesn’t look like an EPUB from its name or type. It will be
                checked after downloading.
              </p>
            )}
            {tooBig && (
              <p className="mt-3 text-sm text-red-400">
                This file is larger than {formatBytes(MAX_BYTES)}, which is too
                big to hold in the browser.
              </p>
            )}

            <p className="mt-3 text-xs text-zinc-500">
              The download runs in the background. Keep this tab open until it
              finishes.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPhase({ kind: "input" })}
                className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
              >
                Back
              </button>
              <button
                autoFocus
                onClick={() => add(ready)}
                disabled={tooBig}
                className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
              >
                Add to library
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") check();
              }}
              disabled={phase.kind === "checking"}
              placeholder="https://example.com/book.epub"
              spellCheck={false}
              className="mt-4 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60"
            />

            {phase.kind === "error" ? (
              <p className="mt-3 text-sm text-red-400">{phase.message}</p>
            ) : phase.kind === "checking" ? (
              <p className="mt-3 text-sm text-zinc-400">Checking link…</p>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">
                The file is downloaded by your browser, so the server has to
                allow it (CORS). If it doesn’t, download the file yourself and
                use “From device”, or drag it in.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded bg-zinc-800 px-4 py-1.5 text-sm hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={check}
                disabled={!url.trim() || phase.kind === "checking"}
                className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
              >
                Check link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
