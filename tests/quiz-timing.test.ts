import test from "node:test";
import assert from "node:assert/strict";
import { quizConfigSchema, type StudyQuiz } from "../lib/quiz";
import { expireQuizAttempt, restoreQuizAttempt, serializeQuizAttempt, transitionQuizAttempt } from "../lib/quiz-attempt";
import { quizDifficulty } from "../lib/quiz-difficulty";
import { quizOptionOrder } from "../lib/quiz-options";

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

test("total timers pause throughout feedback and reload, resume their remainder and expire during questions", () => {
  const quiz = { ...base, timing: { mode: "total" as const, seconds: 120 } };
  let state = restoreQuizAttempt(quiz, null, 1000);
  state = transitionQuizAttempt(quiz, state, { type: "answer", value: "0" }, 2000);
  state = transitionQuizAttempt(quiz, state, { type: "next" }, 3000);
  assert.equal(state.deadline, null);
  assert.equal(state.remainingMs, 118000);
  assert.equal(expireQuizAttempt(quiz, state, 600000), state);
  const saved = JSON.parse(serializeQuizAttempt(quiz, state));
  const restored = restoreQuizAttempt(quiz, saved, 100000);
  assert.equal(restored.deadline, null);
  assert.equal(restored.remainingMs, 118000, "reload while reading feedback preserves the remaining time");
  state = transitionQuizAttempt(quiz, restored, { type: "next" }, 200000);
  assert.equal(state.deadline, 318000);
  const activeSaved = JSON.parse(serializeQuizAttempt(quiz, state));
  state = restoreQuizAttempt(quiz, activeSaved, 318000);
  assert.equal(state.finished, true); assert.equal(state.totalExpired, true);
  assert.equal(state.answers[0], "0");
});

test("option shuffling is stable across reopening, varies the correct position and preserves original answer indices", () => {
  const firstPositions = new Set<number>();
  for (let index = 0; index < 100; index++) {
    const quiz = { ...base, id: `quiz-${index}` };
    const order = quizOptionOrder(quiz, 0);
    assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
    assert.deepEqual(quizOptionOrder(structuredClone(quiz), 0), order);
    firstPositions.add(order.indexOf(question.correctIndex));
    assert.equal(quiz.questions[0].options[order[order.indexOf(question.correctIndex)]], "A");
  }
  assert.equal(firstPositions.size, 4, "correct answers appear in all four visual positions");
  assert.deepEqual(quizOptionOrder({ ...base, questions: [{ ...question, type: "true-false", options: ["Vero", "Falso"] }] }, 0), [0, 1]);
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
