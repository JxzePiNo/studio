import { z } from "zod";

const coordinate = z.number().min(-10).max(10);
const vector = z.object({ x: coordinate, y: coordinate, z: coordinate }).strict();
const size = z.object({ x: z.number().min(0.05).max(5), y: z.number().min(0.05).max(5), z: z.number().min(0.05).max(5) }).strict();
export const conceptModelShape = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(1000),
  note: z.string().min(1).max(600),
  parts: z.array(z.object({
    id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(1200),
    shape: z.enum(["ellipsoid", "box", "cylinder", "cone", "ring", "tube"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    position: vector,
    size,
    rotation: vector,
    points: z.array(vector).max(8),
  }).strict()).min(2).max(24),
}).strict();
export const conceptModelSchema = conceptModelShape.extend({ id: z.string().uuid(), reference: z.object({ title: z.string(), url: z.string().url().startsWith("https://") }).optional() });
export type ConceptModel = z.infer<typeof conceptModelSchema>;
export type ConceptPart = ConceptModel["parts"][number];

export function validateConceptGeometry(model: z.infer<typeof conceptModelShape>) {
  if (new Set(model.parts.map(part => part.id)).size !== model.parts.length) throw new Error("Il modello contiene parti duplicate.");
  if (model.parts.some(part => part.shape === "tube" && part.points.length < 2)) throw new Error("Il modello contiene un collegamento incompleto.");
  return model;
}
