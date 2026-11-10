import type { DocumentSummary } from "./types";

export type MaterialMove = "up" | "down" | "first" | "last" | "name";
export function orderedMaterials(documents: DocumentSummary[], order: string[] = []) {
  const ranks = new Map(order.map((id, i) => [id, i]));
  return [...documents].sort((a,b) => {
    const rankA = ranks.get(a.id), rankB = ranks.get(b.id);
    if (rankA !== undefined || rankB !== undefined) return (rankA ?? Infinity) - (rankB ?? Infinity);
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}
export function moveMaterial(documents: DocumentSummary[], order: string[], id: string | undefined, move: MaterialMove): string[] {
  const sorted = orderedMaterials(documents, order);
  if (move === "name") return sorted.sort((a,b) => a.name.localeCompare(b.name, "it", { numeric: true, sensitivity: "base" })).map(d => d.id);
  const ids = sorted.map(d => d.id);
  const from = ids.indexOf(id || "");
  if (from < 0) throw Object.assign(new Error("Materiale non trovato in questo esame."), { status: 404 });
  const target = move === "first" ? 0 : move === "last" ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, from + (move === "up" ? -1 : 1)));
  ids.splice(from, 1); ids.splice(target, 0, id!);
  return ids;
}
