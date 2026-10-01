// Demo: three ways to handle "a LOT of rows", side by side.
//   1. Virtualized + paginated from the API  -> VirtualTable (1,000,000 rows, constant DOM size)
//   2. Naive: render every row into the DOM  -> NaiveTable   (shows why #1 exists)
//   3. NDJSON streaming                      -> StreamPanel  (moving lots of data without buffering it all)

import { useEffect, useMemo, useRef, useState } from "react";
import { ROWS_TOTAL } from "@app/shared";
import type { Row, RowStatus } from "@app/shared";
import VirtualTable, { GRID_COLS, RowView, TableHeader } from "@/components/VirtualTable";
import { streamRows } from "@/lib/streamRows";
import type { StreamProgress } from "@/lib/streamRows";

type Mode = "virtual" | "naive";

const NAIVE_SIZES = [1_000, 10_000, 50_000, 100_000];
const STATUSES: RowStatus[] = ["active", "pending", "suspended", "closed"];

/** Local row factory for the naive mode (same shape as the server rows, no network involved). */
function localRow(i: number): Row {
  const id = i + 1;
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    amount: ((id * 7919) % 100000) / 100,
    status: STATUSES[id % 4],
    createdAt: new Date(Date.UTC(2024, 0, 1) + id * 37_000).toISOString(),
  };
}

/**
 * Renders ALL n rows as real DOM nodes (n * 6 cells). This is what you get with a plain
 * `rows.map(...)` — and what virtualization avoids. Try 100k and watch the tab freeze.
 */
function NaiveTable({ n }: { n: number }) {
  const rows = useMemo(() => Array.from({ length: n }, (_, i) => localRow(i)), [n]);
  const [renderMs, setRenderMs] = useState<number | null>(null);

  // Measure "n changed -> pixels on screen". The time is captured during render (before React
  // builds the DOM) and read two animation frames later: the first rAF fires before the
  // browser lays out and paints, the second after it. Approximate, but good enough to compare.
  const t0 = useRef(0);
  t0.current = performance.now();
  useEffect(() => {
    const start = t0.current;
    setRenderMs(null);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setRenderMs(performance.now() - start));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [n]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b bg-white px-3 py-2 text-xs text-slate-600">
        rows in DOM: <b className="tabular-nums">{n.toLocaleString()}</b> ({(n * 6).toLocaleString()} cells) · time to first paint:{" "}
        <b>{renderMs === null ? "rendering…" : `${renderMs.toFixed(0)} ms`}</b>
      </div>
      <TableHeader />
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.map((row) => (
          <div key={row.id} className={`${GRID_COLS} h-9 border-b border-slate-100 text-sm`}>
            <RowView row={row} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Streams the dataset as NDJSON and shows live progress; nothing is stored, only counted. */
function StreamPanel() {
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []); // cancel on unmount

  async function start(count: number) {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setRunning(true);
    setError(null);
    try {
      await streamRows(count, setProgress, c.signal);
    } catch (e) {
      // AbortError = the user pressed Cancel (or started another run) — not a failure
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "failed");
    } finally {
      if (ctrl.current === c) setRunning(false);
    }
  }

  const mb = progress ? progress.bytes / 1e6 : 0;
  const secs = progress ? progress.ms / 1000 : 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-white px-3 py-2 text-xs text-slate-600">
      <span className="font-semibold text-slate-800">NDJSON stream:</span>
      {[100_000, ROWS_TOTAL].map((c) => (
        <button key={c} disabled={running} onClick={() => start(c)} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200 disabled:opacity-50">
          stream {c.toLocaleString()}
        </button>
      ))}
      {running && (
        <button onClick={() => ctrl.current?.abort()} className="rounded bg-red-100 px-2 py-1 text-red-700 hover:bg-red-200">
          cancel
        </button>
      )}
      {progress && (
        <span className="tabular-nums">
          {progress.rows.toLocaleString()} rows · {mb.toFixed(1)} MB · {secs.toFixed(1)} s · {Math.round(progress.rows / Math.max(secs, 0.001)).toLocaleString()} rows/s
          {running ? " …" : " ✓"}
        </span>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

export default function TablePage() {
  const [mode, setMode] = useState<Mode>("virtual");
  const [naiveN, setNaiveN] = useState(1_000);

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 ${active ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"}`;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
        <button className={tab(mode === "virtual")} onClick={() => setMode("virtual")}>
          Virtualized + API ({ROWS_TOTAL.toLocaleString()})
        </button>
        <button className={tab(mode === "naive")} onClick={() => setMode("naive")}>
          Naive DOM
        </button>
        {mode === "naive" && (
          <>
            <span className="ml-2 text-slate-500">rows:</span>
            {NAIVE_SIZES.map((s) => (
              <button key={s} className={tab(naiveN === s)} onClick={() => setNaiveN(s)}>
                {s.toLocaleString()}
              </button>
            ))}
            <span className="text-amber-600">100k will freeze the tab for a while — that is the point</span>
          </>
        )}
      </div>
      <StreamPanel />
      {mode === "virtual" ? <VirtualTable total={ROWS_TOTAL} /> : <NaiveTable n={naiveN} />}
    </div>
  );
}
