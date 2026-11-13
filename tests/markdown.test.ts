import assert from "node:assert/strict";
import test from "node:test";
import { prepareMarkdown } from "../lib/markdown";

test("saved LaTeX delimiters become Markdown math without changing existing Markdown", () => {
  assert.equal(prepareMarkdown(String.raw`Una formula \(x^2 + y^2\) e **grassetto**.`), "Una formula $x^2 + y^2$ e **grassetto**.");
  assert.equal(prepareMarkdown(String.raw`\[\frac{1}{n}\sum_i x_i\]`), "\n$$\n\\frac{1}{n}\\sum_i x_i\n$$\n");
  const original = "## Concetto\n\n- Un punto\n- $x^2$\n\n$$\nx+y\n$$";
  assert.equal(prepareMarkdown(original), original);
});

test("literal math syntax stays untouched in inline code and fenced code blocks", () => {
  const code = String.raw`Esempio: \(x\) e ` + "`\\(letterale\\)`";
  assert.equal(prepareMarkdown(code), "Esempio: $x$ e " + "`\\(letterale\\)`");
  for (const fence of ["```", "~~~~"]) {
    const source = `${fence}text\n\\(not math\\)\n\\[not display math\\]\n${fence}\n\nFormula \\(x\\)`;
    assert.equal(prepareMarkdown(source), `${fence}text\n\\(not math\\)\n\\[not display math\\]\n${fence}\n\nFormula $x$`);
  }
  assert.equal(prepareMarkdown("```text\n\\(unfinished fence\\)"), "```text\n\\(unfinished fence\\)");
});


test("LaTeX math fences and standalone undelimited expressions render while existing math stays stable", () => {
  assert.equal(prepareMarkdown("```latex\n\\frac{1}{2}\n```"), "$$\n\\frac{1}{2}\n$$");
  assert.equal(prepareMarkdown(String.raw`\frac{1}{2}`), "\n$$\n\\frac{1}{2}\n$$\n");
  for (const source of [String.raw`$\frac{1}{2}$`, "$$\n\\frac{1}{2}\n$$", "Prezzo: 20 $.", String.raw`La formula usa \frac{a}{b} come rapporto.`]) assert.equal(prepareMarkdown(source), source);
});
