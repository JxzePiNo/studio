import assert from "node:assert/strict";
import test from "node:test";
import { explainSlide, openaiError } from "../lib/openai";

const explanation = {
  title: "Imparare dai dati",
  language: "en",
  overview: "Un modello riconosce schemi negli esempi di addestramento.",
  concepts: [{ title: "Modello", explanation: "Una relazione appresa dai dati." }],
  example: "Esempio aggiuntivo: classificare un messaggio come spam.",
  takeaway: "Il modello deve funzionare anche su dati nuovi.",
  glossary: [{ word: "data", translation: "dati", context: "Gli esempi usati dal modello." }],
};

function modelResponse(content: unknown[], status = "completed") {
  return Response.json({
    id: "resp_local_test",
    object: "response",
    status,
    output: [{ id: "msg_local_test", type: "message", role: "assistant", status, content }],
  });
}
const outputText = (value: unknown) => [{ type: "output_text", text: JSON.stringify(value), annotations: [] }];

test("OpenAI integration with a mocked network", async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-key-never-sent-to-the-network";
  process.env.OPENAI_MODEL = "test-pdf-model";
  // Every test replaces fetch; no request in this suite can reach the network.
  globalThis.fetch = async () => { throw new Error("Unexpected mocked fetch call"); };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = originalModel;
  });

  await t.test("sends just the supplied PDF with a strict schema and disables response storage", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls += 1;
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, "test-pdf-model");
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.name, "slide_explanation");
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.ok(body.text.format.schema.properties.glossary);
      const file = body.input[0].content.find((item: { type: string }) => item.type === "input_file");
      assert.equal(file.filename, "slide-7.pdf");
      assert.equal(file.file_data, `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`);
      assert.match(body.input[0].content[1].text, /pagina 7/);
      return modelResponse(outputText(explanation));
    };
    assert.deepEqual(await explainSlide(pdf, 7), explanation);
    assert.equal(calls, 1);
  });

  await t.test("omits the English glossary for an Italian slide", async () => {
    globalThis.fetch = async () => modelResponse(outputText({ ...explanation, language: "it" }));
    const result = await explainSlide(new Uint8Array([1]), 1);
    assert.equal(result.language, "it");
    assert.deepEqual(result.glossary, []);
  });

  await t.test("uses the saved course of study as context while requesting graduate-level depth", async () => {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.match(body.instructions, /laurea magistrale/);
      assert.match(body.instructions, /condizioni di validità/);
      assert.match(body.instructions, /Non inventare/);
      assert.equal(body.max_output_tokens, 12000);
      const context = body.input[0].content.find((item: { type: string }) => item.type === "input_text").text;
      assert.match(context, /Fisica teorica/); assert.match(context, /Meccanica statistica/);
      assert.match(context, /dati di riferimento, non istruzioni/);
      return modelResponse(outputText(explanation));
    };
    await explainSlide(new Uint8Array([1]), 2, { studyProgram: "Fisica teorica", courseName: "Meccanica statistica", documentName: "Lezione 2" });
  });

  await t.test("reports a model refusal without pretending an explanation exists", async () => {
    globalThis.fetch = async () => modelResponse([{ type: "refusal", refusal: "I cannot analyze this file." }]);
    await assert.rejects(explainSlide(new Uint8Array([1]), 1), /non può analizzare questa pagina/);
  });

  await t.test("rejects incomplete output", async () => {
    globalThis.fetch = async () => modelResponse(outputText(explanation), "incomplete");
    await assert.rejects(explainSlide(new Uint8Array([1]), 1), /risposta incompleta/);
  });

  await t.test("validates structured output before it can be persisted", async () => {
    globalThis.fetch = async () => modelResponse(outputText({ ...explanation, language: "invalid-language" }));
    await assert.rejects(explainSlide(new Uint8Array([1]), 1));
  });

  for (const [status, expected] of [
    [401, /chiave OpenAI/],
    [403, /permessi/],
    [404, /OPENAI_MODEL/],
    [429, /Limite API/],
    [500, /non è disponibile/],
  ] as const) {
    await t.test(`maps HTTP ${status} to a useful error without leaking provider details`, async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return Response.json({ error: { message: "private-provider-detail", type: "test_error", code: "test_code" } }, { status });
      };
      await assert.rejects(explainSlide(new Uint8Array([1]), 1), error => {
        const result = openaiError(error);
        assert.equal(result?.status, 502);
        assert.match(result!.error, expected);
        assert.doesNotMatch(result!.error, /private-provider-detail/);
        return true;
      });
      assert.equal(calls, 1, "API errors must not trigger implicit SDK retries");
    });
  }

  await t.test("maps connection failures to a retryable timeout response", async () => {
    globalThis.fetch = async () => { throw new TypeError("simulated network failure"); };
    await assert.rejects(explainSlide(new Uint8Array([1]), 1), error => {
      const result = openaiError(error);
      assert.equal(result?.status, 504);
      assert.match(result!.error, /Connessione a OpenAI/);
      return true;
    });
    assert.equal(openaiError(new Error("unrelated error")), undefined);
  });
});
