import type { Explanation } from "./types";

export function introductoryPageKind(explanation: Explanation) {
  if (explanation.pageKind) return explanation.pageKind === "content" ? null : explanation.pageKind;
  // Older analyses have no classification: only recognize explicit introductory titles.
  const title = explanation.title.trim();
  if (/^(copertina|cover|frontespizio)(?:\s*[:–—-]|$)/i.test(title)) return "cover";
  if (/^(indice|sommario|table of contents)(?:\s*[:–—-]|$)/i.test(title)) return "index";
  if (/^(solo titolo|pagina titolo|pagina di titolo)(?:\s*[:–—-]|$)/i.test(title)) return "title";
  return null;
}

export const pageKindLabels = { cover: "Copertina", index: "Indice", title: "Solo titolo" };
