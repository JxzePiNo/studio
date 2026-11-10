import { z } from "zod";
import { studyDay } from "./study-session";

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const readRangeInput = z.object({
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  startDate: z.string().regex(dayPattern).optional(),
  endDate: z.string().regex(dayPattern).optional(),
}).strict();

const dayMs = 86400000;
function timestamp(day: string) {
  const value = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== day) throw new Error("Indica date valide.");
  return value;
}

/** Evenly spread inclusive page numbers over the selected calendar period. */
export function planReadRange(input: z.infer<typeof readRangeInput>, pages: number, today = studyDay()) {
  if (input.from > input.to || input.to > pages) throw new Error(`Scegli un intervallo compreso tra 1 e ${pages}.`);
  if (!!input.startDate !== !!input.endDate) throw new Error("Indica sia la data iniziale sia quella finale.");
  const startDate = input.startDate || today;
  const endDate = input.endDate || today;
  const start = timestamp(startDate);
  const end = timestamp(endDate);
  const span = Math.round((end - start) / dayMs);
  if (span < 0 || span > 3660 || endDate > today) throw new Error("Scegli un periodo passato, in ordine cronologico, di massimo dieci anni.");
  const count = input.to - input.from + 1;
  return Array.from({ length: count }, (_, index) => ({
    page: input.from + index,
    day: new Date(start + (count > 1 ? Math.floor(index * span / (count - 1)) : 0) * dayMs).toISOString().slice(0, 10),
  }));
}
