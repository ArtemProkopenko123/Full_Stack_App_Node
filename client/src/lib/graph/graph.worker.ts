// Runs off the main thread: generates a clustered random graph, then runs a
// d3-force layout and streams intermediate positions back as transferable
// Float32Arrays, so the UI stays responsive while the layout converges.
import { forceSimulation, forceLink, forceManyBody } from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

export type WorkerIn = { type: "start"; n: number };
export type WorkerOut =
  | {
      type: "graph";
      n: number;
      edges: Uint32Array; // [a0,b0,a1,b1,...]
      cluster: Uint16Array;
      clusterCount: number;
      degree: Uint16Array;
      positions: Float32Array; // [x0,y0,x1,y1,...]
    }
  | { type: "positions"; positions: Float32Array; tick: number; maxTicks: number }
  | { type: "done" };

const MAX_TICKS = 120;
let currentRun = 0;

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  if (e.data.type === "start") void start(e.data.n);
};

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function post(msg: WorkerOut, transfer: Transferable[]) {
  self.postMessage(msg, { transfer });
}

async function start(n: number) {
  const run = ++currentRun;

  // --- generate: clusters laid out in a disc, nodes gaussian around their centre
  const k = Math.max(5, Math.round(Math.sqrt(n) / 6));
  const R = Math.sqrt(n) * 8;
  const weights = Array.from({ length: k }, () => 0.3 + Math.random());
  const wSum = weights.reduce((a, b) => a + b, 0);
  const size = weights.map((w) => Math.floor((n * w) / wSum));
  size[k - 1] += n - size.reduce((a, b) => a + b, 0);
  const startAt: number[] = [];
  let acc = 0;
  for (let c = 0; c < k; c++) { startAt.push(acc); acc += size[c]; }

  const cluster = new Uint16Array(n);
  const positions = new Float32Array(n * 2);
  for (let c = 0; c < k; c++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = R * Math.sqrt(Math.random());
    const cx = Math.cos(ang) * rad, cy = Math.sin(ang) * rad;
    const sigma = (R / Math.sqrt(k)) * 0.35;
    for (let i = startAt[c]; i < startAt[c] + size[c]; i++) {
      cluster[i] = c;
      positions[i * 2] = cx + gaussian() * sigma;
      positions[i * 2 + 1] = cy + gaussian() * sigma;
    }
  }

  // --- edges: 90% inside a cluster, 10% across clusters
  const m = Math.round(n * 1.5);
  const edges = new Uint32Array(m * 2);
  const degree = new Uint16Array(n);
  for (let e = 0; e < m; e++) {
    const a = Math.floor(Math.random() * n);
    const c = cluster[a];
    let b = Math.random() < 0.9 ? startAt[c] + Math.floor(Math.random() * size[c]) : Math.floor(Math.random() * n);
    if (b === a) b = (b + 1) % n;
    edges[e * 2] = a;
    edges[e * 2 + 1] = b;
    if (degree[a] < 65535) degree[a]++;
    if (degree[b] < 65535) degree[b]++;
  }

  // d3 gets its own plain-object copies; typed-array copies are transferred to the main thread
  const nodes: SimulationNodeDatum[] = Array.from({ length: n }, (_, i) => ({
    x: positions[i * 2],
    y: positions[i * 2 + 1],
  }));
  const links: SimulationLinkDatum<SimulationNodeDatum>[] = Array.from({ length: m }, (_, e) => ({
    source: edges[e * 2],
    target: edges[e * 2 + 1],
  }));

  post(
    { type: "graph", n, edges, cluster, clusterCount: k, degree, positions: positions.slice() },
    [edges.buffer, cluster.buffer, degree.buffer],
  );

  // --- layout: Barnes-Hut (quadtree) repulsion + spring links, ticked manually so we can yield and be cancelled
  const alphaMin = 0.001;
  const sim = forceSimulation(nodes)
    .alphaMin(alphaMin)
    .alphaDecay(1 - Math.pow(alphaMin, 1 / MAX_TICKS))
    .force("link", forceLink(links).distance(10).strength(0.4).iterations(1))
    .force("charge", forceManyBody().strength(-6).theta(1.2).distanceMax(120))
    .stop();

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    sim.tick();
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      out[i * 2] = nodes[i].x ?? 0;
      out[i * 2 + 1] = nodes[i].y ?? 0;
    }
    post({ type: "positions", positions: out, tick, maxTicks: MAX_TICKS }, [out.buffer]);
    await new Promise((r) => setTimeout(r, 0)); // let a newer "start" message through
    if (run !== currentRun) return; // superseded by a newer run
  }
  post({ type: "done" }, []);
}
