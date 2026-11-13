function mathInProse(text: string) {
  const convert = (value: string) => value
    // Convert only unambiguous, standalone LaTeX; leave prose and prices alone.
    .replace(/^([ \t]*)([^\n$]*\\(?:frac|dfrac|tfrac|sqrt|sum|int|prod|begin|lim)\b[^\n$]*)$/gm, (line, _indent, math: string) => {
      if (!/^\s*(?:\\[a-zA-Z]+|[a-zA-Z](?:[_^][^=]*)?\s*=)/.test(math) || /\\[\[\]()]/.test(math) || /[.!?]\s+[A-Z]/.test(math)) return line;
      return `\n$$\n${math.trim()}\n$$\n`;
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math.trim()}$`);
  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(/(`+)([\s\S]*?)\1|\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)(?:\\.|[^$\n])+\$(?!\$)/g)) {
    result += convert(text.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  return result + convert(text.slice(cursor));
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
