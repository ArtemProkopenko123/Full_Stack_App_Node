import { Router } from "express";
import type { Request, Response } from "express";
import { pointsBboxQuerySchema, pointsDatasetQuerySchema } from "@app/shared";
import type { ClusterProperties } from "supercluster";
import { datasetMeta, getBinary, getIndex, loadDataset } from "../lib/points";
import type { Dataset } from "../lib/points";

export const pointsRouter = Router();

// Warm up the default dataset right after startup (the cluster index takes a few seconds to
// build and blocks the event loop meanwhile). The "sgp" dataset loads on demand instead.
setImmediate(() => void loadDataset("synthetic").then(getIndex));

/**
 * Every route first resolves `?dataset=` (default "synthetic") to a loaded Dataset.
 * For "sgp" the FIRST such request downloads/parses the data and can take a while; later ones
 * are instant. On failure answer 502 (the upstream, not us, is the problem) with a readable error.
 */
async function withDataset(req: Request, res: Response, then: (ds: Dataset) => void | Promise<void>) {
  const parsed = pointsDatasetQuerySchema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
  let ds: Dataset;
  try {
    ds = await loadDataset(parsed.data.dataset);
  } catch (e) {
    console.error(e);
    return void res.status(502).json({ error: `Could not load dataset "${parsed.data.dataset}": ${e instanceof Error ? e.message : e}` });
  }
  await then(ds);
}

// GET /api/points/meta?dataset=sgp -> { dataset, label, source, total, categories }
// Asking for this is how the client says "I'm about to use this dataset, load it".
pointsRouter.get("/meta", (req, res) => withDataset(req, res, (ds) => void res.json(datasetMeta(ds))));

/**
 * GET /api/points/clusters?dataset&west&south&east&north&zoom
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
pointsRouter.get("/clusters", (req, res) =>
  withDataset(req, res, (ds) => {
    const parsed = pointsBboxQuerySchema.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const { west, south, east, north, zoom } = parsed.data;

    // A view that crosses the antimeridian arrives with west > east; just take the full width.
    const bbox: [number, number, number, number] = west <= east ? [west, south, east, north] : [-180, south, 180, north];

    const items: number[] = [];
    for (const f of getIndex(ds).getClusters(bbox, Math.min(zoom, 16))) {
      const [lng, lat] = f.geometry.coordinates;
      // Supercluster mixes two kinds of features in one array; `cluster: true` tells them apart.
      const p = f.properties as Partial<ClusterProperties> & { id: number };
      if (p.cluster) {
        items.push(lng, lat, p.point_count!, p.cluster_id!, 0);
      } else {
        items.push(lng, lat, 0, p.id, ds.categories[p.id - 1]);
      }
    }
    res.json({ items });
  }),
);

/**
 * GET /api/points/binary?dataset — ALL points in one binary response (9 bytes per point).
 * Layout: Float32 [lng, lat] * N, then Uint8 category * N. The client wraps slices of the
 * ArrayBuffer in typed arrays and hands them straight to the GPU: no JSON, no parsing.
 * (Production would add gzip/brotli and an HTTP cache; omitted for clarity.)
 */
pointsRouter.get("/binary", (req, res) =>
  withDataset(req, res, (ds) => {
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(getBinary(ds));
  }),
);

// GET /api/points/:id?dataset — the point's "own data", loaded only when the user clicks it.
// Must stay AFTER the fixed routes above, or ":id" would swallow "clusters" / "binary" / "meta".
pointsRouter.get("/:id", (req, res) =>
  withDataset(req, res, (ds) => {
    const details = ds.details(Number(req.params.id));
    if (!details) return void res.status(404).json({ error: "Point not found" });
    res.json(details);
  }),
);
