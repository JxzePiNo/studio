export function uploadTransfer(url: string, { method = "POST", headers, body, signal, onProgress, onSent }: { method?: string; headers?: HeadersInit; body: File | FormData; signal?: AbortSignal | null; onProgress: (fraction: number) => void; onSent: () => void }): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Caricamento annullato.", "AbortError")); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const clean = () => signal?.removeEventListener("abort", abort);
    xhr.open(method, url); xhr.timeout = 15 * 60_000;
    new Headers(headers).forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = event => { if (event.lengthComputable && event.total) onProgress(Math.min(1, event.loaded / event.total)); };
    xhr.upload.onload = () => { onProgress(1); onSent(); };
    xhr.onload = () => { clean(); const response = new Response(xhr.responseText || null, { status: xhr.status, headers: { "Content-Type": xhr.getResponseHeader("Content-Type") || "application/octet-stream" } }); Object.defineProperty(response, "url", { value: xhr.responseURL || url }); resolve(response); };
    xhr.onerror = () => { clean(); reject(new Error("Connessione interrotta durante il caricamento. Riprova.")); };
    xhr.ontimeout = () => { clean(); reject(new Error("Tempo massimo di caricamento superato. Riprova.")); };
    xhr.onabort = () => { clean(); reject(new DOMException("Caricamento annullato.", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true }); xhr.send(body);
  });
}
