import type { StudyQuiz } from "./quiz";

/** Shuffle presentation only: saved answers and explanation requests keep original indices. */
export function quizOptionOrder(quiz: StudyQuiz, questionIndex: number): number[] {
  const question = quiz.questions[questionIndex];
  const order = question.options.map((_, index) => index);
  if (question.type !== "multiple-choice") return order;
  let seed = 2166136261;
  for (const char of `${quiz.id}:${questionIndex}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  for (let index = order.length - 1; index > 0; index--) {
    seed += 0x6d2b79f5;
    let value = Math.imul(seed ^ seed >>> 15, seed | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    const target = Math.floor(((value ^ value >>> 14) >>> 0) / 4294967296 * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  return order;
}
