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
  for (const source of [String.raw`$\frac{1}{2}$`, "$$\n\\frac{1}{2}\n$$", "Prezzo: 20 $."]) assert.equal(prepareMarkdown(source), source);
  assert.equal(prepareMarkdown(String.raw`La formula usa \frac{a}{b} come rapporto.`), String.raw`La formula usa $\frac{a}{b}$ come rapporto.`);
});

test("normalizes escaped, multiline, compact display and undelimited math", () => {
  assert.equal(prepareMarkdown(String.raw`Formula \\(x^2\\).`), "Formula $x^2$.");
  assert.equal(prepareMarkdown("Formula \\(x +\ny\\)."), "Formula $x + y$.");
  assert.equal(prepareMarkdown("Risulta $$x^2$$ quindi."), "Risulta \n$$\nx^2\n$$\n quindi.");
  assert.equal(prepareMarkdown(String.raw`Parametri \alpha_i e \sqrt{1+\frac{x}{y}}.`), String.raw`Parametri $\alpha_i$ e $\sqrt{1+\frac{x}{y}}$.`);
  assert.equal(prepareMarkdown(String.raw`\begin{align}x&=1\\ y&=2\end{align}`), "\n$$\n" + String.raw`\begin{aligned}x&=1\\ y&=2\end{aligned}` + "\n$$\n");
});
