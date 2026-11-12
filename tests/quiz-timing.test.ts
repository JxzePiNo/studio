import test from "node:test";
import assert from "node:assert/strict";
import { quizConfigSchema, type StudyQuiz } from "../lib/quiz";
import { expireQuizAttempt, restoreQuizAttempt, serializeQuizAttempt, transitionQuizAttempt } from "../lib/quiz-attempt";
import { quizDifficulty } from "../lib/quiz-difficulty";

const question = { type: "multiple-choice" as const, question: "Problema", topic: "Tema", page: 1, options: ["A", "B", "C", "D"], correctIndex: 0, modelAnswer: "", explanation: "Soluzione" };
const base: StudyQuiz = { id: "timed", documentId: "doc", documentName: "Libro.pdf", createdAt: "2026-11-12", title: "Esame", topics: [], questions: [question, question] };

test("advanced is the default and STEM cannot be downgraded; timers are validated", () => {
  const config = quizConfigSchema.parse({ count: 2, openCount: 0, trueFalseCount: 0, topics: [] });
  assert.equal(config.difficulty, "avanzata");
  assert.equal(quizDifficulty({ ...config, difficulty: "base" }, "Ingegneria informatica, algoritmi"), "avanzata");
  assert.equal(quizDifficulty({ ...config, difficulty: "base" }, "Laurea in lettere"), "base");
  for (const seconds of [0, -1, 1.5, 86401]) assert.equal(quizConfigSchema.safeParse({ ...config, timing: { mode: "question", seconds } }).success, false);
  assert.equal(quizConfigSchema.safeParse({ ...config, timing: { mode: "total", seconds: 600 } }).success, true);
});

test("question timers pause on feedback, restart on the next question and auto-confirm on expiry", () => {
  const quiz = { ...base, timing: { mode: "question" as const, seconds: 60 } };
  let state = restoreQuizAttempt(quiz, null, 1000);
  assert.equal(state.deadline, 61000);
  state = transitionQuizAttempt(quiz, state, { type: "answer", value: "0" }, 2000);
  state = transitionQuizAttempt(quiz, state, { type: "next" }, 3000);
  assert.equal(state.checked, true); assert.equal(state.deadline, null);
  assert.equal(expireQuizAttempt(quiz, state, 600000), state);
  state = transitionQuizAttempt(quiz, state, { type: "next" }, 600000);
  assert.equal(state.index, 1); assert.equal(state.deadline, 660000);
  state = expireQuizAttempt(quiz, state, 660000);
  assert.equal(state.checked, true); assert.deepEqual(state.expiredQuestions, [1]);
  assert.equal(state.answers[1], undefined);
  state = transitionQuizAttempt(quiz, state, { type: "answer", value: "0" }, 660001);
  assert.equal(state.answers[1], undefined, "late answers are rejected");
  state = transitionQuizAttempt(quiz, state, { type: "next" }, 660002);
  assert.equal(state.finished, true, "an unanswered expired question does not trap the player");
});

test("total timers count feedback time and expired attempts finish after reopening", () => {
  const quiz = { ...base, timing: { mode: "total" as const, seconds: 120 } };
  let state = restoreQuizAttempt(quiz, null, 1000);
  state = transitionQuizAttempt(quiz, state, { type: "answer", value: "0" }, 2000);
  state = transitionQuizAttempt(quiz, state, { type: "next" }, 3000);
  assert.equal(state.deadline, 121000);
  const saved = JSON.parse(serializeQuizAttempt(quiz, state));
  const restored = restoreQuizAttempt(quiz, saved, 100000);
  assert.equal(restored.deadline, 121000, "reload does not reset the timer");
  state = restoreQuizAttempt(quiz, saved, 121000);
  assert.equal(state.finished, true); assert.equal(state.totalExpired, true);
  assert.equal(state.answers[0], "0");
});

test("question deadlines survive reload and untimed legacy quizzes remain untimed", () => {
  const quiz = { ...base, timing: { mode: "question" as const, seconds: 60 } };
  let state = restoreQuizAttempt(quiz, null, 1000);
  state = restoreQuizAttempt(quiz, JSON.parse(serializeQuizAttempt(quiz, state)), 62000);
  assert.equal(state.checked, true); assert.deepEqual(state.expiredQuestions, [0]);
  const legacy = restoreQuizAttempt(base, { answers: { 0: "1" }, index: 0, checked: true }, 1000000);
  assert.equal(legacy.deadline, null); assert.equal(legacy.answers[0], "1");
  assert.equal(expireQuizAttempt(base, legacy, 2000000), legacy);
});
