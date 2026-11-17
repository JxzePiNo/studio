import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";
import { checkedMarkdown, MathValidationError, validateLatex } from "../lib/math-validation";
import { validateGeneratedMath } from "../lib/validated-math-output";
import { renderTutorAnswer } from "../lib/tutor-answer";

test("math validation uses the visible parser and rejects broken and untrusted formulas", () => {
  for (const text of [String.raw`Rapporto $\frac{1}{2}$.`, String.raw`Media \(\bar{x}\).`, String.raw`Radice \sqrt{1+\frac{x}{y}}.`, "Prezzo: 20 $.", "`\\unknown{x}`", "```python\npath = r'C:\\files'\n```", String.raw`\begin{align}x&=1\\y&=2\end{align}`]) assert.doesNotThrow(() => checkedMarkdown(text));
  for (const text of [String.raw`$\frac{1}{$`, String.raw`$\unknown{x}$`, String.raw`Formula \(x`, String.raw`Formula \[x`, "$x + y", String.raw`Simbolo \unknown{x}.`, String.raw`$\href{https://example.com}{x}$`]) assert.throws(() => checkedMarkdown(text), MathValidationError, text);
  assert.throws(() => validateLatex(String.raw`\newcommand{\a}{x}\a`), MathValidationError);
});

test("structured answers put yes/no before the explanation and render separate formula segments", () => {
  const segments = [{ kind: "markdown", content: "La relazione è " }, { kind: "inline_math", content: String.raw`E=mc^2` }, { kind: "markdown", content: "." }];
  assert.equal(renderTutorAnswer({ verdict: "yes", segments }), "Sì.\n\nLa relazione è $E=mc^2$.");
  assert.match(renderTutorAnswer({ verdict: "no", segments }), /^No\.\n\n/);
  assert.match(renderTutorAnswer({ verdict: "open", segments }), /^La relazione/);
  assert.match(renderTutorAnswer({ verdict: "uncertain", segments: [{ kind: "markdown", content: "Non determinabile dai dati." }] }), /^Non determinabile/);
  assert.throws(() => renderTutorAnswer({ verdict: "yes", segments: [] }), MathValidationError);
});

const response = (value: unknown) => Response.json({ id: "repair", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }] }] });

test("math repair validates before returning, preserves other fields, and limits retries", async () => {
  let calls = 0;
  const client = new OpenAI({ apiKey: "fake-no-network", maxRetries: 0, fetch: async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    assert.equal(body.text.format.name, "math_repair");
    const fields = JSON.parse(body.input).fields;
    assert.equal(fields.length, calls === 1 ? 2 : 1);
    return response({ fields: fields.map((field: { id: number }) => ({ id: field.id, markdown: calls === 1 && field.id === 1 ? String.raw`$\stillinvalid$` : String.raw`Risulta $\frac{1}{2}$.` })) });
  } });
  const original = { id: "stable", title: "Conserva titolo", question: String.raw`$\bad$`, nested: [String.raw`$\unknown$`], code: "`\\unknown`" };
  const fixed = await validateGeneratedMath(original, client);
  assert.equal(calls, 2);
  assert.equal(fixed.id, original.id);
  assert.equal(fixed.title, original.title);
  assert.equal(fixed.code, original.code);
  assert.equal(fixed.nested[0], String.raw`Risulta $\frac{1}{2}$.`);
  assert.equal(fixed.question, fixed.nested[0]);
  assert.equal(original.question, String.raw`$\bad$`);
  await validateGeneratedMath(fixed, client);
  assert.equal(calls, 2, "valid responses cost no correction call");

  let failures = 0;
  const invalid = new OpenAI({ apiKey: "fake-no-network", maxRetries: 0, fetch: async () => { failures++; return response({ fields: [{ id: 0, markdown: String.raw`$\bad$` }] }); } });
  await assert.rejects(validateGeneratedMath(String.raw`$\bad$`, invalid), MathValidationError);
  assert.equal(failures, 2);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(validateGeneratedMath(String.raw`$\bad$`, invalid, aborted.signal), { name: "AbortError" });
  assert.equal(failures, 2);
});
