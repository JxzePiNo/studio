/** Drain in-flight work on stop/error; never leave requests running after return. */
export async function runParallelFiles<T>(items: readonly T[], concurrency: number, run: (item: T, shouldStop: () => boolean) => Promise<void>, stop: () => boolean = () => false) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError("La concorrenza deve essere un intero positivo.");
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const shouldStop = () => failed || stop();
  async function worker() {
    while (!shouldStop() && next < items.length) {
      const item = items[next++];
      try { await run(item, shouldStop); }
      catch (error) { if (!failed) firstError = error; failed = true; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failed) throw firstError;
}

/** Approximate the remaining sequential pages assigned to each parallel worker. */
export function parallelPageRounds(pagesPerFile: readonly number[], concurrency: number) {
  const work = pagesPerFile.filter(pages => pages > 0);
  if (!work.length) return 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, work.length)) }, () => 0);
  for (const pages of work) {
    const next = workers.indexOf(Math.min(...workers));
    workers[next] += pages;
  }
  return Math.max(...workers);
}

/** Four fronts: beginning -> quarter, middle -> left, middle -> right, end -> quarter.
 * Interleaving lets any available worker take the next page without overlaps. */
export function documentPageOrder(pages: number) {
  if (pages > 40) {
    const order: number[] = [];
    for (let offset = 0; offset < 10; offset++) for (let start = 1; start <= pages; start += 10) if (start + offset <= pages) order.push(start + offset);
    return order;
  }
  const quarter = Math.floor(pages / 4), middle = Math.floor(pages / 2), third = Math.floor(pages * 3 / 4);
  const fronts = [
    Array.from({ length: quarter }, (_, i) => i + 1),
    Array.from({ length: middle - quarter }, (_, i) => middle - i),
    Array.from({ length: third - middle }, (_, i) => middle + i + 1),
    Array.from({ length: pages - third }, (_, i) => pages - i),
  ];
  const order: number[] = [];
  for (let step = 0; step < Math.max(...fronts.map(front => front.length)); step++) for (const front of fronts) if (front[step] !== undefined) order.push(front[step]);
  return order;
}

export const pageParallelism = (remaining: number, totalPages = remaining) => Math.min(Math.max(0, remaining), Math.max(4, Math.ceil(totalPages / 10)));
export const documentParallelism = (remaining: readonly number[], totals: readonly number[] = remaining) => remaining.reduce((sum, pages, index) => sum + pageParallelism(pages, totals[index]), 0);
export const parallelDocumentRounds = (remaining: readonly number[], totals: readonly number[] = remaining) => Math.max(0, ...remaining.map((pages, index) => pages > 0 ? Math.ceil(pages / pageParallelism(pages, totals[index])) : 0));

export async function runDocumentPages(pages: readonly number[], run: (page: number) => Promise<void>, stop: () => boolean = () => false, totalPages = Math.max(0, ...pages)) {
  await runParallelFiles(pages, Math.max(1, pageParallelism(pages.length, totalPages)), run, stop);
}
