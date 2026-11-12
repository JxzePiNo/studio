import { readDocument, readPdf } from "./store";
import { recordQuestion } from "./question-log";
import { getFolder } from "./folders";
import { getStudyProfile } from "./study-profile";
import { formatStudyContext } from "./tutor-context";
import { generateQuiz } from "./quiz-generation";
import { saveQuiz } from "./quiz-store";
import type { QuizConfig } from "./quiz";

export async function createDocumentQuiz(id: string, config: QuizConfig) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw Object.assign(new Error("Configura OPENAI_API_KEY per generare un quiz."), { status: 503 });
  const [document, bytes, profile] = await Promise.all([readDocument(id), readPdf(id), getStudyProfile()]);
  const folder = await getFolder(document.folderId);
  await recordQuestion(id, document.currentPage || 1, `Quiz: ${config.count} domande. Argomenti: ${config.topics.join(", ") || "intero PDF"}`, "quiz");
  const context = formatStudyContext({ studyProgram: profile.studyProgram, courseName: folder?.name, documentName: document.name });
  const quiz = await generateQuiz(document, bytes, config, context);
  await saveQuiz(id, quiz);
  return quiz;
}
