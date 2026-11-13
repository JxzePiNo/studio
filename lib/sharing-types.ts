import type { MaterialProvenance } from "./types";
export type ShareKind = "course" | "pdf" | "quiz";
export type ShareTarget = { kind: ShareKind; id: string; documentId?: string; name: string };
export type MaterialShare = { id: string; kind: ShareKind; title: string; ownerId: string; ownerName: string; provenance: MaterialProvenance; sourceId: string; documentId?: string; visibility: "public" | "direct" | "private"; mode: "copy" | "coauthor"; includeChat: boolean; includeResults: boolean; recipientIds: string[]; createdAt: string; active: boolean; ready: boolean; documentCount: number };
export type ShareSummary = MaterialShare & { imported?: boolean; folderId?: string };
export type SharingOverview = { available: boolean; received: ShareSummary[]; sent: ShareSummary[]; publicCourses: ShareSummary[] };
