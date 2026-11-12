import { z } from "zod";
export const featureLabels = { uploads: "Caricamenti", analysis: "Analisi PDF", chat: "Chat", quizzes: "Quiz", maps: "Mappe", images: "Immagini", diagrams: "Schemi", referrals: "Inviti e saluti" } as const;
export type Feature = keyof typeof featureLabels;
export const featuresSchema = z.object({ uploads: z.boolean(), analysis: z.boolean(), chat: z.boolean(), quizzes: z.boolean(), maps: z.boolean(), images: z.boolean(), diagrams: z.boolean(), referrals: z.boolean() }).strict();
export const defaultFeatures = Object.fromEntries(Object.keys(featureLabels).map(key => [key, true])) as Record<Feature, boolean>;
export const rateSchema = z.object({ input: z.number().min(0).max(10000), cached: z.number().min(0).max(10000), output: z.number().min(0).max(10000) }).strict();
export const platformSchema = z.object({ maintenance: z.boolean(), message: z.string().trim().max(300), features: featuresSchema, rates: z.record(z.string().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/), rateSchema).refine(value => Object.keys(value).length <= 30) }).strict();
export type PlatformConfig = z.infer<typeof platformSchema>;
export const defaultPlatform: PlatformConfig = { maintenance: false, message: "Piattaforma in manutenzione. Riprova tra poco.", features: defaultFeatures, rates: {} };
export const userControlSchema = z.object({ features: featuresSchema.partial().optional(), note: z.string().trim().max(1000).optional(), aiBlocked: z.boolean().optional() }).strict();
export function isAdminIdentity(user: { email?: string | null; email_verified?: boolean; emailVerified?: boolean }) { return (user.email_verified === true || user.emailVerified === true) && user.email?.toLowerCase() === "paolucciacopo@gmail.com"; }
