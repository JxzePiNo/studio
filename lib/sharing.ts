import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "@google-cloud/firestore";
import { z } from "zod";
import type { ChatMessage, ExamFolder, SlideData, StudyDocument, StudyProfile } from "./types";
import type { StudyQuiz, SavedQuizResult } from "./quiz";
import type { MaterialShare, SharingOverview } from "./sharing-types";
import { normalizeSocial } from "./friends";

const id = z.string().uuid();
const uid = z.string().min(1).max(128).regex(/^[^/]+$/);
export const sharingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), kind: z.enum(["course", "pdf", "quiz"]), sourceId: id, documentId: id.optional(), visibility: z.enum(["public", "direct"]), mode: z.enum(["copy", "coauthor"]), recipientIds: z.array(uid).max(50), includeChat: z.boolean(), includeResults: z.boolean() }).strict(),
  z.object({ action: z.literal("import"), shareId: id }).strict(),
  z.object({ action: z.literal("revoke"), shareId: id }).strict(),
  z.object({ action: z.literal("leave"), folderId: id }).strict(),
  z.object({ action: z.literal("remove-member"), folderId: id, memberId: uid }).strict(),
]);
type Create = Extract<z.infer<typeof sharingActionSchema>, { action: "create" }>;
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
export const quizGroupId = (scope: string, documentId: string, quizId: string) => createHash("sha256").update(JSON.stringify([scope, documentId, quizId])).digest("hex");
export const publicFeedId = (program: string) => createHash("sha256").update(normalizeSocial(program)).digest("hex");
export function sanitizeSharedSlide(slide: SlideData, includeChat: boolean): SlideData {
  const chat = (slide.chat || []).filter(message => includeChat || message.source === "analysis").map(message => {
    const { privateOwnerId: _private, sharedAt: _at, quiz, ...rest } = message;
    if (!quiz) return rest;
    const { latestResult: _result, groupIds: _groups, sharedGroupId: _group, ...cleanQuiz } = quiz;
    return { ...rest, quiz: cleanQuiz };
  });
  return { notes: "", ...(slide.explanation ? { explanation: structuredClone(slide.explanation), ...(slide.generatedAt ? { generatedAt: slide.generatedAt } : {}) } : {}), ...(chat.length ? { chat } : {}) };
}
export function canUseShare(share: MaterialShare, uid: string, profile: StudyProfile) {
  if (!share.active || !share.ready) return false;
  if (share.ownerId === uid) return true;
  if (share.visibility === "direct") return share.recipientIds.includes(uid);
  return share.visibility === "public" && !!profile.studyProgram && normalizeSocial(share.provenance.studyProgram) === normalizeSocial(profile.studyProgram);
}

export class SharingService {
  constructor(private db: Firestore, private uid: string, private profile: StudyProfile, private name: string) {}
  private root() { return this.db.collection("users").doc(this.uid); }
  private shares() { return this.db.collection("sharedMaterials"); }
  private async permitted(shareId: string) {
    const ref = this.shares().doc(shareId), snapshot = await ref.get();
    const share = snapshot.data() as MaterialShare | undefined;
    if (!share || !canUseShare(share, this.uid, this.profile)) throw fail("Condivisione non disponibile.", 404);
    return { ref, share };
  }
  async overview(): Promise<SharingOverview> {
    const [sent, received, published, imports] = await Promise.all([
      this.shares().where("ownerId", "==", this.uid).get(), this.shares().where("recipientIds", "array-contains", this.uid).get(),
      this.db.collection("publicCourseFeeds").doc(publicFeedId(this.profile.studyProgram)).collection("courses").orderBy("createdAt", "desc").limit(30).get(), this.root().collection("materialImports").get(),
    ]);
    const imported = new Map(imports.docs.filter(doc => doc.get("state") === "ready").map(doc => [doc.id, doc.get("folderId") as string]));
    const summary = (doc: typeof sent.docs[number]) => ({ ...doc.data() as MaterialShare, imported: imported.has(doc.id), ...(imported.has(doc.id) ? { folderId: imported.get(doc.id) } : {}) });
    return { available: true, sent: sent.docs.filter(doc => doc.get("ready") && doc.get("active")).map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), received: received.docs.map(summary).filter(share => canUseShare(share, this.uid, this.profile)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), publicCourses: published.docs.map(summary).filter(share => share.visibility === "public" && share.ownerId !== this.uid && canUseShare(share, this.uid, this.profile)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30) };
  }
  async create(input: Create) {
    if (input.mode === "coauthor" && (input.kind !== "course" || input.visibility !== "direct")) throw fail("I coautori possono essere invitati a un corso condiviso con amici.");
    if (input.visibility === "public" && input.kind !== "course") throw fail("Puoi rendere pubblico un corso intero.");
    const recipientIds = [...new Set(input.recipientIds)];
    if (input.visibility === "direct" && (!recipientIds.length || recipientIds.includes(this.uid))) throw fail("Seleziona almeno un amico.");
    const edges = await this.db.collection("friendships").where("members", "array-contains", this.uid).get();
    const friends = new Set(edges.docs.filter(doc => doc.get("status") === "accepted").flatMap(doc => doc.get("members") as string[]));
    if (recipientIds.some(value => !friends.has(value))) throw fail("Puoi condividere direttamente solo con gli amici che hanno accettato la richiesta.", 403);
    const root = this.root();
    let folder: ExamFolder | undefined;
    if (input.kind === "course") {
      const source = await root.collection("folders").doc(input.sourceId).get();
      if (!source.exists) throw fail("Corso non trovato o non sei l’autore.", 404);
      folder = source.data() as ExamFolder;
    }
    const sourceDocs = input.kind === "course" ? (await root.collection("documents").where("folderId", "==", input.sourceId).get()).docs : [await root.collection("documents").doc(input.kind === "quiz" ? input.documentId || "missing" : input.sourceId).get()];
    const documents = sourceDocs.filter(doc => doc.exists && !doc.get("deleting"));
    if (input.mode === "copy" && (!documents.length || documents.length > 50)) throw fail("Condividi una copia con almeno un PDF e al massimo 50 PDF per volta.");
    const first = documents[0]?.data() as StudyDocument | undefined;
    const provenance = folder?.provenance || first?.provenance || { university: "", studyProgram: this.profile.studyProgram, authorName: this.name };
    if (input.visibility === "public" && !provenance.studyProgram) throw fail("Indica il corso di laurea nel profilo prima di pubblicare.");
    const ref = this.shares().doc(randomUUID());
    const share: MaterialShare = { id: ref.id, ownerId: this.uid, ownerName: this.name, kind: input.kind, sourceId: input.sourceId, ...(input.documentId ? { documentId: input.documentId } : {}), title: folder?.name || first?.name || "Corso", provenance, visibility: input.visibility, mode: input.mode, recipientIds: input.visibility === "direct" ? recipientIds : [], includeChat: input.visibility === "direct" && input.includeChat, includeResults: input.visibility === "direct" && input.includeResults, createdAt: new Date().toISOString(), ready: false, active: true, documentCount: documents.length };
    await ref.set({ ...share, studyProgramKey: normalizeSocial(provenance.studyProgram) });
    try {
      if (share.mode === "coauthor") {
        await this.db.runTransaction(async tx => {
          const space = this.db.collection("sharedWorkspaces").doc(input.sourceId);
          const previous = await tx.get(space);
          if (!previous.exists) tx.set(space, { ownerId: this.uid, members: [this.uid], chatSince: {} });
        });
        for (let offset = 0; offset < documents.length; offset += 100) await Promise.all(documents.slice(offset, offset + 100).map(doc => this.db.collection("collaborativeDocuments").doc(doc.id).set({ ownerId: this.uid, folderId: input.sourceId })));
      } else {
        let slideCount = 0;
        for (const source of documents) {
          const metadata = source.data() as StudyDocument;
          const [slides, saved] = await Promise.all([source.ref.collection("slides").get(), source.ref.collection("quizzes").get()]);
          slideCount += slides.size; if (slideCount > 5000) throw fail("Condividi al massimo 5.000 pagine analizzate per volta.");
          const quizzes = new Map<string, StudyQuiz>();
          for (const slide of slides.docs) for (const message of (slide.get("chat") || []) as ChatMessage[]) if (message.quiz) quizzes.set(message.quiz.id, message.quiz);
          for (const quiz of saved.docs) { if (quiz.get("deleted")) quizzes.delete(quiz.id); else quizzes.set(quiz.id, quiz.data() as StudyQuiz); }
          if (share.kind === "quiz" && !quizzes.has(input.sourceId)) throw fail("Quiz non trovato.", 404);
          // Original binaries are immutable. Every imported copy references this
          // one backing object, even if its author later removes the course.
          const blobId = await this.db.runTransaction(async tx => {
            const current = await tx.get(source.ref);
            const existing = current.get("sharedBlobId") as string | undefined;
            if (existing) return existing;
            const id = randomUUID();
            tx.set(this.db.collection("sharedBlobs").doc(id), { path: `${source.ref.path}/original.pdf` });
            tx.update(source.ref, { sharedBlobId: id }); return id;
          });
          const target = ref.collection("documents").doc(source.id);
          const sharedVisuals = { ...metadata.sharedVisuals };
          const cleaned = slides.docs.map(slide => ({ page: slide.id, data: sanitizeSharedSlide(slide.data() as SlideData, share.includeChat) }));
          for (const slide of cleaned) for (const message of slide.data.chat || []) if (message.artifact?.kind === "image") { const asset = message.artifact.image.assetId; sharedVisuals[asset] ||= `${source.ref.path}/visuals/${asset}.png`; }
          await target.set({ id: source.id, name: metadata.name, pages: metadata.pages, size: metadata.size, sharedBlobId: blobId, sharedVisuals, ...(metadata.provenance ? { provenance: metadata.provenance } : {}) });
          for (let offset = 0; offset < cleaned.length; offset += 100) await Promise.all(cleaned.slice(offset, offset + 100).map(slide => target.collection("slides").doc(slide.page).set(slide.data)));
          for (const quiz of quizzes.values()) {
            if (share.kind === "quiz" && quiz.id !== input.sourceId) continue;
            const { latestResult, groupIds: _groups, sharedGroupId: _oldGroup, ...clean } = quiz;
            const groupId = quizGroupId(ref.id, source.id, quiz.id);
            await target.collection("quizzes").doc(quiz.id).set({ ...clean, sharedGroupId: groupId });
            await this.db.collection("quizGroups").doc(groupId).set({ shareId: ref.id, title: quiz.title, ownerId: this.uid });
            await this.db.collection("quizGroups").doc(groupId).collection("members").doc(this.uid).set({ documentId: source.id, quizId: quiz.id });
            const own = await root.collection("quizResults").doc(`${source.id}-${quiz.id}`).get();
            const result = (own.exists ? own.data() : latestResult) as SavedQuizResult | undefined;
            if (share.includeResults && result) await this.db.collection("quizGroups").doc(groupId).collection("results").doc(this.uid).set({ name: this.name, university: this.profile.university || "", result });
            await this.db.runTransaction(async tx => { const current = await tx.get(source.ref.collection("quizzes").doc(quiz.id)); tx.set(source.ref.collection("quizzes").doc(quiz.id), { ...(current.data() || quiz), groupIds: [...new Set([...(current.get("groupIds") || []), groupId])] }); });
            if (share.kind === "quiz") share.title = quiz.title;
          }
        }
        if (folder) await ref.collection("metadata").doc("folder").set({ name: folder.name, color: folder.color || "blue", ...(folder.cfu !== undefined ? { cfu: folder.cfu } : {}), provenance });
      }
      await ref.update({ ready: true, title: share.title });
      if (share.visibility === "public") {
        await this.db.collection("publicCourseFeeds").doc(publicFeedId(provenance.studyProgram)).collection("courses").doc(ref.id).set({ ...share, ready: true });
        const previous = await this.shares().where("ownerId", "==", this.uid).get();
        await Promise.all(previous.docs.filter(doc => doc.id !== ref.id && doc.get("sourceId") === input.sourceId && doc.get("visibility") === "public").map(async doc => { await doc.ref.update({ visibility: "private", active: false }); await this.db.collection("publicCourseFeeds").doc(publicFeedId(doc.get("provenance").studyProgram)).collection("courses").doc(doc.id).delete(); }));
      }
      return { id: ref.id };
    } catch (error) { await ref.update({ active: false, ready: false }).catch(() => {}); throw error; }
  }
  async import(shareId: string) {
    const { ref, share } = await this.permitted(shareId);
    if (share.ownerId === this.uid) throw fail("Il materiale è già nel tuo spazio.");
    const receipt = this.root().collection("materialImports").doc(shareId);
    const folderId = share.mode === "coauthor" ? share.sourceId : randomUUID();
    const lease = randomUUID();
    const existing = await this.db.runTransaction(async tx => {
      const current = await tx.get(receipt);
      if (current.get("state") === "ready") return { folderId: current.get("folderId") as string };
      if (current.get("state") === "copying" && Date.now() - current.get("startedAt") < 300000) throw fail("Il materiale è già in preparazione. Attendi qualche secondo.", 409);
      tx.set(receipt, { state: "copying", folderId, startedAt: Date.now(), lease }); return null;
    });
    if (existing) return existing;
    const created: string[] = [];
    try {
      if (share.mode === "coauthor") {
        await this.db.runTransaction(async tx => {
          const workspace = this.db.collection("sharedWorkspaces").doc(share.sourceId);
          const [space, ownerFolder, currentShare, currentLease] = await Promise.all([tx.get(workspace), tx.get(this.db.collection("users").doc(share.ownerId).collection("folders").doc(share.sourceId)), tx.get(ref), tx.get(receipt)]);
          if (currentLease.get("lease") !== lease) throw fail("L’importazione è stata ripresa da un’altra richiesta. Aggiorna la pagina.", 409);
          if (!ownerFolder.exists || !currentShare.get("active")) throw fail("Il corso non è più disponibile.", 404);
          if ((space.get("members") || []).length >= 100) throw fail("Lo spazio può ospitare fino a 100 coautori.", 409);
          tx.set(workspace, { ownerId: share.ownerId, members: [...new Set([...(space.get("members") || [share.ownerId]), this.uid])], chatSince: { ...(space.get("chatSince") || {}), [this.uid]: share.includeChat ? 0 : Date.now() } });
          tx.set(receipt, { state: "ready", folderId });
        });
      } else {
        const documents = await ref.collection("documents").get();
        for (const doc of documents.docs) {
          const metadata = doc.data() as StudyDocument, newId = randomUUID(), destination = this.root().collection("documents").doc(newId);
          created.push(newId);
          const [slides, quizzes] = await Promise.all([doc.ref.collection("slides").get(), doc.ref.collection("quizzes").get()]);
          const quizIds = new Map(quizzes.docs.map(quiz => [quiz.id, randomUUID()]));
          await destination.set({ ...metadata, id: newId, folderId, createdAt: new Date().toISOString(), currentPage: 1, readPages: 0, analyzedPages: slides.docs.filter(slide => slide.get("explanation")).length, quizIndexVersion: 1, contentRevision: randomUUID(), deleting: true });
          for (let offset = 0; offset < slides.docs.length; offset += 100) await Promise.all(slides.docs.slice(offset, offset + 100).map(slide => {
            const data = slide.data() as SlideData;
            if (data.chat) data.chat = data.chat.map(message => message.quiz && quizIds.has(message.quiz.id) ? { ...message, quiz: { ...message.quiz, id: quizIds.get(message.quiz.id)!, documentId: newId, documentName: metadata.name } } : message.quiz ? { role: message.role, content: message.content } : message);
            return destination.collection("slides").doc(slide.id).set(data);
          }));
          for (const quizDoc of quizzes.docs) {
            const quiz = quizDoc.data() as StudyQuiz, quizId = quizIds.get(quizDoc.id)!;
            await destination.collection("quizzes").doc(quizId).set({ ...quiz, id: quizId, documentId: newId, documentName: metadata.name });
            if (quiz.sharedGroupId) await this.db.collection("quizGroups").doc(quiz.sharedGroupId).collection("members").doc(this.uid).set({ documentId: newId, quizId });
          }
        }
        const meta = (await ref.collection("metadata").doc("folder").get()).data();
        // Check again after copying; a revoked share cannot create a new course.
        await this.db.runTransaction(async tx => {
          const [latest, currentLease] = await Promise.all([tx.get(ref), tx.get(receipt)]);
          if (currentLease.get("lease") !== lease) throw fail("L’importazione è stata ripresa da un’altra richiesta. Aggiorna la pagina.", 409);
          if (!latest.exists || !canUseShare(latest.data() as MaterialShare, this.uid, this.profile)) throw fail("La condivisione non è più disponibile.", 404);
          tx.set(this.root().collection("folders").doc(folderId), { ...(meta || { name: share.title, provenance: share.provenance }), id: folderId, createdAt: new Date().toISOString() });
          for (const documentId of created) tx.update(this.root().collection("documents").doc(documentId), { deleting: false });
          tx.set(receipt, { state: "ready", folderId });
        });
      }
      return { folderId };
    } catch (error) {
      await Promise.all(created.map(documentId => this.db.recursiveDelete(this.root().collection("documents").doc(documentId))));
      await this.db.runTransaction(async tx => { if ((await tx.get(receipt)).get("lease") === lease) tx.delete(receipt); });
      throw error;
    }
  }
  async revoke(shareId: string) {
    const ref = this.shares().doc(shareId), current = await ref.get();
    if (!current.exists || current.get("ownerId") !== this.uid) throw fail("Condivisione non trovata.", 404);
    await ref.update({ active: false, visibility: "private" });
    await this.db.collection("publicCourseFeeds").doc(publicFeedId(current.get("provenance").studyProgram)).collection("courses").doc(shareId).delete();
    return { ok: true };
  }
  async workspace(folderId: string) {
    const space = await this.db.collection("sharedWorkspaces").doc(folderId).get();
    if (!space.exists || !(space.get("members") as string[]).includes(this.uid)) throw fail("Spazio non disponibile.", 404);
    const ownerId = space.get("ownerId") as string;
    const ids = [ownerId, ...(space.get("members") as string[]).filter(id => id !== ownerId)];
    const members = await Promise.all(ids.map(async id => {
      const [social, profile] = await Promise.all([this.db.collection("socialProfiles").doc(id).get(), this.db.collection("users").doc(id).collection("settings").doc("profile").get()]);
      return { id, name: profile.get("displayName") || social.get("name") || "Studente" };
    }));
    return { owner: ownerId === this.uid, members };
  }
  async removeMember(folderId: string, memberId = this.uid) {
    const ref = this.db.collection("sharedWorkspaces").doc(folderId);
    await this.db.runTransaction(async tx => {
      const space = await tx.get(ref);
      if (!space.exists || (memberId !== this.uid && space.get("ownerId") !== this.uid) || space.get("ownerId") === memberId) throw fail("Operazione non consentita.", 403);
      tx.update(ref, { members: (space.get("members") as string[]).filter(id => id !== memberId) });
    });
    const invitations = await this.shares().where("recipientIds", "array-contains", memberId).get();
    for (const invitation of invitations.docs) {
      if (invitation.get("mode") !== "coauthor" || invitation.get("sourceId") !== folderId) continue;
      await this.db.collection("users").doc(memberId).collection("materialImports").doc(invitation.id).delete();
      if (memberId !== this.uid) await invitation.ref.update({ recipientIds: (invitation.get("recipientIds") as string[]).filter(id => id !== memberId) });
    }
    return { ok: true };
  }
}
