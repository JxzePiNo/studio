import { randomUUID } from "node:crypto";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import type { SlideData } from "./types";

export async function applyPagePatch(tx: Transaction, r: DocumentReference, page: number, patch: { notes?: string; read?: boolean }) {
  const slideRef = r.collection("slides").doc(String(page));
  const meta = await tx.get(r);
  if (!meta.exists || meta.get("deleting")) throw Object.assign(new Error("Documento non trovato."), { code: "ENOENT" });
  if (page > meta.get("pages")) throw Object.assign(new Error("Pagina non valida."), { status: 400 });
  const changesSlide = patch.notes !== undefined || patch.read !== undefined;
  const previous = changesSlide ? await tx.get(slideRef) : undefined;
  const before = (previous?.data() || { notes: "" }) as SlideData;
  const slide = { ...before, ...patch };
  const changed = changesSlide && JSON.stringify(before) !== JSON.stringify(slide);
  const metadata = { ...meta.data(), ...(changesSlide ? {} : { currentPage: page }) };
  if (changed) {
    Object.assign(metadata, { contentRevision: randomUUID(), readPages: Math.max(0, (meta.get("readPages") || 0) + Number(!!slide.read) - Number(!!before.read)) });
    tx.set(slideRef, slide);
  }
  if (changed || !changesSlide && meta.get("currentPage") !== page) tx.update(r, metadata);
  return { ...metadata, previousContentRevision: meta.get("contentRevision"), page, ...(changesSlide ? { slide } : {}) };
}
