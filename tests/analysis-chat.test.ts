import test from "node:test";
import assert from "node:assert/strict";
import { boundedChatHistory, explanationMessage, withAnalysisMessage } from "../lib/analysis-chat";
import type { ChatMessage, Explanation } from "../lib/types";

const explanation: Explanation = { title: "Generalizzazione", language: "en", overview: "Un modello si applica a dati nuovi.", concepts: [{ title: "Ipotesi", explanation: "La distribuzione deve essere pertinente." }], example: "Un filtro antispam.", takeaway: "La valutazione richiede dati separati.", glossary: [{ word: "data", translation: "dati", context: "Osservazioni." }] };
test("the whole saved explanation becomes one initial assistant message without a new generation", () => {
  const seed = explanationMessage(explanation)!;
  assert.equal(seed.role, "assistant"); assert.equal(seed.source, "analysis");
  for (const text of [explanation.title, explanation.overview, explanation.concepts[0].explanation, explanation.example, explanation.takeaway, "data — dati"]) assert.ok(seed.content.includes(text));
  assert.equal(explanationMessage(undefined), undefined);
});
test("regenerating analysis replaces the first message and keeps the actual conversation", () => {
  const conversation: ChatMessage[] = [{ role: "user", content: "Perché?" }, { role: "assistant", content: "Per via delle ipotesi." }];
  const before = withAnalysisMessage(explanation, conversation);
  const after = withAnalysisMessage({ ...explanation, title: "Nuova analisi" }, before);
  assert.equal(after.length, 3); assert.ok(after[0].content.startsWith("Nuova analisi"));
  assert.deepEqual(after.slice(1), conversation);
  assert.deepEqual(conversation, before.slice(1));
});
test("long conversations are bounded in bytes while retaining the latest question and response", () => {
  const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => [{ role: "user" as const, content: `Domanda ${i}` }, { role: "assistant" as const, content: `${i} ${"spiegazione dettagliata ".repeat(3000)}` }]).flat();
  const result = boundedChatHistory([explanationMessage(explanation)!, ...messages]);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 280000);
  assert.deepEqual(result.slice(-2), messages.slice(-2));
  assert.equal(result.length % 2, 0); assert.equal(result[0].role, "user");
  assert.ok(result.every(message => message.source !== "analysis"));
});
