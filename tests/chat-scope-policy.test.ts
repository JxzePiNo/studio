import test from "node:test";
import assert from "node:assert/strict";
import { asksForWholeDocumentSummary, focusedStudyMessage } from "../lib/chat-scope-policy";
import { POST } from "../app/api/documents/[id]/chat/route";

test("whole-document summaries are refused while focused study remains available", () => {
  for (const question of ["Riassumi tutte le 1000 pagine", "Riassumi il PDF", "Fammi una sintesi dell'intero libro", "Una panoramica completa del corso", "Riassumi capitolo per capitolo", "Summarize the entire document"]) {
    assert.equal(asksForWholeDocumentSummary(question), true, question);
  }
  for (const question of ["Cerca nel PDF la definizione di entropia", "Riassumi il capitolo 3", "Riassumi le pagine 20-25", "Spiega tutte le formule di questa pagina", "Riassumi il concetto di entropia nel PDF", "Spiegami questo passaggio"]) {
    assert.equal(asksForWholeDocumentSummary(question), false, question);
  }
});

test("whole-document summary is rejected before reading a PDF or calling the model", async t => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous; });
  const response = await POST(new Request("http://localhost/api/documents/missing/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Riassumi tutte le 1000 pagine", page: 1, scope: "document", pdfOnly: true }),
  }), { params: Promise.resolve({ id: "missing" }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, focusedStudyMessage);
});
