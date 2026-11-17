import { PDFDocument } from "pdf-lib";

export type RagPageHit = { documentId: string; documentName: string; page: number; text: string; pageText: string; score: number };

/** The pages belonging to the top three chunks, with duplicate pages removed. */
export function topRagPages(hits: RagPageHit[]) {
  const seen = new Set<string>();
  return [...hits].sort((a, b) => b.score - a.score).slice(0, 3).filter(hit => {
    const key = `${hit.documentId}:${hit.page}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export async function ragPageAttachments(pages: RagPageHit[], load: (documentId: string) => Promise<Uint8Array>) {
  const content: { type: "input_file"; filename: string; file_data: string }[] = [];
  const descriptions: string[] = [];
  for (const documentId of new Set(pages.map(page => page.documentId))) {
    const selected = pages.filter(page => page.documentId === documentId);
    const source = await PDFDocument.load(await load(documentId));
    const target = await PDFDocument.create();
    for (const copied of await target.copyPages(source, selected.map(page => page.page - 1))) target.addPage(copied);
    const filename = `pagine-documento-${content.length + 1}.pdf`;
    content.push({ type: "input_file", filename, file_data: `data:application/pdf;base64,${Buffer.from(await target.save()).toString("base64")}` });
    descriptions.push(`Allegato ${filename}, documento ${selected[0].documentName}: ${selected.map((page, index) => `pagina ${index + 1} dell'allegato = pagina FISICA ${page.page} del PDF originale`).join("; ")}.`);
  }
  return { content, manifest: descriptions.join("\n") };
}
