export interface Explanation {
  title: string;
  language: "en" | "it" | "other";
  overview: string;
  concepts: { title: string; explanation: string }[];
  example: string;
  takeaway: string;
  glossary: { word: string; translation: string; context: string }[];
}
export interface SlideData {
  read?: boolean;
  chat?: ChatMessage[];
  notes: string;
  explanation?: Explanation;
  generatedAt?: string;
}
export interface StudyDocument {
  originalName?: string;
  folderId?: string;
  id: string;
  name: string;
  pages: number;
  size: number;
  createdAt: string;
  currentPage: number;
  slides: Record<string, SlideData>;
}
export type DocumentSummary = Omit<StudyDocument, "slides"> & { analyzedPages: number; readPages?: number };

export interface StudyAvailability {
  /** Recurring days off: JavaScript weekday numbers, Sunday = 0. */
  nonStudyWeekdays?: number[];
  /** Specific calendar days off in YYYY-MM-DD format. */
  nonStudyDates?: string[];
}

export interface ExamFolder extends StudyAvailability {
  archived?: boolean;
  /** Missing on existing courses: treated as required. */
  optional?: boolean;
  cfu?: number;
  id: string;
  name: string;
  createdAt: string;
  color?: import("./exam-colors").ExamColor;
  examDate?: string;
  pagesPerHour?: number;
  documentOrder?: string[];
}
export interface ChatMessage { role: "user" | "assistant"; content: string; source?: "analysis"; quiz?: import("./quiz").StudyQuiz }

export interface StudyProfile {
  displayName?: string;
  studyProgram: string;
  onboardingCompleted: boolean;
  updatedAt?: string;
}
