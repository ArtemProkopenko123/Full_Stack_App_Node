// In-memory synthetic dataset of geo points + a Supercluster index over it.
//
// Everything here is a pure function of the point id (seeded PRNG), so the same id always
// maps to the same place/category/value across restarts — details can be recomputed on
// demand and nothing needs to be stored besides the compact coordinate arrays.

import Supercluster from "supercluster";
import type { PointFeature } from "supercluster";
import { POINT_CATEGORIES, POINTS_TOTAL } from "@app/shared";
import type { PointDetails } from "@app/shared";

// [lng, lat, spread in degrees, weight] — points are drawn around these "cities"
const CITIES: [number, number, number, number][] = [
  [30.52, 50.45, 0.25, 5], // Kyiv
  [21.01, 52.23, 0.2, 4], // Warsaw
  [13.4, 52.52, 0.25, 5], // Berlin
  [2.35, 48.86, 0.25, 6], // Paris
  [-0.12, 51.51, 0.3, 7], // London
  [-3.7, 40.42, 0.25, 4], // Madrid
  [12.5, 41.9, 0.2, 4], // Rome
  [28.98, 41.01, 0.3, 6], // Istanbul
  [37.62, 55.75, 0.35, 6], // Moscow
  [18.07, 59.33, 0.2, 2], // Stockholm
  [16.37, 48.21, 0.2, 3], // Vienna
  [23.72, 37.98, 0.2, 3], // Athens
  [4.9, 52.37, 0.15, 3], // Amsterdam
  [-6.26, 53.35, 0.15, 2], // Dublin
  [24.1, 56.95, 0.15, 2], // Riga
];

/** mulberry32: tiny seeded PRNG, returns a function giving floats in [0, 1). */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dataset {
  lngLat: Float32Array; // [lng0, lat0, lng1, lat1, ...]  (index i <=> id i + 1)
  categories: Uint8Array; // index into POINT_CATEGORIES
}

let dataset: Dataset | null = null;

export function getDataset(): Dataset {
  if (dataset) return dataset;
  const rand = prng(42);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const totalWeight = CITIES.reduce((s, c) => s + c[3], 0);

  const lngLat = new Float32Array(POINTS_TOTAL * 2);
  const categories = new Uint8Array(POINTS_TOTAL);
  for (let i = 0; i < POINTS_TOTAL; i++) {
    if (rand() < 0.85) {
      // pick a city proportionally to its weight, then scatter around it
      let r = rand() * totalWeight;
      let city = CITIES[0];
      for (const c of CITIES) { if ((r -= c[3]) < 0) { city = c; break; } }
      lngLat[i * 2] = city[0] + gauss() * city[2] * 1.4; // *1.4: degrees of longitude are "shorter" at this latitude
      lngLat[i * 2 + 1] = city[1] + gauss() * city[2];
    } else {
      // 15% uniform noise across the whole region so empty areas aren't empty
      lngLat[i * 2] = -10 + rand() * 50;
      lngLat[i * 2 + 1] = 36 + rand() * 25;
    }
    categories[i] = Math.floor(rand() * POINT_CATEGORIES.length);
  }
  return (dataset = { lngLat, categories });
}

// ---- Supercluster ---------------------------------------------------------------------
// Supercluster builds a hierarchy of clusters, one level per zoom, on top of a KD-tree.
// Building is the expensive part (seconds for 500k points); a query (bbox + zoom) is
// milliseconds. So: build once, lazily, and share the instance between requests.

type Props = { id: number };
let index: Supercluster<Props> | null = null;

export function getIndex(): Supercluster<Props> {
  if (index) return index;
  const t0 = performance.now();
  const { lngLat } = getDataset();
  const features: PointFeature<Props>[] = new Array(POINTS_TOTAL);
  for (let i = 0; i < POINTS_TOTAL; i++) {
    features[i] = {
      type: "Feature",
      properties: { id: i + 1 },
      geometry: { type: "Point", coordinates: [lngLat[i * 2], lngLat[i * 2 + 1]] },
    };
  }
  // radius: clustering distance in px (at 512px tiles); maxZoom: beyond it every point is separate
  index = new Supercluster<Props>({ radius: 60, maxZoom: 16, minPoints: 2 }).load(features);
  console.log(`[points] Supercluster index for ${POINTS_TOTAL} points built in ${(performance.now() - t0).toFixed(0)} ms`);
  return index;
}

/** Packs all points as one binary blob: Float32 [lng,lat]*N followed by Uint8 category*N. */
let binary: Buffer | null = null;
export function getBinary(): Buffer {
  if (binary) return binary;
  const { lngLat, categories } = getDataset();
  binary = Buffer.concat([Buffer.from(lngLat.buffer), Buffer.from(categories.buffer)]);
  return binary;
}

export function pointDetails(id: number): PointDetails | null {
  if (!Number.isInteger(id) || id < 1 || id > POINTS_TOTAL) return null;
  const { lngLat, categories } = getDataset();
  return {
    id,
    name: `Point #${id}`,
    category: POINT_CATEGORIES[categories[id - 1]],
    value: ((id * 7919) % 100000) / 100,
    lng: lngLat[(id - 1) * 2],
    lat: lngLat[(id - 1) * 2 + 1],
  };
}
