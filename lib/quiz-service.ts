import { readDocument, readPdf } from "./store";
import { listFolders } from "./folders";
import { getStudyProfile } from "./study-profile";
import { formatStudyContext } from "./tutor-context";
import { generateQuiz } from "./quiz-generation";
import { saveQuiz } from "./quiz-store";
import type { QuizConfig } from "./quiz";

export async function createDocumentQuiz(id: string, config: QuizConfig) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw Object.assign(new Error("Configura OPENAI_API_KEY per generare un quiz."), { status: 503 });
  const [document, bytes, profile, folders] = await Promise.all([readDocument(id), readPdf(id), getStudyProfile(), listFolders()]);
  const context = formatStudyContext({ studyProgram: profile.studyProgram, courseName: folders.find(folder => folder.id === document.folderId)?.name, documentName: document.name });
  const quiz = await generateQuiz(document, bytes, config, context);
  await saveQuiz(id, quiz);
  return quiz;
}
