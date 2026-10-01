import * as THREE from "three";
import { Quadtree } from "./quadtree";
import type { WorkerIn, WorkerOut } from "./graph.worker";

export type Lod = "clusters" | "nodes" | "edges";

export interface GraphStats {
  nodes: number;
  edges: number;
  tick: number;
  maxTicks: number;
  layoutDone: boolean;
  lod: Lod;
  renderMs: number;
  drawCalls: number;
  visibleNodes: number;
  qtBuildMs: number;
  qtQueryMs: number;
  scanMs: number;
}

export interface HoverInfo {
  id: number;
  degree: number;
  cluster: number;
  x: number; // screen px relative to the container
  y: number;
}

interface Options {
  onStats: (s: GraphStats) => void;
  onHover: (h: HoverInfo | null) => void;
}

const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPx;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPx;
  }
`;
const POINT_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard; // round dot
    gl_FragColor = vec4(vColor, uAlpha);
  }
`;

// zoom relative to "fit whole graph" zoom
const LOD_NODES_AT = 1.6;
const LOD_EDGES_AT = 4;
const QT_REBUILD_MS = 400;

function bench(fn: () => void, reps = 20) {
  const t = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return (performance.now() - t) / reps;
}

export class GraphView {
  private container: HTMLElement;
  private opts: Options;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private worker: Worker | null = null;

  // camera state (world coords; y up)
  private cx = 0;
  private cy = 0;
  private zoom = 1;
  private fitZoom = 1;

  // graph data
  private n = 0;
  private edgeCount = 0;
  private pos: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private cluster: Uint16Array<ArrayBufferLike> = new Uint16Array(0);
  private degree: Uint16Array<ArrayBufferLike> = new Uint16Array(0);
  private clusterCount = 0;
  private clusterSize: number[] = [];
  private qt: Quadtree | null = null;
  private lastQtBuild = 0;
  private fitted = false;

  // three objects
  private nodePos: THREE.BufferAttribute | null = null;
  private nodes: THREE.Points | null = null;
  private edges: THREE.LineSegments | null = null;
  private clusters: THREE.Points | null = null;
  private clusterPos: THREE.BufferAttribute | null = null;
  private hoverPoint: THREE.Points;
  private lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.3, depthTest: false });
  private nodeMat: THREE.ShaderMaterial;
  private clusterMat: THREE.ShaderMaterial;
  private hoverMat: THREE.ShaderMaterial;

  private lodEnabled = true;
  private lod: Lod = "clusters";
  private hoverId = -1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private raf = 0;
  private statsTimer = 0;
  private resizeObs: ResizeObserver;
  private stats: GraphStats = {
    nodes: 0, edges: 0, tick: 0, maxTicks: 0, layoutDone: false, lod: "clusters",
    renderMs: 0, drawCalls: 0, visibleNodes: 0, qtBuildMs: 0, qtQueryMs: 0, scanMs: 0,
  };

  constructor(container: HTMLElement, opts: Options) {
    this.container = container;
    this.opts = opts;
    const px = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(px);
    this.renderer.setClearColor(0x0b1020);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    const mat = (alpha: number) =>
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: { uPx: { value: px }, uAlpha: { value: alpha } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
    this.nodeMat = mat(0.95);
    this.clusterMat = mat(0.75);
    this.hoverMat = mat(1);

    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2), 2));
    hg.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3));
    hg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array([12]), 1));
    this.hoverPoint = new THREE.Points(hg, this.hoverMat);
    this.hoverPoint.frustumCulled = false;
    this.hoverPoint.renderOrder = 3;
    this.hoverPoint.visible = false;
    this.scene.add(this.hoverPoint);

    const el = this.renderer.domElement;
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.statsTimer = window.setInterval(() => this.opts.onStats({ ...this.stats }), 250);
  }

  // ---------- data ----------

  load(n: number) {
    this.worker?.terminate();
    this.clearGraph();
    this.stats = { ...this.stats, nodes: n, edges: 0, tick: 0, layoutDone: false };
    const worker = new Worker(new URL("./graph.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerOut>) => this.onWorker(e.data);
    worker.postMessage({ type: "start", n } satisfies WorkerIn);
    this.worker = worker;
  }

  setLod(enabled: boolean) {
    this.lodEnabled = enabled;
    this.requestRender();
  }

  private onWorker(msg: WorkerOut) {
    if (msg.type === "graph") {
      this.n = msg.n;
      this.edgeCount = msg.edges.length / 2;
      this.pos = msg.positions;
      this.cluster = msg.cluster;
      this.degree = msg.degree;
      this.clusterCount = msg.clusterCount;
      this.clusterSize = new Array(msg.clusterCount).fill(0);
      for (let i = 0; i < this.n; i++) this.clusterSize[this.cluster[i]]++;
      this.buildScene(msg.edges);
      this.rebuildQuadtree();
      this.fitToGraph();
      this.stats.edges = this.edgeCount;
    } else if (msg.type === "positions") {
      if (!this.nodePos) return;
      this.pos = msg.positions;
      (this.nodePos.array as Float32Array).set(msg.positions);
      this.nodePos.needsUpdate = true;
      this.updateClusters();
      if (performance.now() - this.lastQtBuild > QT_REBUILD_MS) this.rebuildQuadtree();
      this.stats.tick = msg.tick;
      this.stats.maxTicks = msg.maxTicks;
      this.requestRender();
    } else {
      this.rebuildQuadtree();
      this.stats.layoutDone = true;
    }
  }

  private clearGraph() {
    for (const o of [this.nodes, this.edges, this.clusters]) {
      if (!o) continue;
      this.scene.remove(o);
      o.geometry.dispose();
    }
    this.nodes = this.edges = this.clusters = null;
    this.nodePos = this.clusterPos = null;
    this.qt = null;
    this.n = 0;
    this.fitted = false;
    this.hoverId = -1;
    this.hoverPoint.visible = false;
    this.opts.onHover(null);
    this.requestRender();
  }

  private buildScene(edgeIdx: Uint32Array) {
    const n = this.n;
    const colors = new Float32Array(n * 3);
    const clusterColors = new Float32Array(this.clusterCount * 3);
    const c = new THREE.Color();
    for (let k = 0; k < this.clusterCount; k++) {
      c.setHSL(((k * 137.5) % 360) / 360, 0.7, 0.6);
      clusterColors.set([c.r, c.g, c.b], k * 3);
    }
    for (let i = 0; i < n; i++) {
      const k = this.cluster[i] * 3;
      colors[i * 3] = clusterColors[k];
      colors[i * 3 + 1] = clusterColors[k + 1];
      colors[i * 3 + 2] = clusterColors[k + 2];
    }

    // one position buffer shared by nodes AND edges
    this.nodePos = new THREE.BufferAttribute(this.pos.slice(), 2);
    this.nodePos.setUsage(THREE.DynamicDrawUsage);

    const ng = new THREE.BufferGeometry();
    ng.setAttribute("position", this.nodePos);
    ng.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    ng.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n).fill(2.5), 1));
    this.nodes = new THREE.Points(ng, this.nodeMat);
    this.nodes.frustumCulled = false;
    this.nodes.renderOrder = 1;

    // edges reference nodes by index -> no per-edge vertex data, nothing to update when nodes move
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", this.nodePos);
    eg.setIndex(new THREE.BufferAttribute(edgeIdx, 1));
    this.edges = new THREE.LineSegments(eg, this.lineMat);
    this.edges.frustumCulled = false;
    this.edges.renderOrder = 0;

    const cg = new THREE.BufferGeometry();
    this.clusterPos = new THREE.BufferAttribute(new Float32Array(this.clusterCount * 2), 2);
    this.clusterPos.setUsage(THREE.DynamicDrawUsage);
    cg.setAttribute("position", this.clusterPos);
    cg.setAttribute("aColor", new THREE.BufferAttribute(clusterColors, 3));
    const sizes = new Float32Array(this.clusterCount);
    for (let k = 0; k < this.clusterCount; k++) sizes[k] = Math.min(60, 8 + Math.sqrt(this.clusterSize[k]) * 0.4);
    cg.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.clusters = new THREE.Points(cg, this.clusterMat);
    this.clusters.frustumCulled = false;
    this.clusters.renderOrder = 2;

    this.scene.add(this.edges, this.nodes, this.clusters);
    this.updateClusters();
  }

  /** LOD aggregate: one point per cluster at its centroid. O(n) but trivial next to drawing n points. */
  private updateClusters() {
    if (!this.clusterPos) return;
    const sx = new Float64Array(this.clusterCount);
    const sy = new Float64Array(this.clusterCount);
    for (let i = 0; i < this.n; i++) {
      const k = this.cluster[i];
      sx[k] += this.pos[i * 2];
      sy[k] += this.pos[i * 2 + 1];
    }
    const arr = this.clusterPos.array as Float32Array;
    for (let k = 0; k < this.clusterCount; k++) {
      arr[k * 2] = sx[k] / this.clusterSize[k];
      arr[k * 2 + 1] = sy[k] / this.clusterSize[k];
    }
    this.clusterPos.needsUpdate = true;
  }

  private rebuildQuadtree() {
    const t = performance.now();
    this.qt = new Quadtree(this.pos, this.n);
    this.lastQtBuild = performance.now();
    this.stats.qtBuildMs = this.lastQtBuild - t;
  }

  private fitToGraph() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const x = this.pos[i * 2], y = this.pos[i * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.cx = (minX + maxX) / 2;
    this.cy = (minY + maxY) / 2;
    this.fitZoom = Math.min(w / ((maxX - minX) * 1.15), h / ((maxY - minY) * 1.15));
    this.zoom = this.fitZoom;
    this.fitted = true;
    this.requestRender();
  }

  // ---------- rendering ----------

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  private requestRender() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.render());
  }

  private viewRect() {
    const hw = this.container.clientWidth / 2 / this.zoom;
    const hh = this.container.clientHeight / 2 / this.zoom;
    return { x0: this.cx - hw, x1: this.cx + hw, y0: this.cy - hh, y1: this.cy + hh };
  }

  private render() {
    this.raf = 0;
    const r = this.viewRect();
    const cam = this.camera;
    cam.left = r.x0; cam.right = r.x1; cam.top = r.y1; cam.bottom = r.y0;
    cam.updateProjectionMatrix();

    const rel = this.fitted ? this.zoom / this.fitZoom : 1;
    this.lod = !this.lodEnabled ? "edges" : rel < LOD_NODES_AT ? "clusters" : rel < LOD_EDGES_AT ? "nodes" : "edges";
    if (this.nodes) this.nodes.visible = this.lod !== "clusters";
    if (this.edges) this.edges.visible = this.lod === "edges";
    if (this.clusters) this.clusters.visible = this.lod === "clusters";

    const t = performance.now();
    this.renderer.render(this.scene, cam);
    this.stats.renderMs = performance.now() - t; // CPU time to submit the frame; GPU work is async
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.lod = this.lod;
    this.stats.visibleNodes = this.qt ? this.qt.countInRect(r.x0, r.y0, r.x1, r.y1) : 0;
  }

  // ---------- interaction ----------

  private toWorld(sx: number, sy: number) {
    return {
      x: this.cx + (sx - this.container.clientWidth / 2) / this.zoom,
      y: this.cy - (sy - this.container.clientHeight / 2) / this.zoom,
    };
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(this.fitZoom * 300, Math.max(this.fitZoom * 0.5, this.zoom * Math.exp(-e.deltaY * 0.0015)));
    const after = this.toWorld(sx, sy); // keep the point under the cursor fixed
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.setHover(-1);
    this.requestRender();
  };

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onUp = (e: PointerEvent) => {
    this.dragging = false;
    this.renderer.domElement.releasePointerCapture(e.pointerId);
  };

  private onLeave = () => this.setHover(-1);

  private onMove = (e: PointerEvent) => {
    if (this.dragging) {
      this.cx -= (e.clientX - this.lastX) / this.zoom;
      this.cy += (e.clientY - this.lastY) / this.zoom;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.setHover(-1);
      this.requestRender();
      return;
    }
    if (!this.qt || this.lod === "clusters") return this.setHover(-1);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const maxD = 12 / this.zoom;

    let id = -1;
    // same query two ways: spatial index vs. scanning every node (timings are averaged over repeats)
    this.stats.qtQueryMs = bench(() => { id = this.qt!.nearest(w.x, w.y, maxD); });
    this.stats.scanMs = bench(() => this.scanNearest(w.x, w.y, maxD));
    this.setHover(id);
  };

  private scanNearest(x: number, y: number, maxD: number) {
    let best = maxD * maxD, bi = -1;
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const dx = p[i * 2] - x, dy = p[i * 2 + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    return bi;
  }

  private setHover(id: number) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    if (id < 0) {
      this.hoverPoint.visible = false;
      this.opts.onHover(null);
    } else {
      const x = this.pos[id * 2], y = this.pos[id * 2 + 1];
      const attr = this.hoverPoint.geometry.getAttribute("position") as THREE.BufferAttribute;
      (attr.array as Float32Array).set([x, y]);
      attr.needsUpdate = true;
      this.hoverPoint.visible = true;
      this.opts.onHover({
        id,
        degree: this.degree[id],
        cluster: this.cluster[id],
        x: (x - this.cx) * this.zoom + this.container.clientWidth / 2,
        y: -(y - this.cy) * this.zoom + this.container.clientHeight / 2,
      });
    }
    this.requestRender();
  }

  dispose() {
    clearInterval(this.statsTimer);
    cancelAnimationFrame(this.raf);
    this.worker?.terminate();
    this.resizeObs.disconnect();
    this.clearGraph();
    this.hoverPoint.geometry.dispose();
    for (const m of [this.nodeMat, this.clusterMat, this.hoverMat, this.lineMat]) m.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
