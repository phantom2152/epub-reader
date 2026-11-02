import { useEffect, useRef, useState, type Ref } from "react";
import { MIN_QUERY, queryPattern, type SearchHit } from "../lib/search";

interface SearchResult {
  hits: SearchHit[];
  truncated: boolean;
}

function Excerpt({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${queryPattern(query)})`, "i"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded bg-yellow-400/40 px-0.5 text-inherit"
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function SearchPanel({
  search,
  onGo,
  onClear,
  inputRef,
}: {
  search: (
    query: string,
    signal: AbortSignal,
    onProgress: (done: number, total: number, found: number) => void,
  ) => Promise<SearchResult>;
  onGo: (hit: SearchHit) => void;
  onClear: () => void;
  inputRef: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "error">(
    "idle",
  );
  const [progress, setProgress] = useState({ done: 0, total: 1, found: 0 });
  const [result, setResult] = useState<SearchResult>({
    hits: [],
    truncated: false,
  });
  const [searched, setSearched] = useState("");
  const [stopped, setStopped] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const stopRef = useRef(false);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  async function run() {
    const q = query.trim();
    if (q.length < MIN_QUERY || status === "searching") return;

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    stopRef.current = false;
    setStatus("searching");
    setStopped(false);
    setResult({ hits: [], truncated: false });
    setActive(null);
    setProgress({ done: 0, total: 1, found: 0 });
    onClear();

    try {
      const res = await search(q, ctrl.signal, (done, total, found) =>
        setProgress({ done, total, found }),
      );
      // ignore results from a search that was replaced; keep ones the user stopped
      if (ctrl.signal.aborted && !stopRef.current) return;
      setResult(res);
      setSearched(q);
      setStopped(ctrl.signal.aborted);
      setStatus("done");
    } catch (e) {
      console.error(e);
      if (!ctrl.signal.aborted) setStatus("error");
    }
  }

  function stop() {
    stopRef.current = true;
    ctrlRef.current?.abort();
  }

  function clear() {
    stopRef.current = false;
    ctrlRef.current?.abort();
    setQuery("");
    setStatus("idle");
    setResult({ hits: [], truncated: false });
    setActive(null);
    onClear();
  }

  const { hits, truncated } = result;

  return (
    <div>
      <div className="sticky top-0 z-1 bg-zinc-950 pb-2">
        <div className="flex gap-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="Search in book…"
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          {status === "searching" ? (
            <button
              onClick={stop}
              className="rounded bg-zinc-800 px-2 text-sm hover:bg-zinc-700"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={run}
              disabled={query.trim().length < MIN_QUERY}
              className="rounded bg-indigo-600 px-2 text-sm hover:bg-indigo-500 disabled:opacity-40"
            >
              Go
            </button>
          )}
          {(query || status !== "idle") && (
            <button
              onClick={clear}
              aria-label="Clear search"
              className="rounded px-2 text-sm text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        <p className="mt-2 px-1 text-xs text-zinc-500">
          {status === "idle" &&
            `Type at least ${MIN_QUERY} letters, then press Enter.`}
          {status === "searching" &&
            `Searching ${progress.done}/${progress.total} sections · ${progress.found} found`}
          {status === "error" &&
            "Search failed. Check the console for details."}
          {status === "done" &&
            (hits.length === 0
              ? `No results for “${searched}”${stopped ? " (stopped early)" : ""}`
              : `${hits.length} result${hits.length === 1 ? "" : "s"}${
                  truncated ? " (showing the first " + hits.length + ")" : ""
                }${stopped ? " · stopped early" : ""}`)}
        </p>
      </div>

      <ul>
        {hits.map((h, i) => {
          const showHeader =
            !!h.chapter && (i === 0 || hits[i - 1].chapter !== h.chapter);
          return (
            <li key={`${h.cfi}-${i}`}>
              {showHeader && (
                <p className="mt-2 px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {h.chapter}
                </p>
              )}
              <button
                onClick={() => {
                  setActive(i);
                  onGo(h);
                }}
                className={`w-full rounded px-2 py-1.5 text-left text-[13px] leading-snug hover:bg-zinc-800 ${
                  active === i ? "bg-zinc-800 text-white" : "text-zinc-300"
                }`}
              >
                <Excerpt text={h.excerpt} query={searched} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
