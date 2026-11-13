import type { DocumentReference, Firestore } from "@google-cloud/firestore";
import type { StudyDocument } from "./types";

export async function personalProgress(db: Firestore, uid: string, ownerId: string, document: StudyDocument): Promise<StudyDocument> {
  const ref = db.collection("users").doc(uid).collection("readingStates").doc(document.id);
  const [summary, pages] = await Promise.all([ref.get(), ref.collection("pages").get()]);
  const reads = new Map(pages.docs.map(doc => [doc.id, doc.get("read") === true]));
  return { ...document, currentPage: summary.get("currentPage") || (uid === ownerId ? document.currentPage : 1), readPages: summary.get("readPages") ?? (uid === ownerId ? (document as StudyDocument & { readPages?: number }).readPages || 0 : 0), slides: Object.fromEntries(Object.entries(document.slides).map(([page, slide]) => [page, { ...slide, read: reads.get(page) ?? (uid === ownerId && !!slide.read) }])) } as StudyDocument;
}
export async function patchPersonalProgress(db: Firestore, uid: string, documentRef: DocumentReference, page: number, read?: boolean) {
  const ref = db.collection("users").doc(uid).collection("readingStates").doc(documentRef.id), pageRef = ref.collection("pages").doc(String(page));
  return db.runTransaction(async tx => {
    const [meta, summary, previous, source] = await Promise.all([tx.get(documentRef), tx.get(ref), tx.get(pageRef), tx.get(documentRef.collection("slides").doc(String(page)))]);
    if (!meta.exists || meta.get("deleting")) throw Object.assign(new Error("Documento non trovato."), { code: "ENOENT" });
    if (page < 1 || page > meta.get("pages")) throw Object.assign(new Error("Pagina non valida."), { status: 400 });
    const owner = documentRef.parent.parent!.id === uid;
    const before = previous.exists ? previous.get("read") === true : owner && source.get("read") === true;
    const count = summary.get("readPages") ?? (owner ? meta.get("readPages") || 0 : 0);
    const readPages = Math.max(0, count + (read === undefined ? 0 : Number(read) - Number(before)));
    tx.set(ref, { currentPage: page, readPages });
    if (read !== undefined) tx.set(pageRef, { read });
    return { ...meta.data(), currentPage: page, readPages, page, ...(read !== undefined ? { slide: { ...(source.data() || { notes: "" }), read } } : {}) };
  });
}
export async function markPersonalRange(db: Firestore, uid: string, documentRef: DocumentReference, pages: number[]) {
  const ref = db.collection("users").doc(uid).collection("readingStates").doc(documentRef.id);
  for (let offset = 0; offset < pages.length; offset += 100) {
    const chunk = pages.slice(offset, offset + 100);
    await db.runTransaction(async tx => {
      const [meta, summary] = await Promise.all([tx.get(documentRef), tx.get(ref)]);
      if (!meta.exists || meta.get("deleting")) throw Object.assign(new Error("Documento non trovato."), { code: "ENOENT" });
      const personal = await tx.getAll(...chunk.map(page => ref.collection("pages").doc(String(page))));
      const source = await tx.getAll(...chunk.map(page => documentRef.collection("slides").doc(String(page))));
      const owner = documentRef.parent.parent!.id === uid;
      let count = summary.get("readPages") ?? (owner ? meta.get("readPages") || 0 : 0);
      for (let index = 0; index < chunk.length; index++) {
        const previous = personal[index].exists ? personal[index].get("read") === true : owner && source[index].get("read") === true;
        if (!previous) count++;
        tx.set(personal[index].ref, { read: true });
      }
      tx.set(ref, { readPages: count, currentPage: summary.get("currentPage") || (owner ? meta.get("currentPage") || 1 : 1) });
    });
  }
}
