import type { Root, Element, Text, RootContent } from "hast";
import type { SelectionNote } from "./selection-notes-context";

/** Annotate text nodes only; code, formulas and existing links stay intact. */
export function annotateTerms(tree: Root, notes: Pick<SelectionNote, "id" | "term">[]) {
  notes = notes.filter(note => note.term.length > 0);
  function visit(parent: Root | Element) {
    if (parent.type === "element" && (["a", "pre", "code", "math", "svg", "button"].includes(parent.tagName) || String(parent.properties.className || "").includes("katex"))) return;
    const children: RootContent[] = [];
    for (const child of parent.children) {
      if (child.type === "element") { visit(child); children.push(child); continue; }
      if (child.type !== "text") { children.push(child); continue; }
      let value = child.value;
      while (value) {
        const match = notes.map(note => ({ note, index: value.indexOf(note.term) })).filter(item => item.index >= 0)
          .sort((a, b) => a.index - b.index || b.note.term.length - a.note.term.length)[0];
        if (!match) { children.push({ type: "text", value } as Text); break; }
        if (match.index) children.push({ type: "text", value: value.slice(0, match.index) });
        children.push({ type: "element", tagName: "span", properties: { "data-note-id": match.note.id }, children: [{ type: "text", value: match.note.term }] });
        value = value.slice(match.index + match.note.term.length);
      }
    }
    parent.children = children;
  }
  visit(tree);
}
