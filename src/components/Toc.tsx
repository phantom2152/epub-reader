import { useState } from "react";

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

const clean = (href: string) => href.split("#")[0];

function matches(item: TocItem, active: string) {
  const a = clean(active);
  const h = clean(item.href);
  return !!a && !!h && (a.endsWith(h) || h.endsWith(a));
}

function contains(item: TocItem, active: string): boolean {
  return (
    matches(item, active) ||
    (item.subitems ?? []).some((s) => contains(s, active))
  );
}

function TocNode({
  item,
  depth,
  active,
  onSelect,
}: {
  item: TocItem;
  depth: number;
  active: string;
  onSelect: (href: string) => void;
}) {
  const hasChildren = !!item.subitems && item.subitems.length > 0;
  const [open, setOpen] = useState(() => hasChildren && contains(item, active));
  const isActive = matches(item, active);

  return (
    <li>
      <div className="flex items-start" style={{ paddingLeft: depth * 12 }}>
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
            className="w-6 shrink-0 py-1 text-xs text-zinc-400 hover:text-white"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <button
          onClick={() => onSelect(item.href)}
          className={`flex-1 rounded px-2 py-1 text-left text-sm hover:bg-zinc-800 ${
            isActive
              ? "bg-zinc-800 font-medium text-indigo-400"
              : "text-zinc-300"
          }`}
        >
          {item.label.trim()}
        </button>
      </div>
      {hasChildren && open && (
        <ul>
          {item.subitems!.map((s) => (
            <TocNode
              key={s.id || s.href}
              item={s}
              depth={depth + 1}
              active={active}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Toc({
  items,
  active,
  onSelect,
}: {
  items: TocItem[];
  active: string;
  onSelect: (href: string) => void;
}) {
  if (items.length === 0) {
    return <p className="p-2 text-sm text-zinc-500">No chapters found.</p>;
  }
  return (
    <ul>
      {items.map((item) => (
        <TocNode
          key={item.id || item.href}
          item={item}
          depth={0}
          active={active}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
