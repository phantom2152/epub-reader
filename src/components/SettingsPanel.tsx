import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  THEMES,
  type Settings,
} from "../lib/settings";

export default function SettingsPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <div className="absolute right-4 top-full z-10 mt-2 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
      <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Background
      </p>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => set({ themeId: t.id })}
            aria-label={t.name}
            title={t.name}
            className={`h-10 rounded border-2 text-sm font-semibold ${
              settings.themeId === t.id
                ? "border-indigo-500"
                : "border-zinc-700"
            }`}
            style={{ backgroundColor: t.bg, color: t.fg }}
          >
            Aa
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Font size
      </p>
      <div className="flex items-center justify-between">
        <button
          onClick={() => set({ fontSize: settings.fontSize - FONT_STEP })}
          disabled={settings.fontSize <= FONT_MIN}
          className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700 disabled:opacity-40"
        >
          A−
        </button>
        <span className="text-sm text-zinc-300">{settings.fontSize}%</span>
        <button
          onClick={() => set({ fontSize: settings.fontSize + FONT_STEP })}
          disabled={settings.fontSize >= FONT_MAX}
          className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700 disabled:opacity-40"
        >
          A+
        </button>
      </div>
    </div>
  );
}
