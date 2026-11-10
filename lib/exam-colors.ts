import type { ExamFolder } from "./types";

export const examColors = ["lavender", "mint", "peach", "sky", "rose", "sand"] as const;
export type ExamColor = typeof examColors[number];

export function examColor(folder: ExamFolder): ExamColor {
  if (folder.color && examColors.includes(folder.color)) return folder.color;
  // Existing exams get a stable colour without requiring a data migration.
  const hash = Array.from(folder.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  return examColors[hash % examColors.length];
}
