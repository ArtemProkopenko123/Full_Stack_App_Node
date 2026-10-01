// Consumes GET /api/rows/stream (NDJSON = one JSON object per line) incrementally.
//
// Compared to `await axios.get(...)` for the whole dataset:
//   * memory stays flat — we parse each line and drop it (here we only count),
//   * the first rows are available after the first network chunk, not after the last,
//   * the UI can show real progress and the user can cancel mid-way (AbortSignal).
//
// axios can't expose the response body as a stream in the browser, so this uses fetch().

import { api } from "./api";

export interface StreamProgress {
  rows: number;
  bytes: number;
  ms: number;
}

export async function streamRows(
  count: number,
  onProgress: (p: StreamProgress) => void,
  signal: AbortSignal,
): Promise<StreamProgress> {
  const t0 = performance.now();
  const res = await fetch(`${api.defaults.baseURL}/api/rows/stream?count=${count}`, { signal });
  if (!res.ok || !res.body) throw new Error(`Stream failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let tail = ""; // a network chunk can end in the middle of a line — keep the unfinished part here
  let rows = 0;
  let bytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;

    // { stream: true } makes the decoder keep partial multi-byte characters between chunks
    const lines = (tail + decoder.decode(value, { stream: true })).split("\n");
    tail = lines.pop() ?? ""; // last element is either "" (chunk ended on \n) or an incomplete line

    for (const line of lines) {
      JSON.parse(line); // a real consumer would push the row somewhere; parsing is the cost we want to show
      rows++;
    }
    onProgress({ rows, bytes, ms: performance.now() - t0 });
  }
  const final = { rows, bytes, ms: performance.now() - t0 };
  onProgress(final);
  return final;
}
