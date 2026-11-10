export const MAX_PARALLEL_FILES = 6;

/** Drain in-flight work on stop/error; never leave requests running after return. */
export async function runParallelFiles<T>(items: readonly T[], concurrency: number, run: (item: T, shouldStop: () => boolean) => Promise<void>, stop: () => boolean = () => false) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_PARALLEL_FILES) throw new RangeError("Scegli da 1 a 6 file in parallelo.");
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
