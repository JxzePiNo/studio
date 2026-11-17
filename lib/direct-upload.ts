import type { StudyDocument } from "./types";
import { fingerprintFile } from "./pdf-fingerprint";

type Request = <T>(url: string, init: RequestInit) => Promise<T>;

/** Only small metadata requests traverse the app server; file bytes go to GCS. */
export async function directUpload(file: File, folderId: string, request: Request, transfer: typeof fetch = fetch, signal?: AbortSignal): Promise<StudyDocument> {
  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const hash = /\.pdf$/i.test(file.name) ? await fingerprintFile(file, "", signal) : undefined;
  type Session = { uploadId: string; uploadUrl: string; contentType: string; nonce?: string };
  const start = (skipReuse = false) => request<Session>("/api/documents/upload", json({ action: "start", name: file.name, size: file.size, folderId, hash, skipReuse }));
  let session = await start();
  if (session.nonce) {
    const proof = await fingerprintFile(file, session.nonce, signal);
    try {
      const document = await request<StudyDocument>("/api/documents/upload", json({ action: "reuse", uploadId: session.uploadId, proof }));
      console.info("[PDF reuse] PDF identico: riutilizzato senza trasferimento", { documentId: document.id });
      return document;
    }
    catch (error) {
      if (signal?.aborted || ![404, 409].includes((error as { status: number }).status)) throw error;
      session = await start(true);
    }
  }
  // The capability URL authorizes just this new object. Never send the Firebase token.
  const response = await transfer(session.uploadUrl, { method: "PUT", headers: { "Content-Type": session.contentType }, body: file, signal });
  if (!response.ok) throw new Error(`Caricamento del file non riuscito nello storage (HTTP ${response.status}). Riprova.`);
  return request<StudyDocument>("/api/documents/upload", json({ action: "complete", uploadId: session.uploadId }));
}
