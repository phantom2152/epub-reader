import { useEffect, useRef, useState } from "react";

export default function AddMenu({
  busy,
  onDevice,
  onLink,
}: {
  busy: boolean;
  onDevice: () => void;
  onLink: () => void;
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Add book"
        aria-haspopup="menu"
        aria-expanded={open}
        title={busy ? "Adding…" : "Add book"}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? (
          <span className="text-sm">…</span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl"
        >
          <li role="none">
            <button role="menuitem" onClick={run(onDevice)} className={item}>
              From device
            </button>
          </li>
          <li role="none">
            <button role="menuitem" onClick={run(onLink)} className={item}>
              From link
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
