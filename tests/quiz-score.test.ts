import assert from "node:assert/strict";
import test from "node:test";
import { quizResult } from "../lib/quiz-score";

test("quiz passes strictly above 60 percent and reports thirtieths", () => {
  assert.deepEqual(quizResult(3, 5), { percentage: 60, grade: 18, passed: false });
  assert.deepEqual(quizResult(4, 5), { percentage: 80, grade: 24, passed: true });
  assert.deepEqual(quizResult(5, 5), { percentage: 100, grade: 30, passed: true });
  assert.deepEqual(quizResult(0, 0), { percentage: null, grade: null, passed: false });
  assert.throws(() => quizResult(3, 2), RangeError);
});
