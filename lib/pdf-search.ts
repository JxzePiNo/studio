import { MemoryCache } from "./memory-cache";
import { pdfHash } from "./pdf-content";

export type PdfTextIndex = { pages: Record<number, string>; totalPages: number; complete: boolean };
export type PdfSearchHit = { page: number; text: string; score: number };
const cache = new MemoryCache<PdfTextIndex>({ maxEntries: 16, maxBytes: 16 * 1024 * 1024, ttlMs: 15 * 60000 });
const pending = new Map<string, Promise<PdfTextIndex>>();
const normalized = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const stop = new Set("come cosa quale quali quando dove perche perché sono della delle degli dalla dalle dello questo questa questi quello quella dimmi spiega spiegami puoi potrebbe sarebbe che con del dal nel nella negli una uno un il lo la le gli di da a in su per e o si no mi ti the what why how does is are and of to".split(" "));

/** Text only, bounded retained size; originals are authorized before this call. */
export async function pdfTextIndex(bytes: Uint8Array, signal?: AbortSignal, full = false): Promise<PdfTextIndex> {
  signal?.throwIfAborted();
  const key = `${pdfHash(bytes)}:${full ? "full" : "bounded"}`;
  const saved = cache.get(key); if (saved) return saved;
  if (pending.has(key)) { const result = await pending.get(key)!; signal?.throwIfAborted(); return result; }
  const task = (async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
    try {
      const doc = await loading.promise;
      const index: PdfTextIndex = { pages: {}, totalPages: doc.numPages, complete: true };
      let characters = 0;
      for (let page = 1; page <= doc.numPages; page++) {
        if (!full && characters > 2_000_000) { index.complete = false; break; }
        if (characters > 40_000_000) throw Object.assign(new Error("Il testo del PDF supera il limite di indicizzazione. Dividi il materiale in documenti più piccoli."), { status: 400 });
        const source = await doc.getPage(page);
        const content = await source.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
        index.pages[page] = full ? text : text.slice(0, 40000);
        if (!full && text.length > 40000) index.complete = false;
        characters += index.pages[page].length;
        source.cleanup();
      }
      cache.set(key, index, characters * 2 + doc.numPages * 50);
      return index;
    } finally { await loading.destroy(); }
  })();
  pending.set(key, task);
  try { const result = await task; signal?.throwIfAborted(); return result; } finally { pending.delete(key); }
}

export function searchPdf(index: PdfTextIndex, question: string, allowedPages?: number[], limit = 6): PdfSearchHit[] {
  const terms = [...new Set((normalized(question).match(/[\p{L}\p{N}]{2,}/gu) || []).filter(term => !stop.has(term)))];
  if (!terms.length) return [];
  const allowed = allowedPages ? new Set(allowedPages) : undefined;
  return Object.entries(index.pages).flatMap(([number, text]) => {
    const page = Number(number); if (allowed && !allowed.has(page)) return [];
    const lower = normalized(text);
    const matches = terms.filter(term => lower.includes(term));
    if (!matches.length) return [];
    const first = Math.max(0, lower.indexOf(matches[0]) - 600);
    return [{ page, text: text.slice(first, first + 5000), score: matches.length / terms.length }];
  }).sort((a, b) => b.score - a.score || a.page - b.page).slice(0, limit);
}

export function quoteInPdf(index: PdfTextIndex, page: number, quote: string) {
  // Normalize typography and layout, preserving signs, numbers and operators.
  const compact = (text: string) => normalized(text).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2").replace(/\s+/g, " ").trim();
  const fragment = compact(quote);
  return (fragment.match(/[\p{L}\p{N}]/gu) || []).length >= 12 && compact(index.pages[page] || "").includes(fragment);
}
