import assert from "node:assert/strict";
import test from "node:test";
import { mergeAnalysisSlide } from "../lib/merge-analysis-slide";
import type { SlideData } from "../lib/types";

test("late analysis keeps notes, read state and chat changed while the request was running", () => {
  const current: SlideData = { notes: "New note", read: false, chat: [{ role: "user", content: "A new question" }] };
  const response: SlideData = { notes: "Old note", read: true, chat: [], generatedAt: "2026-11-10T12:00:00Z", explanation: { title: "New explanation", overview: "Overview", language: "it", concepts: [], example: "Example", takeaway: "Takeaway", glossary: [] } };
  const merged = mergeAnalysisSlide(current, response);
  assert.equal(merged.notes, "New note");
  assert.equal(merged.read, false);
  assert.deepEqual(merged.chat, current.chat);
  assert.equal(merged.explanation, response.explanation);
  assert.equal(merged.generatedAt, response.generatedAt);
  assert.equal(response.notes, "Old note");
});

test("explicitly cleared notes and chat stay cleared, while an unopened slide uses saved response data", () => {
  const response: SlideData = { notes: "Saved note", chat: [{ role: "assistant", content: "Saved answer" }], read: true };
  assert.deepEqual(mergeAnalysisSlide({ notes: "", chat: [] }, response), { ...response, notes: "", chat: [] });
  assert.deepEqual(mergeAnalysisSlide(undefined, response), response);
});
