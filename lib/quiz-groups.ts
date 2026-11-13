import type { Firestore } from "@google-cloud/firestore";
import type { SavedQuizResult, StudyQuiz } from "./quiz";
import { quizGroupId } from "./sharing";

export type QuizPeerResult = { id: string; name: string; university: string; result: SavedQuizResult; self: boolean };
const denied = () => Object.assign(new Error("Completa e salva il quiz prima di vedere i risultati dei compagni."), { status: 403 });
export class QuizGroupService {
  constructor(private db: Firestore, private uid: string) {}
  async groups(documentId: string, quiz: StudyQuiz, sourceOwner: string, folderId?: string) {
    const ids = [...new Set([...(quiz.groupIds || []), ...(quiz.sharedGroupId ? [quiz.sharedGroupId] : [])])];
    const result: { id: string; title: string }[] = [];
    for (const id of ids) {
      const ref = this.db.collection("quizGroups").doc(id);
      const [group, member] = await Promise.all([ref.get(), ref.collection("members").doc(this.uid).get()]);
      if (!group.exists || !member.exists || member.get("documentId") !== documentId || member.get("quizId") !== quiz.id) continue;
      // Imported copies keep their group after the original publication closes.
      result.push({ id, title: group.get("title") || quiz.title });
    }
    if (folderId) {
      const workspace = await this.db.collection("sharedWorkspaces").doc(folderId).get();
      if (workspace.exists && workspace.get("ownerId") === sourceOwner && (workspace.get("members") as string[]).includes(this.uid)) result.push({ id: quizGroupId(`workspace:${folderId}`, documentId, quiz.id), title: "Coautori del corso" });
    }
    return result;
  }
  private async ownResult(documentId: string, quizId: string, legacy?: SavedQuizResult) {
    const own = await this.db.collection("users").doc(this.uid).collection("quizResults").doc(`${documentId}-${quizId}`).get();
    if (!own.exists && !legacy) throw denied();
    return (own.exists ? own.data() : legacy) as SavedQuizResult;
  }
  async leaderboard(documentId: string, quiz: StudyQuiz, groups: { id: string; title: string }[]) {
    await this.ownResult(documentId, quiz.id, quiz.latestResult);
    return Promise.all(groups.map(async group => {
      const snapshot = await this.db.collection("quizGroups").doc(group.id).collection("results").get();
      const people: QuizPeerResult[] = snapshot.docs.map(doc => ({ id: doc.id, name: doc.get("name"), university: doc.get("university") || "", result: doc.get("result") as SavedQuizResult, self: doc.id === this.uid })).sort((a, b) => (b.result.percentage ?? -1) - (a.result.percentage ?? -1) || a.result.completedAt.localeCompare(b.result.completedAt));
      return { ...group, people };
    }));
  }
  async publish(documentId: string, quiz: StudyQuiz, groups: { id: string; title: string }[], includeAnswers: boolean, name: string, university: string) {
    const own = await this.ownResult(documentId, quiz.id, quiz.latestResult);
    const { answers, ...score } = own;
    const result = { ...score, ...(includeAnswers && answers ? { answers } : {}) };
    for (const group of groups) await this.db.collection("quizGroups").doc(group.id).collection("results").doc(this.uid).set({ name, university, result });
    return { ok: true };
  }
  async withdraw(groups: { id: string }[]) {
    await Promise.all(groups.map(group => this.db.collection("quizGroups").doc(group.id).collection("results").doc(this.uid).delete()));
    return { ok: true };
  }
}
