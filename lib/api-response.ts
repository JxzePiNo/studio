export class ApiResponseError extends Error {
  constructor(message: string, public readonly status: number, public readonly endpoint: string) {
    super(`${message} [HTTP ${status}${endpoint ? ` - ${endpoint}` : ""}]`);
    this.name = "ApiResponseError";
  }
}

/** Hosting errors can be empty or HTML; never expose their body or stack to the UI. */
export async function readApiResponse<T>(response: Response, fallback = "Operazione non riuscita."): Promise<T> {
  let endpoint = "";
  try { endpoint = new URL(response.url).pathname; } catch {}
  const text = await response.text();
  let data: unknown;
  let parsed = false;
  if (text.trim()) {
    try { data = JSON.parse(text); parsed = true; } catch {}
  }
  if (!response.ok) {
    let message = fallback;
    if (response.status === 413) message = "Il file o i dati inviati superano il limite di caricamento del server.";
    else if (response.status === 504 || response.status === 408) message = "La richiesta ha superato il tempo massimo consentito dal server. Riprova.";
    else if (data && typeof data === "object" && "error" in data && typeof data.error === "string") message = data.error;
    else if (response.status >= 500) message = "Il server non ha completato la richiesta. Controlla i log del deployment.";
    throw new ApiResponseError(message, response.status, endpoint);
  }
  if (!parsed) throw new ApiResponseError(text.trim() ? "Il server ha restituito una risposta non valida o incompleta. Riprova." : "Il server ha restituito una risposta vuota. Riprova.", response.status, endpoint);
  return data as T;
}
