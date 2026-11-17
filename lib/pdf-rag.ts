import OpenAI, { toFile } from "openai";
import { setTimeout as delay } from "node:timers/promises";
import { pdfHash } from "./pdf-content";
import { pdfTextIndex, quoteInPdf, searchPdf, type PdfTextIndex, type PdfSearchHit } from "./pdf-search";
import { ragKey, ragRecord, writeRagRecord, savedRagText, saveRagText, withRagLease, type RagRecord } from "./pdf-rag-registry";
import { recordRagStorage } from "./rag-metering";

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: process.env.OPENAI_PROJECT_ID, organization: process.env.OPENAI_ORG_ID, timeout: 60_000, maxRetries: 0 });
const usable = (value: RagRecord) => value.ready && value.fileId && value.vectorStoreId && (value.createdAt || 0) > Date.now() - 29 * 86400_000;
const pending = new Map<string, Promise<{ record: RagRecord; index: PdfTextIndex }>>();
export const ragMarker = (page: number) => `[[PDF_PAGE_${String(page).padStart(6, "0")}]]`;

/** Repeated markers survive OpenAI chunk boundaries; no user metadata is uploaded. */
export function ragText(index: PdfTextIndex) {
  return Object.entries(index.pages).flatMap(([page, text]) => {
    const blocks: string[] = [];
    for (let offset = 0; offset < text.length; offset += 1000) blocks.push(`${ragMarker(Number(page))}\n${text.slice(offset, offset + 1000)}\n`);
    return blocks;
  }).join("\n");
}

async function ensureIndex(bytes: Uint8Array, signal?: AbortSignal) {
  const key = ragKey(pdfHash(bytes));
  let task = pending.get(key);
  if (!task) {
    task = (async () => {
      const stored = await ragRecord(key), text = await savedRagText(key);
      if (usable(stored) && text) return { record: stored, index: text };
      return withRagLease(key, async () => {
        let record = await ragRecord(key);
        const index = await savedRagText(key) || await pdfTextIndex(bytes, signal, true);
        await saveRagText(key, index);
        if (!Object.values(index.pages).some(text => text.trim().length >= 12)) return { record: {}, index };
        if (usable(record)) return { record, index };
        const api = client();
        if (record.createdAt && record.createdAt < Date.now() - 29 * 86400_000) {
          if (record.vectorStoreId) await api.vectorStores.delete(record.vectorStoreId).catch(ignoreMissing);
          if (record.fileId) await api.files.delete(record.fileId).catch(ignoreMissing);
          record = { owner: record.owner, leaseUntil: record.leaseUntil };
        }
        // Checkpoint each provider resource so interrupted requests can resume.
        if (!record.fileId) {
          const file = await api.files.create({ file: await toFile(Buffer.from(ragText(index)), "materiale.txt", { type: "text/plain" }), purpose: "assistants", expires_after: { anchor: "created_at", seconds: 30 * 86400 } }, { signal });
          record = { ...record, fileId: file.id, createdAt: Date.now(), ready: false };
          await writeRagRecord(key, record);
        }
        if (!record.vectorStoreId) {
          const store = await api.vectorStores.create({ name: `pdf-${pdfHash(bytes)}`, file_ids: [record.fileId!], chunking_strategy: { type: "static", static: { max_chunk_size_tokens: 800, chunk_overlap_tokens: 150 } }, expires_after: { anchor: "last_active_at", days: 7 } }, { signal });
          record = { ...record, vectorStoreId: store.id };
          await writeRagRecord(key, record);
        }
        const deadline = Date.now() + 150_000;
        for (;;) {
          const store = await api.vectorStores.retrieve(record.vectorStoreId!, { signal });
          if (store.status === "expired") throw Object.assign(new Error("Indice scaduto."), { status: 404 });
          if (store.file_counts.failed || store.file_counts.cancelled) {
            await api.vectorStores.delete(record.vectorStoreId!).catch(ignoreMissing);
            const failed = record.fileId; record = { owner: record.owner, leaseUntil: record.leaseUntil };
            await writeRagRecord(key, record);
            if (failed) await api.files.delete(failed).catch(ignoreMissing);
            throw Object.assign(new Error("OpenAI non ha potuto indicizzare il PDF. Riprova."), { status: 502 });
          }
          if (store.status === "completed" && store.file_counts.completed === 1) {
            record = { ...record, ready: true, usageBytes: store.usage_bytes };
            await writeRagRecord(key, record);
            console.info("[PDF RAG] Indice pronto", { hash: pdfHash(bytes), pages: index.totalPages, usageBytes: store.usage_bytes });
            return { record, index };
          }
          if (Date.now() > deadline) throw Object.assign(new Error("Il PDF è ancora in indicizzazione. Riprova tra poco: il lavoro verrà ripreso."), { status: 409 });
          await delay(1000, undefined, { signal });
        }
      }, signal);
    })();
    pending.set(key, task);
    void task.finally(() => { if (pending.get(key) === task) pending.delete(key); }).catch(() => {});
  }
  const result = await task; signal?.throwIfAborted(); return result;
}
function ignoreMissing(error: unknown) { if ((error as { status?: number }).status !== 404) throw error; }

/** Treat chunk markers as hints and verify each excerpt against the original page. */
export function verifiedRagHits(index: PdfTextIndex, results: { file_id: string; score: number; content: { type: string; text: string }[] }[], fileId: string, allowedPages?: number[]): PdfSearchHit[] {
  const allowed = allowedPages ? new Set(allowedPages) : undefined;
  const hits: PdfSearchHit[] = [];
  for (const result of results) {
    if (result.file_id !== fileId) continue;
    for (const content of result.content) {
      if (content.type !== "text") continue;
      for (const match of content.text.matchAll(/\[\[PDF_PAGE_(\d{6})\]\]\s*([\s\S]*?)(?=\[\[PDF_PAGE_|$)/g)) {
        const page = Number(match[1]), text = match[2].trim();
        if ((!allowed || allowed.has(page)) && quoteInPdf(index, page, text)) hits.push({ page, text, score: result.score });
      }
    }
  }
  return hits;
}

export async function retrievePdf(bytes: Uint8Array, question: string, allowedPages?: number[], signal?: AbortSignal) {
  const key = ragKey(pdfHash(bytes));
  for (let attempt = 0; ; attempt++) {
    let failedStoreId: string | undefined;
    try {
      const { record, index } = await ensureIndex(bytes, signal);
      if (!record.vectorStoreId) return { index, hits: [] as PdfSearchHit[] };
      failedStoreId = record.vectorStoreId;
      const results = await client().vectorStores.search(record.vectorStoreId, { query: question.slice(0, 4000), rewrite_query: true, max_num_results: 12, ranking_options: { ranker: "auto", score_threshold: 0 } }, { signal });
      await recordRagStorage(key, record.usageBytes || 0);
      const semantic = verifiedRagHits(index, results.data, record.fileId!, allowedPages);
      // Lexical matches preserve exact terms and scoped pages when semantic results differ.
      const lexical = searchPdf(index, question, allowedPages, 4);
      const unique = new Set<string>(); let remaining = 24000;
      const hits = [...semantic, ...lexical].flatMap(hit => {
        const identity = `${hit.page}:${hit.text}`;
        if (unique.has(identity) || remaining <= 0) return [];
        unique.add(identity); const text = hit.text.slice(0, Math.min(4000, remaining)); remaining -= text.length;
        return [{ ...hit, text }];
      }).slice(0, 10);
      return { index, hits };
    } catch (error) {
      if (attempt || (error as { status?: number }).status !== 404) throw error;
      // A provider-expired/deleted store must never turn into a full-PDF fallback.
      await withRagLease(key, async () => {
        const record = await ragRecord(key);
        // Another request may already have rebuilt the failed store while we waited.
        if (failedStoreId && record.vectorStoreId && record.vectorStoreId !== failedStoreId) return;
        if (record.vectorStoreId) await client().vectorStores.delete(record.vectorStoreId).catch(ignoreMissing);
        if (record.fileId) await client().files.delete(record.fileId).catch(ignoreMissing);
        await writeRagRecord(key, { owner: record.owner, leaseUntil: record.leaseUntil });
      }, signal);
    }
  }
}
