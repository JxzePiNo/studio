"use client";

import { browserAuth, firebaseEnabled } from "./firebase-client";
import { readApiResponse } from "./api-response";
import { studyDay } from "./study-session";
import { MemoryCache } from "./memory-cache";

type Entry = { key: string; value: unknown; etag?: string; at: number; size: number };
const memory = new MemoryCache<Entry>({ maxEntries: 24, maxBytes: 16 * 1024 * 1024, ttlMs: 15 * 60_000 });
const inFlight = new Map<string, Promise<unknown>>();
const epochs = new Map<string, number>();
const MAX_BYTES = 100 * 1024 * 1024;
let database: Promise<IDBDatabase | null> | undefined;
function owner(headers?: HeadersInit) {
  if (!firebaseEnabled) return "local";
  const uid = browserAuth().currentUser?.uid;
  if (!uid) throw new Error("Accedi per caricare i tuoi dati.");
  if (headers) {
    try {
      const token = new Headers(headers).get("Authorization")?.replace(/^Bearer /, "");
      const encoded = token?.split(".")[1];
      const claims = encoded ? JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))) : null;
      if (claims?.sub !== uid) throw new Error();
    } catch { throw new Error("L'account è cambiato. Riapri la schermata."); }
  }
  return uid;
}
function db() {
  return database ||= new Promise(resolve => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open("studio-data-cache-v1", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("entries", { keyPath: "key" }); request.result.createObjectStore("metadata", { keyPath: "key" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
async function get(key: string): Promise<Entry | undefined> {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const database = await db(); if (!database) return;
    return await new Promise(resolve => {
      const request = database.transaction("entries").objectStore("entries").get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(undefined);
    });
  } catch { return; }
}
async function put(entry: Entry, epoch: number) {
  if ((epochs.get(entry.key) || 0) !== epoch || entry.size > MAX_BYTES) return;
  if (!(entry.value instanceof ArrayBuffer)) {
    memory.set(entry.key, entry, entry.size);
  }
  try {
    const database = await db(); if (!database || (epochs.get(entry.key) || 0) !== epoch) return;
    await new Promise<void>(resolve => {
      const transaction = database.transaction(["entries", "metadata"], "readwrite");
      transaction.objectStore("entries").put(entry);
      transaction.objectStore("metadata").put({ key: entry.key, size: entry.size, at: entry.at });
      const request = transaction.objectStore("metadata").getAll();
      request.onsuccess = () => {
        const records = request.result.sort((a, b) => a.at - b.at);
        let bytes = records.reduce((sum, record) => sum + record.size, 0);
        while (records.length > 128 || bytes > MAX_BYTES) {
          const oldest = records.shift()!; bytes -= oldest.size;
          transaction.objectStore("entries").delete(oldest.key); transaction.objectStore("metadata").delete(oldest.key); memory.delete(oldest.key);
        }
      };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve();
    });
  } catch { /* Storage being full or unavailable never prevents studying. */ }
}
async function remove(key: string) {
  epochs.set(key, (epochs.get(key) || 0) + 1); memory.delete(key); inFlight.delete(key);
  try {
    const database = await db(); if (!database) return;
    await new Promise<void>(resolve => {
      const transaction = database.transaction(["entries", "metadata"], "readwrite");
      transaction.objectStore("entries").delete(key); transaction.objectStore("metadata").delete(key);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve();
    });
  } catch { /* Best effort cache eviction. */ }
}
const ttl = (url: string) => /^\/api\/documents\/[^/]+$/.test(url) ? 15_000 : /\/profile$|\/nicknames$/.test(url) ? 5 * 60_000 : 30_000;

export async function invalidateApiCache(...urls: string[]) {
  const uid = owner();
  await Promise.all(urls.flatMap(url => url.endsWith("/quiz") ? [url, `${url}::quiz-index`] : [url]).map(url => remove(`${uid}:${url}`)));
}
async function expire(key: string) {
  epochs.set(key, (epochs.get(key) || 0) + 1); inFlight.delete(key);
  const previous = await get(key);
  if (previous) await put({ ...previous, at: 0 }, epochs.get(key) || 0);
}
export async function trackedFetch(url: string, init: RequestInit): Promise<Response> {
  const uid = owner(init.headers);
  const response = await fetch(url, init);
  const method = init.method?.toUpperCase() || "GET";
  if (response.ok && method !== "GET") {
    const documentId = url.match(/^\/api\/documents\/([^/]+)/)?.[1];
    let patchedDocument = false;
    if (method === "PATCH" && /^\/api\/documents\/[^/]+$/.test(url) && new Headers(init.headers).get("Prefer") === "return=minimal") {
      const previous = await get(`${uid}:${url}`);
      const result = await response.clone().json();
      if (previous && result.previousContentRevision && previous.etag === `"${result.previousContentRevision}"`) {
        const { page, slide, previousContentRevision: _revision, ...metadata } = result;
        const document = previous.value as { slides: Record<string, unknown> };
        const value = { ...document, ...metadata, slides: slide ? { ...document.slides, [page]: slide } : document.slides };
        const epoch = (epochs.get(`${uid}:${url}`) || 0) + 1;
        epochs.set(`${uid}:${url}`, epoch); inFlight.delete(`${uid}:${url}`);
        await put({ ...previous, value, etag: `"${metadata.contentRevision}"`, at: Date.now(), size: new TextEncoder().encode(JSON.stringify(value)).byteLength }, epoch);
        patchedDocument = true;
      }
    }
    const paths = patchedDocument ? [] : [url];
    if (url.startsWith("/api/documents")) paths.push("/api/documents");
    if (url.startsWith("/api/folders")) paths.push("/api/folders", "/api/documents");
    if (documentId) {
      if (!patchedDocument) paths.push(`/api/documents/${documentId}`);
      if (method !== "PATCH" || !/^\/api\/documents\/[^/]+$/.test(url)) paths.push(`/api/documents/${documentId}/quiz`);
    }
    if (method === "DELETE" && documentId && /^\/api\/documents\/[^/]+$/.test(url)) paths.push(`/api/documents/${documentId}/pdf`);
    if (method === "DELETE" && /^\/api\/folders\/[^/]+$/.test(url)) {
      const folderId = url.split("/").at(-1);
      const documents = (await get(`${uid}:/api/documents`))?.value;
      if (Array.isArray(documents)) for (const document of documents) if (document.folderId === folderId) paths.push(`/api/documents/${document.id}`, `/api/documents/${document.id}/pdf`, `/api/documents/${document.id}/quiz`);
    }
    if (url.startsWith("/api/study-sessions") || url.endsWith("/read-range")) paths.push(`/api/study-sessions?day=${studyDay()}`);
    await Promise.all([...new Set(paths.flatMap(path => path.endsWith("/quiz") ? [path, `${path}::quiz-index`] : [path]))].map(path => method === "DELETE" ? remove(`${uid}:${path}`) : expire(`${uid}:${path}`)));
  }
  return response;
}

export async function cachedApi<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = init.method?.toUpperCase() || "GET";
  const uid = owner(init.headers);
  const key = `${uid}:${url}${new Headers(init.headers).get("X-Studio-Quiz-Summaries") === "1" ? "::quiz-index" : ""}`;
  if (method !== "GET") {
    const response = await trackedFetch(url, init);
    const result = await readApiResponse<T>(response);
    return result;
  }
  const cached = await get(key);
  if (cached && Date.now() - cached.at < ttl(url)) return structuredClone(cached.value) as T;
  // Abortable reader requests own their fetch; no consumer can abort another's.
  if (!init.signal && inFlight.has(key)) return structuredClone(await inFlight.get(key)) as T;
  const epoch = epochs.get(key) || 0;
  const operation = (async () => {
    const headers = new Headers(init.headers);
    if (cached?.etag) headers.set("If-None-Match", cached.etag);
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    if (response.status === 304 && cached) {
      const metadata = response.headers.get("X-Studio-Metadata");
      const value = metadata ? { ...(cached.value as object), ...JSON.parse(decodeURIComponent(metadata)) } : cached.value;
      await put({ ...cached, value, at: Date.now() }, epoch);
      return value as T;
    }
    if (response.status === 404) {
      await remove(key);
      if (/^\/api\/documents\/[^/]+$/.test(url)) await remove(`${uid}:${url}/pdf`);
    }
    const value = await readApiResponse<T>(response);
    await put({ key, value, at: Date.now(), etag: response.headers.get("etag") || undefined, size: new TextEncoder().encode(JSON.stringify(value)).byteLength }, epoch);
    return value;
  })();
  if (!init.signal) inFlight.set(key, operation);
  try { return structuredClone(await operation); }
  finally { if (inFlight.get(key) === operation) inFlight.delete(key); }
}

export async function cachedPdf(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Uint8Array> {
  const key = `${owner(headers)}:${url}`;
  const epoch = epochs.get(key) || 0;
  const cached = await get(key);
  signal?.throwIfAborted();
  if (cached && cached.value instanceof ArrayBuffer && Date.now() - cached.at < 7 * 86400_000) return new Uint8Array(cached.value.slice(0));
  const response = await fetch(url, { headers, signal });
  if (!response.ok) { await readApiResponse(response); throw new Error("PDF non disponibile."); }
  const value = await response.arrayBuffer();
  signal?.throwIfAborted();
  await put({ key, value, size: value.byteLength, at: Date.now() }, epoch);
  return new Uint8Array(value.slice(0));
}
