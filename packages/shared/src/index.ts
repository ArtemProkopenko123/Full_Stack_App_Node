import { z } from "zod"

export const noteInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string(),
})

export const noteSchema = noteInputSchema.extend({
  id: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type NoteInput = z.infer<typeof noteInputSchema>
export type Note = z.infer<typeof noteSchema>
export type User = z.infer<typeof userSchema>

// ---------------------------------------------------------------------------
// "Rows" — a synthetic 1M-row dataset used by the Table demo page.
// The rows are not stored anywhere: the server fabricates them on the fly with
// Postgres `generate_series`, so there is nothing to migrate or seed.
// ---------------------------------------------------------------------------

/** Total number of rows the (virtual) dataset contains. */
export const ROWS_TOTAL = 1_000_000

export const rowStatusSchema = z.enum(["active", "pending", "suspended", "closed"])

export const rowSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  amount: z.number(),
  status: rowStatusSchema,
  createdAt: z.string(),
})

/** Query for GET /api/rows — offset/limit pagination (random access, which a virtual scroller needs). */
export const rowsQuerySchema = z.object({
  // `coerce` because query-string values always arrive as strings
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

/** Query for GET /api/rows/stream — how many rows to stream as NDJSON. */
export const rowsStreamQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(ROWS_TOTAL).default(100_000),
})

export type Row = z.infer<typeof rowSchema>
export type RowStatus = z.infer<typeof rowStatusSchema>

// ---------------------------------------------------------------------------
// "Points" — a synthetic set of geo points for the Map demo page.
// ---------------------------------------------------------------------------

/** Datasets the Map page can show. */
export const POINT_DATASETS = ["synthetic", "sgp"] as const
export type PointDatasetId = (typeof POINT_DATASETS)[number]
const datasetField = z.enum(POINT_DATASETS).default("synthetic")

/** Number of points in the synthetic dataset (fabricated in memory by the server). */
export const POINTS_TOTAL = 500_000

/** Category names of the synthetic dataset (the binary endpoint ships the index into this array). */
export const POINT_CATEGORIES = ["cafe", "shop", "school", "park", "office"] as const

/** Which dataset a request is about. */
export const pointsDatasetQuerySchema = z.object({ dataset: datasetField })

/** The part of the map the user currently sees + its zoom level. */
export const pointsBboxQuerySchema = pointsDatasetQuerySchema.extend({
  west: z.coerce.number().min(-180).max(180),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  zoom: z.coerce.number().int().min(0).max(22),
})

/** Describes a loaded dataset (answering this request is what triggers loading it). */
export const pointsMetaSchema = z.object({
  dataset: z.enum(POINT_DATASETS),
  label: z.string(),
  source: z.string(),
  total: z.number(),
  categories: z.array(z.string()), // names, in the order of the category index
})

/** "Own data" of a single point, fetched on demand when the user clicks it. Fields differ per dataset. */
export const pointDetailsSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string(),
  lng: z.number(),
  lat: z.number(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
})

export type PointMeta = z.infer<typeof pointsMetaSchema>
export type PointDetails = z.infer<typeof pointDetailsSchema>
