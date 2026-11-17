import { pdfHash } from "./pdf-content";
import { analysisOnlySlide } from "./reusable-analysis";
import type { SlideData } from "./types";

export type PreviousPdf = {
  id: string; pages: number; size: number; contentHash?: string; deleting?: boolean;
  loadBytes: () => Promise<Uint8Array>;
  saveHash: (hash: string) => Promise<unknown>;
  loadSlides: () => Promise<Record<string, SlideData>>;
};

/** Legacy metadata is only a shortlist: full PDF bytes establish identity. */
export async function reusePreviousPdfAnalysis(target: { id: string; hash: string; pages: number; size: number }, candidates: PreviousPdf[], slides: Record<string, SlideData>) {
  for (const candidate of candidates) {
    if (Object.keys(slides).length >= target.pages) break;
    if (candidate.id === target.id || candidate.deleting || candidate.pages !== target.pages || candidate.size !== target.size) continue;
    let hash = candidate.contentHash;
    if (!hash) {
      try { hash = pdfHash(await candidate.loadBytes()); }
      catch (error) {
        if ([404, "404", "ENOENT"].includes((error as { code: string | number }).code)) continue;
        throw error;
      }
      await candidate.saveHash(hash);
    }
    if (hash !== target.hash) continue;
    let reused = 0;
    for (const [page, source] of Object.entries(await candidate.loadSlides())) {
      if (!/^[1-9]\d*$/.test(page) || Number(page) > target.pages || slides[page]?.explanation) continue;
      const clean = analysisOnlySlide(source);
      if (clean) { slides[page] = clean; reused++; }
    }
    console.info("[PDF reuse] PDF precedente identico verificato", { documentId: target.id, sourceDocumentId: candidate.id, hash, reusedPages: reused });
  }
  return slides;
}
