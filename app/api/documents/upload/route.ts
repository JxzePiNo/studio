import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userRoot } from "@/lib/firebase-server";
import { listFolders } from "@/lib/folders";
import { MAX_UPLOAD_BYTES, uploadFormat } from "@/lib/upload-formats";
import { prepareUpload } from "@/lib/prepare-upload";
import { createDocument, readDocument } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
const start = z.object({ action: z.literal("start"), name: z.string().min(1).max(255), size: z.number().int().positive().max(MAX_UPLOAD_BYTES), folderId: z.string().min(1).max(100) });
const complete = z.object({ action: z.literal("complete"), uploadId: z.string().uuid() });

export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "Usa il caricamento locale per questo ambiente." }, { status: 400 });
    const parsed = z.union([start, complete]).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Caricamento non valido. Limite: 500 MB per file." }, { status: 400 });
    const root = await userRoot();
    const { bucket, db } = services();
    if (parsed.data.action === "start") {
      const { name, size, folderId } = parsed.data;
      const format = uploadFormat(name);
      if (!format) return NextResponse.json({ error: "Scegli un PDF o un'immagine PNG o JPEG." }, { status: 400 });
      if (!(await listFolders()).some(folder => folder.id === folderId)) return NextResponse.json({ error: "Esame non trovato." }, { status: 400 });
      const uploadId = randomUUID();
      const file = bucket.file(`${root.path}/uploads/${uploadId}/source`);
      const contentType = format === "pdf" ? "application/pdf" : format === "png" ? "image/png" : "image/jpeg";
      // JSON API resumable sessions carry the initiating origin to browser PUTs.
      const [uploadUrl] = await file.createResumableUpload({
        origin: request.headers.get("origin") || new URL(request.url).origin,
        metadata: { contentType, contentLength: size },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      await root.collection("uploads").doc(uploadId).set({ name, size, folderId, createdAt: Date.now(), state: "pending" });
      return NextResponse.json({ uploadId, uploadUrl, contentType }, { headers: { "Cache-Control": "no-store" } });
    }
    const { uploadId } = parsed.data;
    const ref = root.collection("uploads").doc(uploadId);
    const lease = randomUUID();
    const metadata = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("Caricamento non trovato."), { status: 404 });
      const data = snapshot.data()!;
      if (data.state === "completed") return data;
      if (Date.now() - data.createdAt > 24 * 60 * 60 * 1000) throw Object.assign(new Error("Caricamento scaduto. Seleziona nuovamente il file."), { status: 400 });
      if (data.state === "processing" && Date.now() - data.processingAt < 5 * 60 * 1000) throw Object.assign(new Error("Caricamento in elaborazione. Attendi qualche secondo."), { status: 409 });
      tx.update(ref, { state: "processing", processingAt: Date.now(), lease });
      return data;
    });
    if (metadata.state === "completed") return NextResponse.json(await readDocument(uploadId));
    const file = bucket.file(`${root.path}/uploads/${uploadId}/source`);
    try {
      // A previous completion may have persisted the document before losing its response.
      let result;
      try { result = await readDocument(uploadId); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!result) {
        const [stored] = await file.getMetadata();
        if (Number(stored.size) !== metadata.size || Number(stored.size) > MAX_UPLOAD_BYTES) throw Object.assign(new Error("La dimensione del file caricato non corrisponde a quella prevista."), { status: 400 });
        if (!(await listFolders()).some(folder => folder.id === metadata.folderId)) throw Object.assign(new Error("Esame non trovato."), { status: 400 });
        const [input] = await file.download();
        const prepared = await prepareUpload(metadata.name, input);
        result = await createDocument(prepared.name, prepared.bytes, prepared.pages, metadata.folderId, uploadId);
      }
      await ref.update({ state: "completed" });
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.get("lease") === lease) tx.update(ref, { state: "pending" });
      }).catch(() => {});
      throw error;
    }
  } catch (error) { return apiError(error); }
}
