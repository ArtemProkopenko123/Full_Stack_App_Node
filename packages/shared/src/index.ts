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
