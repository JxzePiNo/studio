import type { StudyQuiz } from "./quiz";

export type QuizAttempt = { answers: Record<string, string>; index: number; checked: boolean; finished: boolean; deadline: number | null; remainingMs: number | null; expiredQuestions: number[]; totalExpired: boolean };
export type QuizAttemptAction = { type: "answer"; value: string } | { type: "next" };

function answerIsPresent(quiz: StudyQuiz, state: QuizAttempt) {
  const question = quiz.questions[state.index], value = state.answers[state.index];
  return question?.type === "open" ? !!value?.trim() : question?.options.some((_, index) => value === String(index));
}

export function expireQuizAttempt(quiz: StudyQuiz, state: QuizAttempt, now: number): QuizAttempt {
  if (state.finished || state.checked || !quiz.timing || state.deadline === null || now < state.deadline) return state;
  if (quiz.timing.mode === "total") return { ...state, finished: true, totalExpired: true };
  if (state.checked) return state;
  return { ...state, checked: true, deadline: null, expiredQuestions: [...new Set([...state.expiredQuestions, state.index])] };
}

export function restoreQuizAttempt(quiz: StudyQuiz, saved: unknown, now: number): QuizAttempt {
  const value = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
  const index = typeof value.index === "number" && Number.isInteger(value.index) ? Math.max(0, Math.min(value.index, quiz.questions.length - 1)) : 0;
  const answers: Record<string, string> = {};
  if (value.answers && typeof value.answers === "object" && !Array.isArray(value.answers)) {
    for (const [key, answer] of Object.entries(value.answers)) if (/^\d+$/.test(key) && Number(key) < quiz.questions.length && typeof answer === "string") answers[key] = answer.slice(0, 5000);
  }
  const checked = value.checked === true, finished = value.finished === true || value.revealed === true;
  const sameTimer = value.timerMode === quiz.timing?.mode && value.timerSeconds === quiz.timing?.seconds;
  const savedDeadline = sameTimer && typeof value.deadline === "number" && Number.isFinite(value.deadline) && value.deadline > 0 ? value.deadline : null;
  const savedRemaining = sameTimer && typeof value.remainingMs === "number" && Number.isFinite(value.remainingMs) && value.remainingMs >= 0 ? Math.min(value.remainingMs, (quiz.timing?.seconds || 0) * 1000) : null;
  const remainingMs = quiz.timing?.mode === "total" && checked && !finished ? savedRemaining ?? Math.max(0, (savedDeadline ?? now + quiz.timing.seconds * 1000) - now) : null;
  const deadline = !quiz.timing || finished || checked ? null : savedDeadline ?? now + quiz.timing.seconds * 1000;
  const expiredQuestions = Array.isArray(value.expiredQuestions) ? value.expiredQuestions.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < quiz.questions.length) : [];
  return expireQuizAttempt(quiz, { answers, index, checked, finished, deadline, remainingMs, expiredQuestions, totalExpired: value.totalExpired === true }, now);
}

export function transitionQuizAttempt(quiz: StudyQuiz, previous: QuizAttempt, action: QuizAttemptAction, now: number): QuizAttempt {
  const state = expireQuizAttempt(quiz, previous, now);
  if (state.finished || state !== previous) return state;
  if (action.type === "answer") {
    if (state.checked) return state;
    const question = quiz.questions[state.index];
    if (question?.type !== "open" && !question?.options.some((_, index) => action.value === String(index))) return state;
    return { ...state, answers: { ...state.answers, [state.index]: action.value.slice(0, 5000) } };
  }
  if (!state.checked) return answerIsPresent(quiz, state) ? { ...state, checked: true, remainingMs: quiz.timing?.mode === "total" && state.deadline !== null ? Math.max(0, state.deadline - now) : null, deadline: null } : state;
  if (state.index >= quiz.questions.length - 1) return { ...state, finished: true };
  return { ...state, index: state.index + 1, checked: false, remainingMs: null, deadline: !quiz.timing ? null : now + (quiz.timing.mode === "question" ? quiz.timing.seconds * 1000 : state.remainingMs ?? quiz.timing.seconds * 1000) };
}

export function serializeQuizAttempt(quiz: StudyQuiz, state: QuizAttempt) {
  return JSON.stringify({ ...state, timerMode: quiz.timing?.mode, timerSeconds: quiz.timing?.seconds });
}
