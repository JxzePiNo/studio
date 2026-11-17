import katex from "katex";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import { prepareMarkdown } from "./markdown";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
type Node = { type: string; value?: string; children?: Node[]; position?: { start: { offset?: number }; end: { offset?: number } } };

export class MathValidationError extends Error {
  readonly status = 502;
  readonly retryable = false;
  constructor(public readonly issues: string[]) {
    super("Non riesco a visualizzare correttamente le formule della risposta. Riprova.");
    this.name = "MathValidationError";
  }
}

export function validateLatex(latex: string, displayMode = false) {
  if (!latex.trim() || /(?<!\\)\$/.test(latex)) throw new MathValidationError(["Formula vuota o delimitatori inclusi nel contenuto LaTeX."]);
  if (/\\(?:href|url|html\w*|includegraphics|def|gdef|edef|xdef|newcommand|renewcommand|providecommand|require)\b/.test(latex)) throw new MathValidationError(["Comando LaTeX non consentito nella formula."]);
  try {
    katex.renderToString(latex, { displayMode, throwOnError: true, strict: "ignore", trust: false, maxExpand: 1000 });
  } catch (error) {
    throw new MathValidationError([(error as Error).message.slice(0, 500)]);
  }
}

/** Use the same normalization and math parser as the visible Markdown renderer. */
export function checkedMarkdown(source: string) {
  const normalized = prepareMarkdown(source);
  const issues: string[] = [];
  function visit(node: Node) {
    if (node.type === "inlineMath" || node.type === "math") {
      try { validateLatex(node.value || "", node.type === "math"); }
      catch (error) { issues.push(...(error as MathValidationError).issues); }
      return;
    }
    if (node.type === "code" || node.type === "inlineCode") return;
    if (node.type === "text") {
      // Check the parsed text too: unknown commands and broken delimiters must
      // not silently become literal prose. Dollar amounts remain ordinary text.
      const value = node.value || "";
      const raw = normalized.slice(node.position?.start.offset, node.position?.end.offset);
      if (/\\(?:[a-zA-Z]+|[()[\]])|\$\$|\$(?=[a-zA-Z{\\])/.test(value) || /\\[()[\]]/.test(raw)) issues.push("LaTeX senza delimitatori validi o formula incompleta: " + value.slice(0, 200));
    }
    node.children?.forEach(visit);
  }
  visit(parser.parse(normalized) as Node);
  if (issues.length) throw new MathValidationError(issues.slice(0, 20));
  return normalized;
}
