import { z } from "zod";

const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9-]+$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const artifactKindSchema = z.enum(["map", "image", "diagram"]);
const textFields = { title: z.string().min(1).max(120), summary: z.string().min(1).max(1200), note: z.string().max(600) };
const graphNode = z.object({ id, label: z.string().min(1).max(100), description: z.string().max(1200), color, sourcePage: z.number().int().positive().nullable().optional() }).strict();
export const graphShape = z.object({ ...textFields,
  rootId: id,
  nodes: z.array(graphNode).min(2).max(60),
  edges: z.array(z.object({ id, source: id, target: id, label: z.string().max(80) }).strict()).min(1).max(120),
}).strict();
// Generated references are explicit; older saved maps may have no references.
export const generatedGraphShape = graphShape.extend({ nodes: z.array(graphNode.extend({ sourcePage: z.number().int().positive().nullable() }).strict()).min(2).max(60) }).strict();
export const imagePlanShape = z.object({ ...textFields, prompt: z.string().min(1).max(6000) }).strict();
export const hotspotShape = z.object({ hotspots: z.array(z.object({ id, label: z.string().min(1).max(100), description: z.string().min(1).max(1200), x: z.number().min(1).max(99), y: z.number().min(1).max(99), color }).strict()).min(2).max(18) }).strict();
const graphArtifact = graphShape.extend({ id: z.string().uuid(), kind: z.enum(["map", "diagram"]),
  layout: z.array(z.object({ id, x: z.number().min(-100000).max(100000), y: z.number().min(-100000).max(100000) }).strict()).max(60).optional(),
});
const imageArtifact = z.object({ ...textFields, id: z.string().uuid(), kind: z.literal("image"),
  image: z.object({ assetId: z.string().uuid(), width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192) }).strict(),
  hotspots: hotspotShape.shape.hotspots,
}).strict();
export const studyArtifactSchema = z.union([graphArtifact.strict(), imageArtifact]);
export type StudyArtifact = z.infer<typeof studyArtifactSchema>;
export type GraphArtifact = Extract<StudyArtifact, { kind: "map" | "diagram" }>;
export type ImageArtifact = Extract<StudyArtifact, { kind: "image" }>;
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export function validateGraph<T extends z.infer<typeof graphShape>>(graph: T, kind: "map" | "diagram"): T {
  const ids = new Set(graph.nodes.map(node => node.id));
  if (ids.size !== graph.nodes.length || !ids.has(graph.rootId)) throw new Error("I concetti della mappa non sono validi.");
  if (new Set(graph.edges.map(edge => edge.id)).size !== graph.edges.length) throw new Error("Collegamenti duplicati.");
  if (graph.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target)) throw new Error("Un collegamento non trova il suo concetto.");
  const visited = new Set<string>();
  const pending = [graph.rootId];
  while (pending.length) {
    const next = pending.pop()!; if (visited.has(next)) continue; visited.add(next);
    for (const edge of graph.edges) {
      if (edge.source === next) pending.push(edge.target);
      if (kind === "diagram" && edge.target === next) pending.push(edge.source);
    }
  }
  if (visited.size !== ids.size) throw new Error("La mappa contiene concetti scollegati.");
  if (kind === "map" && (graph.edges.length !== ids.size - 1 || graph.edges.some(edge => edge.target === graph.rootId) || graph.nodes.some(node => node.id !== graph.rootId && graph.edges.filter(edge => edge.target === node.id).length !== 1))) throw new Error("La mappa deve avere una struttura ad albero.");
  if ("layout" in graph && Array.isArray(graph.layout) && graph.layout.some((entry: { id: string }) => !ids.has(entry.id))) throw new Error("La disposizione contiene un concetto inesistente.");
  return graph;
}

export function validateArtifact(artifact: StudyArtifact): StudyArtifact {
  if (artifact.kind === "image") {
    if (new Set(artifact.hotspots.map(point => point.id)).size !== artifact.hotspots.length) throw new Error("Punti interattivi duplicati.");
  } else validateGraph(artifact, artifact.kind);
  return artifact;
}

export const artifactNames = { map: "Mappa mentale", image: "Immagine interattiva", diagram: "Schema" } as const;

export function validateArtifactPages(artifact: StudyArtifact, pages: number) {
  if (artifact.kind !== "image" && artifact.nodes.some(node => node.sourcePage != null && (!Number.isInteger(node.sourcePage) || node.sourcePage < 1 || node.sourcePage > pages))) throw new Error("La mappa contiene un riferimento a una pagina non presente nel PDF.");
  return artifact;
}
