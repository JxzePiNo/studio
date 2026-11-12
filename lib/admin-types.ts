import type { PlatformConfig } from "./platform-config";
import type { StudyDocument, SlideData, ExamFolder } from "./types";
import type { SavedStudySession } from "./study-history";
export interface UsageModel { model: string; input: number; cached: number; output: number; total: number; calls: number; unknown: number }
export interface UsageSummary { models: Record<string, UsageModel>; calls: number; errors: number; firstRecordedAt: string; lastRecordedAt: string }
export interface AdminUser { uid: string; email: string; name: string; disabled: boolean; verified: boolean; createdAt: string; lastLoginAt: string | null; lastVisitAt: string | null; usage: UsageSummary | null; files: { count: number; bytes: number; pages: number }; activity: { questions?: number; lastVisitAt?: string } | null }
export interface AdminOverview { users: AdminUser[]; cursor: string | null; config: PlatformConfig; audit: { id: string; actor: string; action: string; target: string; at: string }[]; generatedAt: string }
export interface AdminQuestion { id: string; documentId: string; page: number; question: string; kind: string; at: string }
export interface UsageEvent { id: string; feature: string; model: string; total: number; input: number; output: number; cached: number; measured: boolean; status: string; durationMs: number; at: string }
export interface AdminDetail { uid: string; user: Omit<AdminUser, "uid" | "usage" | "files" | "activity">; profile: { displayName?: string; studyProgram?: string; onboardingCompleted?: boolean }; controls: { features?: Partial<PlatformConfig["features"]>; note?: string; aiBlocked?: boolean }; usage: UsageSummary | null; documents: StudyDocument[]; documentsCursor: string | null; folders: ExamFolder[]; questions: AdminQuestion[]; questionsCursor: string | null; events: UsageEvent[]; eventsCursor: string | null; sessions: SavedStudySession[]; referral: unknown }
export interface AdminDocument { document: StudyDocument; slides: (SlideData & { page: string })[]; quizzes: { id: string; title?: string; questions?: unknown[] }[]; cursor: string | null }
