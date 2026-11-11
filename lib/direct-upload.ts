import type { StudyDocument } from "./types";

type Request = <T>(url: string, init: RequestInit) => Promise<T>;

/** Only small metadata requests traverse the app server; file bytes go to GCS. */
export async function directUpload(file: File, folderId: string, request: Request, transfer: typeof fetch = fetch): Promise<StudyDocument> {
  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const session = await request<{ uploadId: string; uploadUrl: string; contentType: string }>("/api/documents/upload", json({ action: "start", name: file.name, size: file.size, folderId }));
  // The capability URL authorizes just this new object. Never send the Firebase token.
  const response = await transfer(session.uploadUrl, { method: "PUT", headers: { "Content-Type": session.contentType }, body: file });
  if (!response.ok) throw new Error(`Caricamento del file non riuscito nello storage (HTTP ${response.status}). Riprova.`);
  return request<StudyDocument>("/api/documents/upload", json({ action: "complete", uploadId: session.uploadId }));
}
