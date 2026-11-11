import { ApiResponseError } from "./api-response";

/** Retry at the browser boundary so each attempt has its own server time budget.
 * The current page drains on stop, including retries, like an in-flight analysis. */
export async function retryAnalysis<T>(run: () => Promise<T>, options: {
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
} = {}): Promise<T> {
  const wait = options.wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try { return await run(); }
    catch (error) {
      options.signal?.throwIfAborted();
      const transient = error instanceof ApiResponseError
        ? error.retryable !== false && [408, 409, 429, 500, 502, 503, 504].includes(error.status)
        : error instanceof TypeError; // fetch network errors
      if (!transient || attempt >= 2) throw error;
      await wait([2000, 5000][attempt]);
    }
  }
}
