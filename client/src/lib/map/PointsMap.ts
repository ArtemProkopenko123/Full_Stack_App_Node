// The map controller: owns the base map, decides WHAT to fetch/draw for the current mode
// and view, and draws it. React (MapPage) only creates it, switches modes and shows stats.
//
// Three ways to show the same 500k points — the whole point of the demo:
//
//  "clusters"  SERVER clustering. On every pan/zoom the browser asks the API for the current
//              viewport only; the server (Supercluster) answers with a few hundred clusters /
//              points. The client never sees the other 99.9% of the data.
//
//  "gpu"       CLIENT all-points. All 500k points are downloaded ONCE as a compact binary
//              blob and drawn by deck.gl on the GPU. Panning/zooming needs no network and no
//              JS work: the GPU just re-projects the same vertex buffer.
//
//  "markers"   NAIVE DOM markers, one DOM element per point (capped, because it cannot cope).
//              Here for comparison: switch to it, raise the limit, and watch FPS fall.

import axios from "axios";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PointDatasetId, PointDetails, PointMeta } from "@app/shared";
import { api } from "../api";
import { createGoogleMap, createMapLibre } from "./basemap";
import type { BaseMap, Provider } from "./basemap";

export type Mode = "clusters" | "gpu" | "markers";

export interface MapStats {
  provider: Provider;
  mode: Mode;
  /** how many things are being drawn right now (clusters+points / all points / DOM markers) */
  drawn: number;
  lastFetchMs: number;
  lastBytes: number;
  loading: boolean;
  /** true while the SERVER is preparing a dataset (the first "sgp" load downloads ~35 MB) */
  loadingDataset: boolean;
  /** number of points in the dataset (known once its meta has arrived) */
  total: number;
}

interface Options {
  provider: Provider;
  googleKey?: string;
  // initial state (later changes go through setMode / setMarkerLimit / setDataset)
  dataset: PointDatasetId;
  mode: Mode;
  markerLimit: number;
  onMeta: (m: PointMeta) => void;
  onStats: (s: MapStats) => void;
  onSelect: (p: PointDetails | null) => void;
  onError: (message: string) => void;
}

// One RGBA color per category (also used as CSS colors for DOM markers)
const PALETTE: [number, number, number][] = [
  [220, 38, 38], // cafe
  [37, 99, 235], // shop
  [22, 163, 74], // school
  [202, 138, 4], // park
  [147, 51, 234], // office
];
const css = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const CLUSTER_COLOR = [15, 23, 42, 210];

// Where the camera starts for each dataset (zoom in the 512px-tile convention, see View.zoom).
const START_VIEW: Record<PointDatasetId, { lng: number; lat: number; zoom: number }> = {
  synthetic: { lng: 15, lat: 49, zoom: 3.5 }, // Europe
  sgp: { lng: 0, lat: 25, zoom: 1.3 }, // the whole world
};

/** 1234 -> "1.2k" (cluster labels must stay short to fit inside the circle) */
const abbreviate = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/** All points, as typed arrays ready to hand to the GPU. */
interface Dataset {
  count: number;
  positions: Float32Array; // [lng, lat] * count
  colors: Uint8Array; // [r, g, b, a] * count
}

export class PointsMap {
  private base!: BaseMap;
  private opts: Options;
  private mode: Mode;
  private markerLimit: number;
  private datasetId: PointDatasetId;
  private meta: PointMeta | null = null; // set once the server has loaded the dataset
  private metaLoading: Promise<PointMeta> | null = null;
  private dataset: Dataset | null = null;
  private datasetLoading: Promise<Dataset> | null = null;
  private lastItems: number[] = []; // flat cluster response, kept so a click can map index -> item
  private abort: AbortController | null = null; // in-flight /clusters request
  private seq = 0; // bumped on every refresh; lets async results detect they became stale
  private disposed = false;
  private stats: MapStats;

  private constructor(opts: Options) {
    this.opts = opts;
    this.mode = opts.mode;
    this.markerLimit = opts.markerLimit;
    this.datasetId = opts.dataset;
    this.stats = {
      provider: opts.provider, mode: opts.mode, drawn: 0, lastFetchMs: 0, lastBytes: 0,
      loading: false, loadingDataset: false, total: 0,
    };
  }

  static async create(container: HTMLElement, opts: Options): Promise<PointsMap> {
    const pm = new PointsMap(opts);
    pm.base =
      opts.provider === "google"
        ? await createGoogleMap(container, opts.googleKey ?? "")
        : await createMapLibre(container);
    const v = START_VIEW[opts.dataset];
    pm.base.jumpTo(v.lng, v.lat, v.zoom); // before onIdle is registered, so it doesn't trigger a refresh
    // Re-evaluate what to show whenever the camera settles. Not on every frame: for
    // "clusters" that would be a network request per frame.
    pm.base.onIdle(() => void pm.refresh());
    void pm.refresh();
    return pm;
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    // Leaving a mode: clear what it drew, so nothing from the old mode stays on the map.
    this.base.setLayers([]);
    this.base.setMarkers([]);
    this.abort?.abort();
    this.emit({ lastFetchMs: 0, lastBytes: 0 }); // don't show the previous mode's network numbers
    void this.refresh();
  }

  /** Switch to another dataset: drop everything that belongs to the old one and start over. */
  setDataset(id: PointDatasetId) {
    if (id === this.datasetId) return;
    this.datasetId = id;
    this.meta = null;
    this.metaLoading = null;
    this.dataset = null;
    this.datasetLoading = null;
    this.lastItems = [];
    this.abort?.abort();
    this.base.setLayers([]);
    this.base.setMarkers([]);
    this.opts.onSelect(null);
    this.emit({ drawn: 0, total: 0, lastFetchMs: 0, lastBytes: 0 });
    const v = START_VIEW[id];
    this.base.jumpTo(v.lng, v.lat, v.zoom); // each dataset lives somewhere else on the globe
    void this.refresh();
  }

  setMarkerLimit(n: number) {
    this.markerLimit = n;
    if (this.mode === "markers") void this.refresh();
  }

  dispose() {
    this.disposed = true;
    this.abort?.abort();
    this.base.dispose();
  }

  // ---------------------------------------------------------------------------------
  // refresh(): "bring the map in line with the current mode + camera"
  // ---------------------------------------------------------------------------------
  private async refresh() {
    if (this.disposed) return;
    const seq = ++this.seq;
    try {
      await this.ensureMeta();
      if (seq !== this.seq || this.disposed) return;
      if (this.mode === "clusters") await this.showClusters(seq);
      else if (this.mode === "gpu") await this.showAllOnGpu(seq);
      else await this.showMarkers(seq);
    } catch (e) {
      if (axios.isCancel(e)) return; // superseded by a newer refresh — expected
      this.opts.onError(e instanceof Error ? e.message : "Request failed");
    }
  }

  /**
   * Make sure the server has the dataset loaded. For "sgp" the first call can take a minute
   * (the server downloads ~35 MB from sgp-search.io once, then keeps a copy), so the UI is
   * told via `loadingDataset`. Later calls resolve immediately from the cached promise.
   */
  private ensureMeta(): Promise<PointMeta> {
    if (this.meta) return Promise.resolve(this.meta);
    if (!this.metaLoading) {
      const id = this.datasetId;
      this.emit({ loadingDataset: true, loading: true });
      this.metaLoading = api
        .get<PointMeta>("/api/points/meta", { params: { dataset: id } })
        .then(({ data }) => {
          if (id === this.datasetId) { // ignore a response for a dataset we already switched away from
            this.meta = data;
            this.opts.onMeta(data);
            this.emit({ loadingDataset: false, total: data.total });
          }
          return data;
        })
        .catch((e) => {
          this.metaLoading = null; // allow a retry on the next refresh
          this.emit({ loadingDataset: false, loading: false });
          throw e;
        });
    }
    return this.metaLoading;
  }

  private emit(patch: Partial<MapStats>) {
    this.stats = { ...this.stats, mode: this.mode, ...patch };
    if (!this.disposed) this.opts.onStats(this.stats);
  }

  // ---- mode 1: server-side clusters --------------------------------------------------
  private async showClusters(seq: number) {
    this.abort?.abort(); // a newer view makes the previous request pointless
    const ctrl = (this.abort = new AbortController());
    this.emit({ loading: true });

    const t0 = performance.now();
    const v = this.base.getView();
    const res = await api.get<string>("/api/points/clusters", {
      params: {
        dataset: this.datasetId,
        // Zoomed far out the visible area is wider than the globe (e.g. west = -217°); the API
        // only accepts real coordinates, and nothing exists outside them anyway, so clamp.
        west: Math.max(v.west, -180),
        south: Math.max(v.south, -90),
        east: Math.min(v.east, 180),
        north: Math.min(v.north, 90),
        zoom: Math.max(Math.floor(v.zoom), 0),
      },
      signal: ctrl.signal,
      // keep the raw text so we can report the payload size, then parse it ourselves
      responseType: "text",
      transformResponse: (r) => r,
    });
    if (seq !== this.seq || this.disposed) return; // user moved on while we waited

    const items: number[] = JSON.parse(res.data).items;
    this.lastItems = items;
    const n = items.length / 5; // stride 5: [lng, lat, count, id, category]

    // Build typed arrays for deck.gl's binary-attribute mode (no per-item JS objects for dots)
    const positions = new Float32Array(n * 2);
    const radius = new Float32Array(n);
    const colors = new Uint8Array(n * 4);
    const labels: { pos: [number, number]; text: string }[] = [];
    for (let i = 0; i < n; i++) {
      const [lng, lat, count, , cat] = items.slice(i * 5, i * 5 + 5);
      positions[i * 2] = lng;
      positions[i * 2 + 1] = lat;
      if (count > 0) {
        // cluster: bigger circle for more points (sqrt: area ~ count)
        radius[i] = Math.min(34, 11 + Math.sqrt(count) * 0.14);
        colors.set(CLUSTER_COLOR, i * 4);
        labels.push({ pos: [lng, lat], text: abbreviate(count) });
      } else {
        radius[i] = 4; // a single point
        colors.set([...PALETTE[cat], 230], i * 4);
      }
    }

    const dots = new ScatterplotLayer({
      id: "clusters",
      data: { length: n, attributes: { getPosition: { value: positions, size: 2 }, getRadius: { value: radius, size: 1 }, getFillColor: { value: colors, size: 4 } } },
      radiusUnits: "pixels",
      pickable: true,
      onClick: (info) => this.onClusterClick(info.index),
    });
    const text = new TextLayer({
      id: "cluster-labels",
      data: labels,
      getPosition: (d) => d.pos,
      getText: (d) => d.text,
      getSize: 12,
      getColor: [255, 255, 255, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "system-ui, sans-serif",
    });
    this.base.setLayers([dots, text]);
    this.emit({ drawn: n, lastFetchMs: performance.now() - t0, lastBytes: res.data.length, loading: false });
  }

  private onClusterClick(index: number) {
    if (index < 0) return;
    const [lng, lat, count, id] = this.lastItems.slice(index * 5, index * 5 + 5);
    if (count > 0) this.base.zoomToward(lng, lat, 2); // cluster: zoom in to break it up
    else void this.select(id); // single point: load its details
  }

  // ---- mode 2: everything on the GPU -------------------------------------------------
  private async showAllOnGpu(seq: number) {
    const t0 = performance.now();
    const hadData = !!this.dataset;
    if (!hadData) this.emit({ loading: true });
    const data = await this.loadDataset();
    if (seq !== this.seq || this.disposed) return;

    // `data` is unchanged between refreshes, so deck.gl reuses its GPU buffers: panning and
    // zooming cost no network and almost no JS — the GPU just re-projects the same vertices.
    const layer = new ScatterplotLayer({
      id: "all-points",
      data: { length: data.count, attributes: { getPosition: { value: data.positions, size: 2 }, getFillColor: { value: data.colors, size: 4 } } },
      getRadius: 1,
      radiusUnits: "pixels",
      radiusMinPixels: 1.5,
      pickable: true, // deck renders ids into an offscreen buffer; hit-testing is done on the GPU
      autoHighlight: true,
      onClick: (info) => { if (info.index >= 0) void this.select(info.index + 1); }, // index i <=> id i+1
    });
    this.base.setLayers([layer], ({ index }) => (index >= 0 ? `#${index + 1} — ${this.meta?.categories[this.categoryOf(index)] ?? ""}` : null));
    this.emit({ drawn: data.count, loading: false, ...(hadData ? {} : { lastFetchMs: performance.now() - t0, lastBytes: data.count * 9 }) });
  }

  private categoryOf(index: number) {
    // recover the category from the color we assigned (avoids keeping a second array around)
    const c = this.dataset!.colors;
    return PALETTE.findIndex((p) => p[0] === c[index * 4] && p[1] === c[index * 4 + 1] && p[2] === c[index * 4 + 2]);
  }

  /** Downloads all points once and caches them (concurrent callers share one request). */
  private loadDataset(): Promise<Dataset> {
    if (this.dataset) return Promise.resolve(this.dataset);
    const id = this.datasetId; // the user may switch datasets while this download is running
    this.datasetLoading ??= api
      .get<ArrayBuffer>("/api/points/binary", { params: { dataset: this.datasetId }, responseType: "arraybuffer" })
      .then(({ data: buf }) => {
        // Wire format: Float32 [lng,lat]*N, then Uint8 category*N  ->  9 bytes per point
        const count = buf.byteLength / 9;
        const positions = new Float32Array(buf, 0, count * 2); // a VIEW on the buffer, no copy
        const categories = new Uint8Array(buf, count * 8, count);
        const colors = new Uint8Array(count * 4);
        for (let i = 0; i < count; i++) {
          const c = PALETTE[categories[i]];
          colors[i * 4] = c[0];
          colors[i * 4 + 1] = c[1];
          colors[i * 4 + 2] = c[2];
          colors[i * 4 + 3] = 200;
        }
        const ds = { count, positions, colors };
        if (id === this.datasetId) this.dataset = ds; // don't let a stale download overwrite the new dataset
        return ds;
      })
      .catch((e) => {
        if (id === this.datasetId) this.datasetLoading = null; // allow a retry
        throw e;
      });
    return this.datasetLoading;
  }

  // ---- mode 3: naive DOM markers -----------------------------------------------------
  private async showMarkers(seq: number) {
    const data = await this.loadDataset();
    if (seq !== this.seq || this.disposed) return;

    // Scan all points for those inside the viewport and stop at the limit. A real app would
    // use a spatial index here (see the quadtree on the Graph page); a linear scan is fine
    // for a demo, and it isn't what we're measuring — the DOM markers are.
    const v = this.base.getView();
    const specs = [];
    for (let i = 0; i < data.count && specs.length < this.markerLimit; i++) {
      const lng = data.positions[i * 2];
      const lat = data.positions[i * 2 + 1];
      if (lng >= v.west && lng <= v.east && lat >= v.south && lat <= v.north) {
        specs.push({ lng, lat, color: css(PALETTE[this.categoryOf(i)]) });
      }
    }
    this.base.setMarkers(specs); // creates one DOM element per marker
    this.emit({ drawn: specs.length, loading: false });
  }

  // ---- selection: the point's "own data" ---------------------------------------------
  private async select(id: number) {
    try {
      const { data } = await api.get<PointDetails>(`/api/points/${id}`, { params: { dataset: this.datasetId } });
      if (!this.disposed) this.opts.onSelect(data);
    } catch (e) {
      this.opts.onError(e instanceof Error ? e.message : "Failed to load the point");
    }
  }
}
