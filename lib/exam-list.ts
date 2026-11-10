import type { ExamFolder } from "./types";
import { localStudyDate, validExamDate } from "./study-plan";

export type ExamSort = "deadline" | "name" | "newest";

function searchText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("it-IT").trim();
}

/** Upcoming exams first; passed dates follow, and unscheduled exams come last. */
export function visibleExams(folders: readonly ExamFolder[], query: string, sort: ExamSort, today = localStudyDate()): ExamFolder[] {
  const needle = searchText(query);
  return folders.filter(folder => searchText(folder.name).includes(needle)).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    if (sort === "newest") return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    const aDate = a.examDate && validExamDate(a.examDate) ? a.examDate : "";
    const bDate = b.examDate && validExamDate(b.examDate) ? b.examDate : "";
    if (!aDate || !bDate) return Number(!aDate) - Number(!bDate);
    const aPassed = aDate < today;
    const bPassed = bDate < today;
    if (aPassed !== bPassed) return Number(aPassed) - Number(bPassed);
    return aPassed ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
  });
}
