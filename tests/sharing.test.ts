import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SharingService, canUseShare, sanitizeSharedSlide, sharingActionSchema } from "../lib/sharing";
import { resolveDocumentReference, resolveFolderReference } from "../lib/shared-access";
import { patchPersonalProgress, personalProgress, markPersonalRange } from "../lib/shared-progress";
import { sharedChatView } from "../lib/shared-chat";
import { QuizGroupService } from "../lib/quiz-groups";
import type { StudyQuiz } from "../lib/quiz";
import type { StudyDocument, StudyProfile } from "../lib/types";
import { memoryFirestore } from "./helpers/memory-firestore";

const profile: StudyProfile = { displayName: "Alice", university: "Università di Roma", studyProgram: "Informatica", onboardingCompleted: true };
const score = { correct: 1, total: 1, percentage: 100, grade: 30, passed: true, completedAt: "2026-11-12T12:00:00Z", answers: { "0": "1" } };
async function fixture() {
  const db = memoryFirestore(), folderId = randomUUID(), documentId = randomUUID(), quizId = randomUUID();
  const provenance = { university: "Università di Roma", studyProgram: "Informatica", authorName: "Alice" };
  const document: StudyDocument = { id: documentId, folderId, name: "Lezione.pdf", pages: 3, size: 900, createdAt: new Date().toISOString(), currentPage: 2, provenance, slides: {} };
  const quiz: StudyQuiz = { id: quizId, documentId, documentName: document.name, createdAt: new Date().toISOString(), topics: [], title: "Ripasso", questions: [{ type: "multiple-choice", question: "Quanto?", options: ["Uno", "Due", "Tre", "Quattro"], correctIndex: 1, modelAnswer: "", explanation: "Due", topic: "Numeri", page: 1 }], latestResult: score };
  const root = db.collection("users").doc("alice"), ref = root.collection("documents").doc(documentId);
  await root.collection("folders").doc(folderId).set({ id: folderId, name: "Algoritmi", createdAt: new Date().toISOString(), provenance });
  const { slides: _slides, ...metadata } = document; await ref.set({ ...metadata, readPages: 1 });
  await ref.collection("slides").doc("1").set({ notes: "Nota personale", read: true, explanation: { title: "Analisi", language: "it", concepts: [], overview: "Testo", example: "", takeaway: "", glossary: [] }, chat: [{ role: "assistant", content: "Analisi", source: "analysis" }, { role: "user", content: "Domanda privata" }, { role: "assistant", content: "Risposta privata", quiz }] });
  await ref.collection("quizzes").doc(quizId).set(quiz);
  for (const friend of ["bob", "carol"]) await db.collection("friendships").doc(friend).set({ members: ["alice", friend], status: "accepted", requester: "alice" });
  return { db, folderId, documentId, quizId, document, quiz, alice: new SharingService(db, "alice", profile, "Alice"), bob: new SharingService(db, "bob", { ...profile, displayName: "Bob", university: "Milano" }, "Bob"), carol: new SharingService(db, "carol", profile, "Carol") };
}

test("multi-recipient copies preserve provenance, reuse one PDF blob and exclude chat/progress/results by default", async () => {
  const f = await fixture();
  const share = await f.alice.create({ action: "create", kind: "course", sourceId: f.folderId, visibility: "direct", mode: "copy", recipientIds: ["bob", "carol", "bob"], includeChat: false, includeResults: false });
  const data = (await f.db.collection("sharedMaterials").doc(share.id).get()).data()!;
  assert.deepEqual(data.recipientIds, ["bob", "carol"]);
  await assert.rejects(new SharingService(f.db, "outsider", profile, "Eve").import(share.id), { status: 404 });
  const bob = await f.bob.import(share.id), carol = await f.carol.import(share.id);
  const bobDocs = await f.db.collection("users").doc("bob").collection("documents").get(), carolDocs = await f.db.collection("users").doc("carol").collection("documents").get();
  assert.notEqual(bob.folderId, carol.folderId); assert.notEqual(bobDocs.docs[0].id, f.documentId);
  const copy = bobDocs.docs[0]; assert.equal(copy.get("sharedBlobId"), carolDocs.docs[0].get("sharedBlobId")); assert.equal(copy.get("provenance").university, "Università di Roma");
  const source = await f.db.collection("users").doc("alice").collection("documents").doc(f.documentId).get();
  assert.equal(source.get("sharedBlobId"), copy.get("sharedBlobId")); assert.equal(copy.get("readPages"), 0); assert.equal(copy.get("currentPage"), 1);
  const slide = await copy.ref.collection("slides").doc("1").get(); assert.equal(slide.get("notes"), ""); assert.equal(slide.get("read"), undefined); assert.deepEqual(slide.get("chat").map((message: any) => message.content), ["Analisi"]);
  const quiz = (await copy.ref.collection("quizzes").get()).docs[0]; assert.equal(quiz.get("latestResult"), undefined); assert.notEqual(quiz.id, f.quizId);
  assert.equal((await f.bob.import(share.id)).folderId, bob.folderId, "repeated imports are idempotent");
});
test("public courses match the original degree, sanitize chats even if requested and can become private", async () => {
  const f = await fixture();
  const share = await f.alice.create({ action: "create", kind: "course", sourceId: f.folderId, visibility: "public", mode: "copy", recipientIds: [], includeChat: true, includeResults: true });
  const published = (await f.db.collection("sharedMaterials").doc(share.id).get()).data()!;
  assert.equal(published.includeChat, false); assert.equal(published.includeResults, false);
  assert.equal((await f.bob.overview()).publicCourses.length, 1);
  assert.equal(canUseShare(published as any, "other", { ...profile, studyProgram: "Medicina" }), false);
  const bob = await f.bob.import(share.id); await f.alice.revoke(share.id);
  assert.equal((await f.bob.overview()).publicCourses.length, 0);
  await assert.rejects(f.carol.import(share.id), { status: 404 });
  assert.ok((await f.db.collection("users").doc("bob").collection("folders").doc(bob.folderId).get()).exists, "existing personal copy survives privatization");
});
test("coauthors share the same references, gain new files and lose access immediately when removed", async () => {
  const f = await fixture();
  const share = await f.alice.create({ action: "create", kind: "course", sourceId: f.folderId, visibility: "direct", mode: "coauthor", recipientIds: ["bob", "carol"], includeChat: false, includeResults: false });
  await f.bob.import(share.id); await f.carol.import(share.id);
  assert.equal((await resolveDocumentReference(f.db, "bob", f.documentId)).path, `users/alice/documents/${f.documentId}`);
  assert.equal((await resolveFolderReference(f.db, "carol", f.folderId)).path, `users/alice/folders/${f.folderId}`);
  await assert.rejects(resolveDocumentReference(f.db, "eve", f.documentId), { status: 404 });
  const added = randomUUID(); await f.db.collection("users").doc("alice").collection("documents").doc(added).set({ id: added, folderId: f.folderId });
  await f.db.collection("collaborativeDocuments").doc(added).set({ ownerId: "alice", folderId: f.folderId });
  assert.equal((await resolveDocumentReference(f.db, "bob", added)).id, added);
  await assert.rejects(f.bob.removeMember(f.folderId, "carol"), { status: 403 });
  await f.alice.removeMember(f.folderId, "bob");
  await assert.rejects(resolveDocumentReference(f.db, "bob", f.documentId), { status: 404 });
  await assert.rejects(f.bob.import(share.id), { status: 404 });
  assert.equal((await resolveDocumentReference(f.db, "carol", f.documentId)).id, f.documentId);
});
test("an empty course can invite multiple coauthors before its first upload", async () => {
  const f = await fixture(), emptyId = randomUUID();
  await f.db.collection("users").doc("alice").collection("folders").doc(emptyId).set({ id: emptyId, name: "Nuovo corso", createdAt: new Date().toISOString() });
  const share = await f.alice.create({ action: "create", kind: "course", sourceId: emptyId, visibility: "direct", mode: "coauthor", recipientIds: ["bob", "carol"], includeChat: false, includeResults: false });
  assert.equal((await f.bob.import(share.id)).folderId, emptyId);
  assert.equal((await f.carol.import(share.id)).folderId, emptyId);
  assert.equal((await resolveFolderReference(f.db, "bob", emptyId)).parent.parent!.id, "alice");
});
test("reading progress in the same workspace belongs to the student, not to all coauthors", async () => {
  const f = await fixture(); const ref = f.db.collection("users").doc("alice").collection("documents").doc(f.documentId);
  await patchPersonalProgress(f.db, "bob", ref, 1, true);
  await patchPersonalProgress(f.db, "carol", ref, 2, true);
  const input = { ...f.document, readPages: 1, slides: { "1": { notes: "", read: true } } };
  const bob = await personalProgress(f.db, "bob", "alice", input), carol = await personalProgress(f.db, "carol", "alice", input);
  assert.equal(bob.slides[1].read, true); assert.equal(carol.slides[1].read, false); assert.equal(carol.currentPage, 2);
  assert.equal((await ref.get()).get("currentPage"), 2);
  await markPersonalRange(f.db, "bob", ref, [1, 2, 3]);
  await markPersonalRange(f.db, "bob", ref, [1, 2, 3]);
  assert.equal((await f.db.collection("users").doc("bob").collection("readingStates").doc(f.documentId).get()).get("readPages"), 3);
  assert.equal((await f.db.collection("users").doc("carol").collection("readingStates").doc(f.documentId).get()).get("readPages"), 1);
});
test("coauthor chat visibility retains analyses, hides previous conversations and never exposes the author's old quiz result", async () => {
  const f = await fixture();
  const messages = [{ role: "assistant" as const, content: "Analisi", source: "analysis" as const }, { role: "user" as const, content: "Privata" }, { role: "assistant" as const, content: "Nuovo quiz", sharedAt: 200, quiz: f.quiz }];
  const visible = sharedChatView(messages, "bob", "alice", 100);
  assert.deepEqual(visible.map(message => message.content), ["Analisi", "Nuovo quiz"]);
  assert.equal(visible[1].quiz!.latestResult, undefined);
  assert.equal(sharedChatView(messages, "alice", "alice", 0)[2].quiz!.latestResult, score);
});
test("peer quiz scores and personal answers require a saved attempt and authorized group membership", async () => {
  const f = await fixture();
  const share = await f.alice.create({ action: "create", kind: "quiz", sourceId: f.quizId, documentId: f.documentId, visibility: "direct", mode: "copy", recipientIds: ["bob", "carol"], includeChat: false, includeResults: true });
  await f.bob.import(share.id);
  const doc = (await f.db.collection("users").doc("bob").collection("documents").get()).docs[0];
  const quizDoc = (await doc.ref.collection("quizzes").get()).docs[0], quiz = quizDoc.data() as StudyQuiz;
  const service = new QuizGroupService(f.db, "bob"), groups = await service.groups(doc.id, quiz, "bob");
  assert.equal(groups.length, 1);
  await assert.rejects(service.leaderboard(doc.id, quiz, groups), { status: 403 });
  await f.db.collection("users").doc("bob").collection("quizResults").doc(`${doc.id}-${quiz.id}`).set(score);
  const peers = await service.leaderboard(doc.id, quiz, groups); assert.equal(peers[0].people[0].name, "Alice"); assert.deepEqual(peers[0].people[0].result.answers, score.answers);
  await service.publish(doc.id, quiz, groups, false, "Bob", "Milano");
  assert.equal((await service.leaderboard(doc.id, quiz, groups))[0].people.find(person => person.self)!.result.answers, undefined);
  assert.deepEqual(await new QuizGroupService(f.db, "eve").groups(doc.id, quiz, "bob"), []);
});
test("sharing schemas reject arbitrary identities, excessive recipients and invalid modes", async () => {
  const f = await fixture();
  assert.equal(sharingActionSchema.safeParse({ action: "import", shareId: randomUUID(), userId: "other" }).success, false);
  await assert.rejects(f.alice.create({ action: "create", kind: "course", sourceId: f.folderId, visibility: "direct", mode: "copy", recipientIds: ["eve"], includeChat: false, includeResults: false }), { status: 403 });
  await assert.rejects(f.alice.create({ action: "create", kind: "pdf", sourceId: f.documentId, visibility: "public", mode: "coauthor", recipientIds: [], includeChat: false, includeResults: false }), { status: 400 });
  assert.deepEqual(sanitizeSharedSlide({ notes: "Segreto", read: true, chat: [{ role: "user", content: "Privata" }] }, false), { notes: "" });
});
