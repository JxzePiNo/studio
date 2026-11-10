import type { ExamFolder } from "./types";

export const examColors = ["lavender", "mint", "peach", "sky", "rose", "sand"] as const;
export type ExamColor = typeof examColors[number];

// Same ArchAIve swatches used by the exam cards; legacy saved keys stay stable.
const archiveAccents: Record<ExamColor, string> = {
  lavender: "oklch(70.7% 0.165 254.624)",
  mint: "oklch(75% 0.183 55.934)",
  peach: "oklch(85.2% 0.199 91.936)",
  sky: "oklch(70.4% 0.191 22.216)",
  rose: "oklch(70.7% 0.022 261.325)",
  sand: "oklch(26.9% 0 none)",
};

export function examAccentColor(folder: ExamFolder) {
  return archiveAccents[examColor(folder)];
}

export function examColor(folder: ExamFolder): ExamColor {
  if (folder.color && examColors.includes(folder.color)) return folder.color;
  // Existing exams get a stable colour without requiring a data migration.
  const hash = Array.from(folder.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  return examColors[hash % examColors.length];
}
