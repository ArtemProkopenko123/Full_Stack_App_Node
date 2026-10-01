// Static point quadtree over a flat Float32Array [x0,y0,x1,y1,...].
// Points are reordered inside one index array; every tree node owns a
// contiguous slice [start, end) of it, so the whole tree is a few flat arrays
// (no per-node objects -> cheap to rebuild for 100k+ points).

const LEAF_CAPACITY = 12;
const MAX_DEPTH = 24;

export class Quadtree {
  private pos: Float32Array;
  private idx: Uint32Array;
  private x0: number[] = [];
  private y0: number[] = [];
  private x1: number[] = [];
  private y1: number[] = [];
  private start: number[] = [];
  private end: number[] = [];
  private first: number[] = []; // index of first of 4 children, -1 for a leaf
  private bestD = 0;
  private bestI = -1;

  constructor(pos: Float32Array, n: number) {
    this.pos = pos;
    this.idx = new Uint32Array(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      this.idx[i] = i;
      const x = pos[i * 2], y = pos[i * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (n === 0) return;
    this.addNode(minX - 1, minY - 1, maxX + 1, maxY + 1, 0, n);
    this.split(0, 0, new Uint32Array(n));
  }

  private addNode(x0: number, y0: number, x1: number, y1: number, s: number, e: number) {
    this.x0.push(x0); this.y0.push(y0); this.x1.push(x1); this.y1.push(y1);
    this.start.push(s); this.end.push(e); this.first.push(-1);
    return this.x0.length - 1;
  }

  private split(node: number, depth: number, tmp: Uint32Array) {
    const s = this.start[node], e = this.end[node];
    if (e - s <= LEAF_CAPACITY || depth >= MAX_DEPTH) return;
    const { pos, idx } = this;
    const mx = (this.x0[node] + this.x1[node]) / 2;
    const my = (this.y0[node] + this.y1[node]) / 2;

    // counting sort of the slice into 4 quadrants
    const counts = [0, 0, 0, 0];
    for (let i = s; i < e; i++) {
      const p = idx[i];
      counts[(pos[p * 2] >= mx ? 1 : 0) | (pos[p * 2 + 1] >= my ? 2 : 0)]++;
    }
    const offs = [s, s + counts[0], s + counts[0] + counts[1], s + counts[0] + counts[1] + counts[2]];
    const cursor = offs.slice();
    for (let i = s; i < e; i++) {
      const p = idx[i];
      tmp[cursor[(pos[p * 2] >= mx ? 1 : 0) | (pos[p * 2 + 1] >= my ? 2 : 0)]++] = p;
    }
    idx.set(tmp.subarray(s, e), s);

    const x0 = this.x0[node], y0 = this.y0[node], x1 = this.x1[node], y1 = this.y1[node];
    const f = this.addNode(x0, y0, mx, my, offs[0], offs[0] + counts[0]);
    this.addNode(mx, y0, x1, my, offs[1], offs[1] + counts[1]);
    this.addNode(x0, my, mx, y1, offs[2], offs[2] + counts[2]);
    this.addNode(mx, my, x1, y1, offs[3], offs[3] + counts[3]);
    this.first[node] = f;
    for (let q = 0; q < 4; q++) this.split(f + q, depth + 1, tmp);
  }

  /** Index of the closest point within maxDist of (x, y), or -1. */
  nearest(x: number, y: number, maxDist: number): number {
    this.bestD = maxDist * maxDist;
    this.bestI = -1;
    if (this.x0.length) this.nn(0, x, y);
    return this.bestI;
  }

  private nn(node: number, x: number, y: number) {
    if (this.end[node] === this.start[node]) return;
    const dx = Math.max(this.x0[node] - x, 0, x - this.x1[node]);
    const dy = Math.max(this.y0[node] - y, 0, y - this.y1[node]);
    if (dx * dx + dy * dy >= this.bestD) return; // whole branch is farther than the best so far

    const f = this.first[node];
    if (f < 0) {
      for (let i = this.start[node]; i < this.end[node]; i++) {
        const p = this.idx[i];
        const ex = this.pos[p * 2] - x, ey = this.pos[p * 2 + 1] - y;
        const d = ex * ex + ey * ey;
        if (d < this.bestD) { this.bestD = d; this.bestI = p; }
      }
      return;
    }
    const mx = (this.x0[node] + this.x1[node]) / 2;
    const my = (this.y0[node] + this.y1[node]) / 2;
    const q0 = (x >= mx ? 1 : 0) | (y >= my ? 2 : 0); // descend into the point's own quadrant first
    this.nn(f + q0, x, y);
    for (let q = 0; q < 4; q++) if (q !== q0) this.nn(f + q, x, y);
  }

  /** Number of points inside the rectangle. Fully covered branches are counted without visiting points. */
  countInRect(rx0: number, ry0: number, rx1: number, ry1: number): number {
    return this.x0.length ? this.cr(0, rx0, ry0, rx1, ry1) : 0;
  }

  private cr(node: number, rx0: number, ry0: number, rx1: number, ry1: number): number {
    const s = this.start[node], e = this.end[node];
    if (e === s) return 0;
    if (this.x1[node] < rx0 || this.x0[node] > rx1 || this.y1[node] < ry0 || this.y0[node] > ry1) return 0;
    if (this.x0[node] >= rx0 && this.x1[node] <= rx1 && this.y0[node] >= ry0 && this.y1[node] <= ry1) return e - s;
    const f = this.first[node];
    if (f < 0) {
      let c = 0;
      for (let i = s; i < e; i++) {
        const p = this.idx[i];
        const x = this.pos[p * 2], y = this.pos[p * 2 + 1];
        if (x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1) c++;
      }
      return c;
    }
    return this.cr(f, rx0, ry0, rx1, ry1) + this.cr(f + 1, rx0, ry0, rx1, ry1)
      + this.cr(f + 2, rx0, ry0, rx1, ry1) + this.cr(f + 3, rx0, ry0, rx1, ry1);
  }
}
