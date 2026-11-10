import { MemoryCache } from "./memory-cache";
import type { StudyDocument } from "./types";

// Per-process caches only: persistent storage stays authoritative.
// Callers authenticate/check existence and compare revisions before using data.
export const documentSnapshots = new MemoryCache<{ revision: string; value: StudyDocument }>({
  maxEntries: 128, maxBytes: 16 * 1024 * 1024, ttlMs: 5 * 60 * 1000,
});
export const pdfBytes = new MemoryCache<{ revision: string; value: Buffer }>({
  maxEntries: 16, maxBytes: 64 * 1024 * 1024, ttlMs: 5 * 60 * 1000,
});
export function rememberDocument(key: string, revision: string, value: StudyDocument) {
  documentSnapshots.set(key, { revision, value: structuredClone(value) }, Buffer.byteLength(JSON.stringify(value), "utf8"));
}
