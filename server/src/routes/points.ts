import { Router } from "express";
import { pointsBboxQuerySchema } from "@app/shared";
import type { ClusterProperties } from "supercluster";
import { getBinary, getDataset, getIndex, pointDetails } from "../lib/points";

export const pointsRouter = Router();

// Build the dataset + cluster index right after startup instead of during the first
// request (it takes a few seconds and blocks the event loop while it runs).
setImmediate(() => getIndex());

/**
 * GET /api/points/clusters?west&south&east&north&zoom
 *
 * Server-side clustering: the client sends the visible area and zoom, we answer with only
 * what is worth drawing there — clusters at low zoom, individual points when zoomed in.
 * The payload is bounded by what fits on screen, no matter how many points exist.
 *
 * Response: { items: number[] } — flat array, 5 numbers per item (cheaper than objects):
 *   [lng, lat, count, id, category]
 *   count > 0  -> a cluster of `count` points, `id` is the cluster id
 *   count = 0  -> a single point, `id` is the point id, `category` its category index
 */
pointsRouter.get("/clusters", (req, res) => {
  const parsed = pointsBboxQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { west, south, east, north, zoom } = parsed.data;

  // A view that crosses the antimeridian arrives with west > east; just take the full width.
  const bbox: [number, number, number, number] = west <= east ? [west, south, east, north] : [-180, south, 180, north];

  const { categories } = getDataset();
  const items: number[] = [];
  for (const f of getIndex().getClusters(bbox, Math.min(zoom, 16))) {
    const [lng, lat] = f.geometry.coordinates;
    // Supercluster mixes two kinds of features in one array; `cluster: true` tells them apart.
    const p = f.properties as Partial<ClusterProperties> & { id: number };
    if (p.cluster) {
      items.push(lng, lat, p.point_count!, p.cluster_id!, 0);
    } else {
      items.push(lng, lat, 0, p.id, categories[p.id - 1]);
    }
  }
  res.json({ items });
});

/**
 * GET /api/points/binary — ALL points in one binary response (~4.5 MB for 500k).
 * Layout: Float32 [lng, lat] * N, then Uint8 category * N. The client wraps slices of the
 * ArrayBuffer in typed arrays and hands them straight to the GPU: no JSON, no parsing.
 * (Production would add gzip/brotli and an HTTP cache; omitted for clarity.)
 */
pointsRouter.get("/binary", (_req, res) => {
  res.setHeader("Content-Type", "application/octet-stream");
  res.send(getBinary());
});

// GET /api/points/:id — the point's "own data", loaded only when the user clicks it.
// Must stay AFTER the fixed routes above, or ":id" would swallow "clusters" / "binary".
pointsRouter.get("/:id", (req, res) => {
  const details = pointDetails(Number(req.params.id));
  if (!details) return res.status(404).json({ error: "Point not found" });
  res.json(details);
});
