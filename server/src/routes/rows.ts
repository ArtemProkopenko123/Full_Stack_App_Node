import { once } from "node:events";
import { Router } from "express";
import { ROWS_TOTAL, rowsQuerySchema, rowsStreamQuerySchema } from "@app/shared";
import type { Row } from "@app/shared";
import { prisma } from "../prisma";

export const rowsRouter = Router();

/**
 * Fabricates rows [fromId, toId] (1-based, inclusive) inside Postgres.
 *
 * `generate_series` produces the ids and every other column is a pure function
 * of the id, so the same id always yields the same row (stable across requests,
 * which is what pagination needs) and no table / migration / seeding exists.
 * The cost of a query is proportional to the page size, NOT to the offset — a
 * page at row 900,000 is as cheap as a page at row 0.
 *
 * Casts matter: Prisma maps int8/numeric to BigInt/Decimal which JSON cannot
 * serialise, so everything is cast to int4 / float8 (plain JS numbers).
 */
async function fabricateRows(fromId: number, toId: number): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT
      g                                                        AS id,
      'User ' || g                                             AS name,
      'user' || g || '@example.com'                            AS email,
      (((g::bigint * 7919) % 100000) / 100.0)::float8          AS amount,
      (ARRAY['active','pending','suspended','closed'])[(g % 4) + 1] AS status,
      to_char(timestamp '2024-01-01' + g * interval '37 seconds',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"')                    AS "createdAt"
    FROM generate_series(${fromId}::int, ${toId}::int) AS g
    ORDER BY g
  `;
}

// GET /api/rows?offset=0&limit=100 -> { rows, total, offset }
rowsRouter.get("/", async (req, res) => {
  const parsed = rowsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { offset } = parsed.data;
  if (offset >= ROWS_TOTAL) return res.json({ rows: [], total: ROWS_TOTAL, offset });
  // never run past the end of the dataset (last page may be short)
  const limit = Math.min(parsed.data.limit, ROWS_TOTAL - offset);

  const rows = await fabricateRows(offset + 1, offset + limit);
  res.json({ rows, total: ROWS_TOTAL, offset });
});

// GET /api/rows/stream?count=100000 -> application/x-ndjson (one JSON row per line)
//
// Streaming instead of one giant JSON array: the server never holds more than one
// batch in memory and the client can start working on the first rows immediately.
const STREAM_BATCH = 5_000;

rowsRouter.get("/stream", async (req, res) => {
  const parsed = rowsStreamQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { count } = parsed.data;

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-store");

  // If the browser aborts the request (tab closed, AbortController), stop producing.
  let aborted = false;
  res.on("close", () => { aborted = true; });

  try {
    for (let from = 1; from <= count && !aborted; from += STREAM_BATCH) {
      const to = Math.min(from + STREAM_BATCH - 1, count);
      const rows = await fabricateRows(from, to);
      const chunk = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

      // Backpressure: write() returns false when the socket buffer is full.
      // Wait for "drain" so a slow client cannot make us buffer the whole dataset in RAM.
      // Also wake on "close": if the client disconnects mid-wait, "drain" never fires.
      if (!res.write(chunk) && !aborted) await Promise.race([once(res, "drain"), once(res, "close")]);
    }
  } catch (err) {
    console.error(err);
    // Headers are already sent, so we can't switch to a 500. Destroy the socket instead of
    // end(): a clean end would look like a complete (but silently truncated) stream to the client.
    res.destroy(err instanceof Error ? err : new Error(String(err)));
    return;
  }
  res.end();
});
