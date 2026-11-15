import { z } from "zod";
import { deleteDocument, readDocumentMetadata, setDocumentStudyExclusion } from "./store";

export const documentBulkSchema = z.object({
  folderId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Selezione duplicata."),
  action: z.enum(["exclude", "include", "delete"]),
}).strict();
export type DocumentBulkInput = z.infer<typeof documentBulkSchema>;
type Operations = { metadata: typeof readDocumentMetadata; remove: typeof deleteDocument; exclude: typeof setDocumentStudyExclusion };

export async function mutateDocuments(input: DocumentBulkInput, operations: Operations = { metadata: readDocumentMetadata, remove: deleteDocument, exclude: setDocumentStudyExclusion }) {
  // Check access and course membership for the whole selection before changing
  // anything. Storage failures after preflight are reported per document.
  for (let offset = 0; offset < input.ids.length; offset += 4) {
    await Promise.all(input.ids.slice(offset, offset + 4).map(async id => {
      const document = await operations.metadata(id);
      if (document.folderId !== input.folderId) throw Object.assign(new Error("Seleziona solo materiali di questo esame."), { status: 400 });
    }));
  }
  const succeeded: string[] = [], failed: string[] = [];
  for (let offset = 0; offset < input.ids.length; offset += 4) {
    await Promise.all(input.ids.slice(offset, offset + 4).map(async id => {
      try {
        if (input.action === "delete") await operations.remove(id);
        else await operations.exclude(id, input.action === "exclude");
        succeeded.push(id);
      } catch { failed.push(id); }
    }));
  }
  return { action: input.action, succeeded, failed };
}
export type DocumentBulkResult = Awaited<ReturnType<typeof mutateDocuments>>;
