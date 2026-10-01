import { useEffect, useRef, useState } from "react";
import { GraphView } from "@/lib/graph/GraphView";
import type { GraphStats, HoverInfo } from "@/lib/graph/GraphView";

const SIZES = [5_000, 20_000, 50_000, 100_000];

const fmt = (n: number) => n.toLocaleString();
const ms = (n: number) => (n < 0.01 ? "<0.01" : n.toFixed(n < 1 ? 3 : 1)) + " ms";

export default function GraphPage() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<GraphView | null>(null);
  const [n, setN] = useState(20_000);
  const [run, setRun] = useState(0);
  const [lod, setLod] = useState(true);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const v = new GraphView(host.current!, { onStats: setStats, onHover: setHover });
    view.current = v;
    return () => {
      v.dispose();
      view.current = null;
    };
  }, []);
  useEffect(() => view.current?.load(n), [n, run]);
  useEffect(() => view.current?.setLod(lod), [lod]);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b p-3 text-sm">
        <div className="flex gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setN(s)}
              className={`rounded-md px-3 py-1.5 ${n === s ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
            >
              {fmt(s)} nodes
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={lod} onChange={(e) => setLod(e.target.checked)} />
          Level of detail
        </label>
        <button onClick={() => setRun((r) => r + 1)} className="rounded-md bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
          Regenerate
        </button>
        <span className="text-slate-500">scroll = zoom, drag = pan, hover = nearest node</span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={host} className="h-full w-full" />
        {stats && (
          <pre className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 p-2 text-xs leading-5 text-slate-100">
{`nodes / edges   ${fmt(stats.nodes)} / ${fmt(stats.edges)}
layout (worker) ${stats.layoutDone ? "done" : `${stats.tick}/${stats.maxTicks || "…"}`}
LOD level       ${stats.lod}
visible nodes   ${fmt(stats.visibleNodes)}  (quadtree count)
draw calls      ${stats.drawCalls}
render (CPU)    ${ms(stats.renderMs)}
quadtree build  ${ms(stats.qtBuildMs)}
hover: quadtree ${ms(stats.qtQueryMs)}
hover: full scan${ms(stats.scanMs).padStart(9)}`}
          </pre>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute rounded bg-white px-2 py-1 text-xs shadow"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            node #{hover.id} · degree {hover.degree} · cluster {hover.cluster}
          </div>
        )}
      </div>
    </div>
  );
}
