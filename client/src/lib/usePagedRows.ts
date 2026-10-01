// Lazy, page-based data source for a virtual list.
//
// The list has `total` rows but we only ever hold a small window of them in memory:
//   * rows are fetched in fixed-size PAGES (offset/limit) from the API,
//   * pages are kept in a bounded LRU cache (old pages are evicted),
//   * requests for pages the user has already scrolled away from are aborted.
//
// The hook is deliberately imperative (refs + a "version" counter) instead of
// putting the cache in React state: the cache can hold tens of thousands of rows
// and changes on every response, and we don't want to copy/diff it on each update.
// We only bump `version` to tell React "something in the cache changed, re-render".

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import type { Row } from "@app/shared";
import { api } from "./api";

export const PAGE_SIZE = 100;
// 300 pages * 100 rows = at most 30k rows (~ a few MB) in memory, no matter how far you scroll
const MAX_CACHED_PAGES = 300;

interface PageResponse {
  rows: Row[];
  total: number;
  offset: number;
}

export function usePagedRows(total: number) {
  // pageIndex -> rows. A Map iterates in insertion order, so the first key is the
  // least-recently-used one as long as we re-insert pages whenever we touch them.
  const cache = useRef(new Map<number, Row[]>());
  // pageIndex -> controller of the request currently loading that page
  const inFlight = useRef(new Map<number, AbortController>());

  const [version, setVersion] = useState(0); // bumped when the cache changes -> re-render
  const [lastFetchMs, setLastFetchMs] = useState(0);
  const [pending, setPending] = useState(0); // number of requests in flight (for the stats panel)
  const [error, setError] = useState<string | null>(null);

  /** Row i if its page is loaded, otherwise undefined (the UI renders a skeleton). */
  const getRow = useCallback((i: number): Row | undefined => {
    return cache.current.get(Math.floor(i / PAGE_SIZE))?.[i % PAGE_SIZE];
    // `version` is intentionally not a dependency: callers re-render on it and call getRow again.
  }, []);

  /**
   * Make sure the rows [first, last] are loaded (or loading), plus one page of
   * prefetch on each side so a normal slow scroll never shows a skeleton.
   */
  const ensureRange = useCallback(
    (first: number, last: number) => {
      const lastPage = Math.floor((total - 1) / PAGE_SIZE);
      const from = Math.max(0, Math.floor(first / PAGE_SIZE) - 1);
      const to = Math.min(lastPage, Math.floor(last / PAGE_SIZE) + 1);
      const wanted = new Set<number>();
      for (let p = from; p <= to; p++) wanted.add(p);

      // 1) Cancel requests nobody is waiting for any more (user flung the scrollbar elsewhere).
      for (const [page, ctrl] of inFlight.current) {
        if (!wanted.has(page)) ctrl.abort();
      }

      for (const page of wanted) {
        const cached = cache.current.get(page);
        if (cached) {
          // 2) Touch for LRU: delete + set moves the page to the "most recent" end of the Map.
          cache.current.delete(page);
          cache.current.set(page, cached);
          continue;
        }
        if (inFlight.current.has(page)) continue; // already on its way

        // 3) Fetch the missing page.
        const ctrl = new AbortController();
        inFlight.current.set(page, ctrl);
        setPending(inFlight.current.size);
        const t0 = performance.now();

        api
          .get<PageResponse>("/api/rows", {
            params: { offset: page * PAGE_SIZE, limit: PAGE_SIZE },
            signal: ctrl.signal,
          })
          .then((res) => {
            cache.current.set(page, res.data.rows);
            setLastFetchMs(performance.now() - t0);
            setError(null);

            // 4) Evict the least recently used pages, but never the ones on screen right now.
            for (const key of cache.current.keys()) {
              if (cache.current.size <= MAX_CACHED_PAGES) break;
              if (!wanted.has(key)) cache.current.delete(key);
            }
            setVersion((v) => v + 1);
          })
          .catch((err) => {
            if (axios.isCancel(err)) return; // we aborted it on purpose, not an error
            setError(err instanceof Error ? err.message : "Request failed");
          })
          .finally(() => {
            inFlight.current.delete(page);
            setPending(inFlight.current.size);
          });
      }
    },
    [total],
  );

  // Abort everything when the component using the hook unmounts.
  useEffect(() => {
    const flights = inFlight.current;
    return () => flights.forEach((c) => c.abort());
  }, []);

  return {
    getRow,
    ensureRange,
    version, // read by consumers just to re-render when the cache changes
    stats: { cachedPages: cache.current.size, cachedRows: cache.current.size * PAGE_SIZE, pending, lastFetchMs },
    error,
  };
}
