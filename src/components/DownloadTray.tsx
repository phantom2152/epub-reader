import { useEffect, useSyncExternalStore } from "react";
import {
  cancelDownload,
  getDownloads,
  subscribeDownloads,
} from "../lib/downloads";
import { formatBytes } from "../lib/link";

export default function DownloadTray() {
  const items = useSyncExternalStore(subscribeDownloads, getDownloads);
  const active = items.some(
    (d) => d.status === "downloading" || d.status === "saving",
  );

  // browsers ask "leave site?" if a download is still running
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-16 right-4 z-40 w-72 space-y-2">
      {items.map((d) => {
        const pct = d.total
          ? Math.min(100, Math.round((d.received / d.total) * 100))
          : null;
        return (
          <div
            key={d.id}
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl"
          >
            <div className="flex items-start gap-2">
              <p className="line-clamp-1 flex-1 text-sm font-medium">
                {d.name}
              </p>
              {d.status !== "saving" && (
                <button
                  onClick={() => cancelDownload(d.id)}
                  aria-label={
                    d.status === "downloading" ? "Cancel download" : "Dismiss"
                  }
                  className="text-sm leading-none text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <p
              className={`mt-1 text-xs ${
                d.status === "error"
                  ? "text-red-400"
                  : d.status === "done"
                    ? "text-emerald-400"
                    : "text-zinc-400"
              }`}
            >
              {d.status === "downloading" &&
                (pct !== null
                  ? `${pct}% · ${formatBytes(d.received)} of ${formatBytes(d.total!)}`
                  : `${formatBytes(d.received)} downloaded`)}
              {d.status === "saving" && "Checking and saving…"}
              {d.status === "done" && "Added to library"}
              {d.status === "error" && d.error}
            </p>

            {d.status !== "error" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-800">
                <div
                  className={`h-full ${
                    d.status === "done" ? "bg-emerald-500" : "bg-indigo-500"
                  } ${
                    d.status === "saving" ||
                    (d.status === "downloading" && pct === null)
                      ? "animate-pulse"
                      : ""
                  }`}
                  style={{
                    width:
                      d.status === "downloading" && pct !== null
                        ? `${pct}%`
                        : "100%",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      {active && (
        <p className="px-1 text-xs text-zinc-400">
          Keep this tab open until downloads finish.
        </p>
      )}
    </div>
  );
}
