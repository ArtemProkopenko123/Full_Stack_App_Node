// Demo: showing hundreds of thousands of geo points with their own data on a map.
// All the interesting logic lives in lib/map/PointsMap.ts; this page only wires it to React.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PointsMap } from "@/lib/map/PointsMap";
import type { MapStats, Mode } from "@/lib/map/PointsMap";
import type { Provider } from "@/lib/map/basemap";
import { useFps } from "@/lib/useFps";
import { POINTS_TOTAL } from "@app/shared";
import type { PointDetails } from "@app/shared";

// Optional. Without it the page falls back to MapLibre (free, no key needed).
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "clusters", label: "Server clusters", hint: "API returns only the visible viewport, pre-clustered" },
  { id: "gpu", label: "deck.gl all points", hint: "all points downloaded once, drawn on the GPU" },
  { id: "markers", label: "DOM markers", hint: "one DOM element per point — the slow way" },
];
const MARKER_LIMITS = [500, 2_000, 5_000, 10_000];

export default function MapPage() {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<PointsMap | null>(null);
  const [provider, setProvider] = useState<Provider>(GOOGLE_KEY ? "google" : "maplibre");
  // The starting mode can be given in the URL (/map?mode=gpu) — handy for sharing and testing.
  const [params] = useSearchParams();
  const initialMode = MODES.find((m) => m.id === params.get("mode"))?.id ?? "clusters";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [markerLimit, setMarkerLimit] = useState(2_000);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [selected, setSelected] = useState<PointDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fps = useFps();

  // (Re)create the map whenever the provider changes. The container div is keyed by provider
  // below, so each provider gets a fresh DOM node (Google and MapLibre can't share one).
  useEffect(() => {
    let cancelled = false;
    let instance: PointsMap | null = null;
    setReady(false);
    setError(null);
    setSelected(null);

    PointsMap.create(host.current!, {
      provider,
      googleKey: GOOGLE_KEY,
      onStats: setStats,
      onSelect: setSelected,
      onError: setError,
    })
      .then((pm) => {
        // The effect may have been cleaned up while the map was still loading (provider switched,
        // React StrictMode remount): then this instance is already unwanted.
        if (cancelled) return pm.dispose();
        instance = pm;
        map.current = pm;
        setReady(true);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to create the map"));

    return () => {
      cancelled = true;
      instance?.dispose();
      map.current = null;
    };
  }, [provider]);

  // Push UI state into the controller once it exists.
  useEffect(() => { if (ready) map.current?.setMode(mode); }, [ready, mode]);
  useEffect(() => { if (ready) map.current?.setMarkerLimit(markerLimit); }, [ready, markerLimit]);

  const btn = (active: boolean, disabled = false) =>
    `rounded-md px-3 py-1.5 ${active ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"} ${disabled ? "opacity-40 pointer-events-none" : ""}`;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
        <span className="text-slate-500">Map:</span>
        <button className={btn(provider === "google", !GOOGLE_KEY)} onClick={() => setProvider("google")} title={GOOGLE_KEY ? "" : "Set VITE_GOOGLE_MAPS_API_KEY in client/.env"}>
          Google Maps
        </button>
        <button className={btn(provider === "maplibre")} onClick={() => setProvider("maplibre")}>
          MapLibre
        </button>
        {!GOOGLE_KEY && <span className="text-xs text-amber-600">no VITE_GOOGLE_MAPS_API_KEY — Google disabled</span>}

        <span className="ml-4 text-slate-500">Render:</span>
        {MODES.map((m) => (
          <button key={m.id} className={btn(mode === m.id)} onClick={() => setMode(m.id)} title={m.hint}>
            {m.label}
          </button>
        ))}
        {mode === "markers" && (
          <>
            <span className="text-slate-500">markers:</span>
            {MARKER_LIMITS.map((n) => (
              <button key={n} className={btn(markerLimit === n)} onClick={() => setMarkerLimit(n)}>
                {n.toLocaleString()}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {/* key => a brand-new DOM node per provider */}
        <div key={provider} ref={host} className="h-full w-full" />

        <pre className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 p-2 text-xs leading-5 text-slate-100">
{`provider   ${provider}
dataset    ${POINTS_TOTAL.toLocaleString()} points
mode       ${mode}
drawn      ${stats ? stats.drawn.toLocaleString() : "–"}${stats?.loading ? "  (loading…)" : ""}
fetch      ${stats?.lastFetchMs ? `${stats.lastFetchMs.toFixed(0)} ms` : "–"}${stats?.lastBytes ? ` · ${(stats.lastBytes / 1024).toFixed(0)} KB` : ""}
main-thread FPS ${fps}`}
        </pre>

        {!ready && !error && <div className="absolute inset-0 grid place-items-center bg-white/60 text-sm text-slate-600">loading map…</div>}
        {error && <div className="absolute inset-x-3 bottom-3 rounded bg-red-600 p-2 text-sm text-white">{error}</div>}

        {selected && (
          <div className="absolute right-3 top-3 w-60 rounded bg-white p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between">
              <b>{selected.name}</b>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-600">
              <dt>id</dt><dd className="tabular-nums">{selected.id}</dd>
              <dt>category</dt><dd>{selected.category}</dd>
              <dt>value</dt><dd className="tabular-nums">{selected.value.toFixed(2)}</dd>
              <dt>lng, lat</dt><dd className="tabular-nums">{selected.lng.toFixed(4)}, {selected.lat.toFixed(4)}</dd>
            </dl>
            <p className="mt-2 text-xs text-slate-400">loaded on click from /api/points/:id</p>
          </div>
        )}
      </div>
    </div>
  );
}
