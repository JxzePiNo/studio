import type { StudyDocument } from "./types";

export function isStudyMaterial(document: Pick<StudyDocument, "excludedFromStudy">) {
  return document.excludedFromStudy !== true;
}
