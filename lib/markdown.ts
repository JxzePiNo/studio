// Recognize complete commands only; never guess where an arbitrary equation ends.
function bareMath(text: string) {
  const group = String.raw`\{(?:[^{}\n]|\{(?:[^{}\n]|\{[^{}\n]*\})*\})*\}`;
  const command = new RegExp(String.raw`\\(?:[dt]?frac\s*${group}\s*${group}|sqrt(?:\[[^\]\n]+\])?\s*${group}|(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|pi|infty)(?![a-zA-Z]))(?:[_^](?:${group}|[\w]))*`, "g");
  return text.replace(command, math => `$${math}$`);
}

function mathInProse(text: string) {
  const convert = (value: string) => value
    // Some saved responses contain an extra escape on the delimiters.
    .replace(/\\{2}([()[\]])/g, "\\$1")
    // Convert only unambiguous, standalone LaTeX; leave prose and prices alone.
    .replace(/^([ \t]*)([^\n$]*\\(?:frac|dfrac|tfrac|sqrt|sum|int|prod|begin|lim)\b[^\n$]*)$/gm, (line, _indent, math: string) => {
      if (!/^\s*(?:\\[a-zA-Z]+|[a-zA-Z](?:[_^][^=]*)?\s*=)/.test(math) || /\\(?:[\[\]()]|begin|end)/.test(math) || /[.!?]\s+[A-Z]/.test(math)) return line;
      return `\n$$\n${math.trim()}\n$$\n`;
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math.trim().replace(/\s*\n\s*/g, " ")}$`)
    .replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g, (_, environment: string, math: string) => {
      const body = /^(align|gather)/.test(environment) ? `\\begin{${environment.startsWith("align") ? "aligned" : "gathered"}}${math}\\end{${environment.startsWith("align") ? "aligned" : "gathered"}}` : math.trim();
      return `\n$$\n${body}\n$$\n`;
    });
  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(/(`+)([\s\S]*?)\1|\$\$[\s\S]*?\$\$|(?<![\\$])\$(?!\$)(?:\\.|[^$\n])+\$(?!\$)/g)) {
    const token = match[0];
    result += convert(text.slice(cursor, match.index)) + (token.startsWith("$$") && !/^\$\$\n[\s\S]*\n\$\$$/.test(token) ? `\n$$\n${token.slice(2, -2).trim()}\n$$\n` : token);
    cursor = match.index + match[0].length;
  }
  const normalized = result + convert(text.slice(cursor));
  // Protect both existing math and the delimiters introduced above.
  return normalized.split(/(`+[^`]*`+|\$\$[\s\S]*?\$\$|(?<![\\$])\$(?!\$)(?:\\.|[^$\n])+\$(?!\$))/g)
    .map((part, index) => index % 2 ? part : bareMath(part)).join("");
}

/** Accept saved LaTeX delimiters without changing literal code examples. */
export function prepareMarkdown(source: string) {
  source = source.replace(/^ {0,3}(`{3,}|~{3,})(?:latex|tex|math)[ \t]*\n([\s\S]*?)^ {0,3}\1[ \t]*$/gm, (_block, _fence, math: string) => {
    const value = math.trim().replace(/^\$\$\s*|\s*\$\$$/g, "").replace(/^\\\[\s*|\s*\\\]$/g, "");
    return `$$\n${value}\n$$`;
  });
  let result = "";
  let prose = "";
  let fenced = "";
  let fence: { marker: string; length: number } | null = null;
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) || []) {
    if (fence) {
      fenced += line;
      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*(?:\n)?$/);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) {
        result += fenced; fenced = ""; fence = null;
      }
    } else {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (opening) {
        result += mathInProse(prose); prose = "";
        fence = { marker: opening[1][0], length: opening[1].length }; fenced = line;
      } else prose += line;
    }
  }
  return result + (fence ? fenced : mathInProse(prose));
}
