import { ApiResponseError } from "./api-response";

export function createAnalysisCooldown(now = Date.now) {
  let until = 0;
  return {
    pause: (milliseconds: number) => { until = Math.max(until, now() + milliseconds); },
    remaining: () => Math.max(0, until - now()),
  };
}
// Shared by reader and course analyses in this tab; there is no fixed global concurrency cap.
const cooldown = createAnalysisCooldown();

function abortableWait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Retry at the browser boundary so each attempt has its own server time budget.
 * The current page drains on stop, including retries, like an in-flight analysis. */
export async function retryAnalysis<T>(run: () => Promise<T>, options: {
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
} = {}): Promise<T> {
  const wait = options.wait || (milliseconds => abortableWait(milliseconds, options.signal));
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    if (!options.wait) while (cooldown.remaining() > 0) await wait(cooldown.remaining());
    try { return await run(); }
    catch (error) {
      options.signal?.throwIfAborted();
      const transient = error instanceof ApiResponseError
        ? error.retryable !== false && [408, 409, 429, 500, 502, 503, 504].includes(error.status)
        : error instanceof TypeError; // fetch network errors
      if (!transient || attempt >= 2) throw error;
      const delay = Math.max([2000, 5000][attempt], error instanceof ApiResponseError ? error.retryAfterMs ?? 0 : 0)
        + (error instanceof ApiResponseError && error.rateLimited ? Math.floor(Math.random() * 500) : 0);
      if (!options.wait && error instanceof ApiResponseError && error.rateLimited) cooldown.pause(delay);
      await wait(delay);
    }
  }
}
