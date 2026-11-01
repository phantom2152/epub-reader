import {
  CUSTOM_ID,
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  LAYOUTS,
  THEMES,
  getTheme,
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
  const isCustom = settings.themeId === CUSTOM_ID;
  const custom = getTheme({ ...settings, themeId: CUSTOM_ID });

  return (
    <div className="absolute right-4 top-full z-10 mt-2 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
      <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Background
      </p>
      <div className="mb-3 grid grid-cols-5 gap-2">
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
        <button
          onClick={() => set({ themeId: CUSTOM_ID })}
          aria-label="Custom"
          title="Custom"
          className={`h-10 rounded border-2 text-sm font-semibold ${
            isCustom ? "border-indigo-500" : "border-dashed border-zinc-600"
          }`}
          style={{ backgroundColor: custom.bg, color: custom.fg }}
        >
          Aa
        </button>
      </div>

      {isCustom && (
        <div className="mb-4 space-y-2 rounded bg-zinc-800 p-3">
          <label className="flex items-center justify-between text-sm text-zinc-300">
            Background
            <input
              type="color"
              value={settings.customBg}
              onChange={(e) => set({ customBg: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-zinc-600 bg-transparent"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between text-sm text-zinc-300">
            Auto text color
            <input
              type="checkbox"
              checked={settings.autoFg}
              onChange={(e) => set({ autoFg: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-indigo-500"
            />
          </label>

          {!settings.autoFg && (
            <label className="flex items-center justify-between text-sm text-zinc-300">
              Text
              <input
                type="color"
                value={settings.customFg}
                onChange={(e) => set({ customFg: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-zinc-600 bg-transparent"
              />
            </label>
          )}
        </div>
      )}

      <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Page layout
      </p>
      <div className="mb-1 grid grid-cols-2 gap-2">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() => set({ layout: l.id })}
            title={l.hint}
            className={`rounded border-2 px-2 py-1.5 text-sm ${
              settings.layout === l.id
                ? "border-indigo-500 bg-zinc-800 text-white"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        {LAYOUTS.find((l) => l.id === settings.layout)?.hint}
      </p>

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
