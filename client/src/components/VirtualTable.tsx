// A hand-written virtualized table. No library on purpose, so every moving part is visible.
//
// IDEA: the table has `total` (1,000,000) logical rows, but the DOM only ever contains the
// ~25 rows that are actually on screen (+ a few extra "overscan" rows so fast scrolling
// doesn't flash blank space). As the user scrolls we don't move DOM nodes, we just
// re-render the same ~30 <div>s with different data and a different Y position.
//
// LAYOUT (outside -> inside):
//
//   scroller   overflow:auto. This is the element that owns the real scrollbar.
//   └─ spacer  height = (virtual) total height of all rows. It exists ONLY to make the
//      │       scrollbar the right size; it has no visible content.
//      └─ viewport  position:sticky; top:0; height = visible height. Sticky keeps it glued
//                   to the top of the scroller while the spacer scrolls underneath it.
//         └─ rows   absolutely positioned with translateY — these are the ~30 real nodes.
//
// THE 1M-ROW PROBLEM: 1,000,000 rows * 36px = 36,000,000px. Browsers cap element height
// (Chrome ~33.5M px, Firefox ~17.8M px); beyond it the scrollbar breaks. So the spacer is
// capped at MAX_SCROLL_HEIGHT and we map scroll POSITION -> row index by RATIO rather than
// by pixels: "scrolled 40% of the way" => "show rows starting at 40% of the dataset".
// When the dataset is small enough that no capping happens, this maths degenerates to the
// plain `scrollTop / ROW_HEIGHT`, so it is the same code path for both cases.
// Trade-off when capped: one pixel of scroll is more than one row, so you can't land on an
// exact row with the scrollbar alone — that's what the "jump to row" input is for.

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Row } from "@app/shared";
import { PAGE_SIZE, usePagedRows } from "@/lib/usePagedRows";

export const ROW_HEIGHT = 36;
const OVERSCAN = 5; // extra rows rendered above/below the visible window
const MAX_SCROLL_HEIGHT = 10_000_000; // safely under every browser's element-height limit
const FETCH_DEBOUNCE_MS = 80; // don't fetch while the user is flinging the scrollbar

// shared by header and rows so the columns line up
export const GRID_COLS = "grid grid-cols-[90px_1.2fr_2fr_110px_110px_190px] items-center gap-2 px-3";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  suspended: "bg-orange-100 text-orange-700",
  closed: "bg-slate-200 text-slate-600",
};

export function TableHeader() {
  return (
    <div className={`${GRID_COLS} h-9 border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500`}>
      <span>ID</span>
      <span>Name</span>
      <span>Email</span>
      <span className="text-right">Amount</span>
      <span>Status</span>
      <span>Created</span>
    </div>
  );
}

/** One table row. `memo`: when the cache updates, rows whose data didn't change skip re-rendering. */
export const RowView = memo(function RowView({ row }: { row: Row }) {
  return (
    <>
      <span className="tabular-nums text-slate-500">{row.id}</span>
      <span className="truncate">{row.name}</span>
      <span className="truncate text-slate-600">{row.email}</span>
      <span className="text-right tabular-nums">{row.amount.toFixed(2)}</span>
      <span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLORS[row.status]}`}>{row.status}</span>
      </span>
      <span className="text-slate-500">{row.createdAt.replace("T", " ").replace("Z", "")}</span>
    </>
  );
});

/** Grey bars shown for a row whose page hasn't arrived yet. */
function Skeleton() {
  return (
    <>
      {[40, 70, 85, 50, 45, 80].map((w, i) => (
        <span key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${w}%` }} />
      ))}
    </>
  );
}

export default function VirtualTable({ total }: { total: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(600); // visible height of the scroller, px
  const [scrollTop, setScrollTop] = useState(0);
  const { getRow, ensureRange, stats, error } = usePagedRows(total);

  // Track the scroller's size (window resize, layout changes). useLayoutEffect = measure
  // before the first paint so we don't flash a wrongly sized table.
  useLayoutEffect(() => {
    const el = scroller.current!;
    const update = () => setViewH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- scroll position -> which rows are visible ---------------------------------------
  const contentH = total * ROW_HEIGHT; // what the height WOULD be with no browser limit
  const spacerH = Math.min(contentH, MAX_SCROLL_HEIGHT); // what we actually give the spacer
  const maxScroll = Math.max(spacerH - viewH, 1); // scrollTop at the very bottom
  const maxFirst = Math.max(total - viewH / ROW_HEIGHT, 0); // index of the top row at the very bottom

  const ratio = Math.min(Math.max(scrollTop / maxScroll, 0), 1); // 0 (top) .. 1 (bottom)
  const firstFloat = ratio * maxFirst; // fractional: e.g. 1234.4 = row 1234, 40% scrolled past
  const first = Math.floor(firstFloat); // first row that is (at least partly) visible
  const shiftPx = (firstFloat - first) * ROW_HEIGHT; // sub-row offset => smooth pixel scrolling

  const visibleCount = Math.ceil(viewH / ROW_HEIGHT) + 1; // +1 for the partly visible bottom row
  const start = Math.max(0, first - OVERSCAN);
  const end = Math.min(total - 1, first + visibleCount + OVERSCAN); // inclusive

  // ---- load the data for what is on screen ---------------------------------------------
  // Debounced: while the scrollbar is being dragged `first` changes every frame; we only want
  // to hit the API for where the user actually stops. The cleanup cancels the pending timer.
  useEffect(() => {
    const id = setTimeout(() => ensureRange(start, end), FETCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [start, end, ensureRange]);

  /** Scroll so that `row` is at the top. Inverse of the ratio mapping above. */
  function jumpTo(row: number) {
    const r = Math.min(Math.max(row, 0), total - 1);
    scroller.current!.scrollTop = maxFirst > 0 ? (r / maxFirst) * maxScroll : 0;
  }

  const rows = [];
  for (let i = start; i <= end; i++) {
    const row = getRow(i);
    rows.push(
      <div
        key={i} // keyed by logical index: React reuses DOM nodes as the window slides
        className={`${GRID_COLS} absolute left-0 right-0 border-b border-slate-100 text-sm hover:bg-slate-50`}
        // Position relative to the sticky viewport, NOT to the whole spacer: that's why the
        // rows never need huge pixel offsets (which would also hit browser limits).
        style={{ height: ROW_HEIGHT, transform: `translateY(${(i - first) * ROW_HEIGHT - shiftPx}px)` }}
      >
        {row ? <RowView row={row} /> : <Skeleton />}
      </div>,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b bg-white px-3 py-2 text-xs text-slate-600">
        <JumpToRow total={total} onJump={jumpTo} />
        <span>rows in DOM: <b className="tabular-nums">{rows.length}</b> of {total.toLocaleString()}</span>
        <span>cached: <b className="tabular-nums">{stats.cachedRows.toLocaleString()}</b> rows ({stats.cachedPages} pages × {PAGE_SIZE})</span>
        <span>in flight: <b>{stats.pending}</b></span>
        <span>last page: <b>{stats.lastFetchMs ? `${stats.lastFetchMs.toFixed(0)} ms` : "–"}</b></span>
        <span>spacer: <b>{(spacerH / 1e6).toFixed(1)}M px</b>{contentH > spacerH && " (capped, ratio-mapped)"}</span>
        {error && <span className="text-red-600">error: {error}</span>}
      </div>
      <TableHeader />
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: spacerH }}>
          <div className="sticky top-0 overflow-hidden" style={{ height: viewH }}>
            {rows}
          </div>
        </div>
      </div>
    </div>
  );
}

function JumpToRow({ total, onJump }: { total: number; onJump: (row: number) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value.replace(/[\s,_]/g, ""));
        if (Number.isFinite(n)) onJump(n - 1); // the input is 1-based, indexes are 0-based
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`jump to row (1–${total.toLocaleString()})`}
        className="w-56 rounded border px-2 py-1"
      />
      <button className="rounded bg-slate-900 px-2 py-1 text-white">Go</button>
    </form>
  );
}
