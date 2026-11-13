import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { cloudEnabled, userRoot } from "./firebase-server";
import { dataRoot } from "./store";
import type { StudyProfile } from "./types";
import { MemoryCache } from "./memory-cache";
import { makeSocialProfile } from "./friends";
import { canonicalUniversity } from "./universities";
import { normalizeUsername, validUsername } from "./username";

const profileCache = new MemoryCache<StudyProfile>({ maxEntries: 128, maxBytes: 1024 * 1024, ttlMs: 30_000 });

export const defaultStudyProfile: Readonly<StudyProfile> = Object.freeze({ studyProgram: "", onboardingCompleted: false });

export const studyProfileInputSchema = z.object({
  studyProgram: z.string().trim().max(300),
  onboardingCompleted: z.boolean(),
  photoURL: z.string().max(150000).regex(/^$|^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
  displayName: z.string().trim().max(80).optional(),
  university: z.string().trim().max(160).transform(canonicalUniversity).optional(),
  city: z.string().trim().max(120).refine(value => !value || value.length >= 2, "Indica una città valida.").optional(),
  nickname: z.string().transform(normalizeUsername).refine(value => !value || validUsername(value), "Lo username deve avere 3–24 lettere, numeri, punti o underscore.").optional(),
}).strict();

const storedProfileSchema = studyProfileInputSchema.extend({ updatedAt: z.string().datetime().optional() });
const localWrites = new Map<string, Promise<unknown>>();

export async function getStudyProfile(): Promise<StudyProfile> {
  if (cloudEnabled()) {
    const reference = (await userRoot()).collection("settings").doc("profile");
    const cached = profileCache.get(reference.path);
    if (cached) return structuredClone(cached);
    const snapshot = await reference.get();
    const profile = snapshot.exists ? storedProfileSchema.parse(snapshot.data()) : { ...defaultStudyProfile };
    profileCache.set(reference.path, profile, Buffer.byteLength(JSON.stringify(profile)));
    return structuredClone(profile);
  }
  try {
    return storedProfileSchema.parse(JSON.parse(await readFile(path.join(dataRoot(), "profile.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...defaultStudyProfile };
    throw error;
  }
}

export async function saveCloudStudyProfile(reference: import("@google-cloud/firestore").DocumentReference, input: StudyProfile) {
    const db = reference.firestore;
    await db.runTransaction(async tx => {
      const [current, social] = await Promise.all([tx.get(reference), tx.get(db.collection("socialProfiles").doc(reference.parent.parent!.id))]);
      const previous = current.data() as StudyProfile | undefined;
      const profile = { ...previous, ...input, updatedAt: new Date().toISOString() };
      const uid = reference.parent.parent!.id;
      const claim = profile.nickname ? db.collection("socialNicknames").doc(profile.nickname) : undefined;
      if (claim) {
        const reserved = await tx.get(claim);
        if (reserved.exists && reserved.get("uid") !== uid) throw Object.assign(new Error("Questo username è già in uso. Scegline un altro."), { status: 409 });
      }
      if (previous?.nickname && previous.nickname !== profile.nickname) tx.delete(db.collection("socialNicknames").doc(previous.nickname));
      if (claim) tx.set(claim, { uid });
      tx.set(reference, profile);
      const name = profile.displayName || social.get("name") || profile.nickname || "Studente";
      const socialProfile = makeSocialProfile({ name, photoURL: profile.photoURL || social.get("photoURL") || "", nickname: profile.nickname || "", city: profile.city || "", university: profile.university || "", studyProgram: profile.studyProgram }, social.data());
      tx.set(social.ref, socialProfile);
      const directory = db.collection("socialDirectory").doc(uid);
      if (socialProfile.discoverable) tx.set(directory, socialProfile);
      else tx.delete(directory);
    });
}

export async function saveStudyProfile(input: { studyProgram: string; onboardingCompleted: boolean; displayName?: string; photoURL?: string; university?: string; nickname?: string; city?: string }): Promise<StudyProfile> {
  const parsed = studyProfileInputSchema.safeParse(input);
  if (!parsed.success) throw Object.assign(new Error("Profilo di studio non valido."), { status: 400 });
  if (cloudEnabled()) {
    const reference = (await userRoot()).collection("settings").doc("profile");
    await saveCloudStudyProfile(reference, parsed.data);
    profileCache.delete(reference.path);
    return getStudyProfile();
  }

  const root = dataRoot();
  const destination = path.join(root, "profile.json");
  const previous = localWrites.get(destination) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const profile = { ...await getStudyProfile(), ...parsed.data, updatedAt: new Date().toISOString() };
    await mkdir(root, { recursive: true });
    const temporary = path.join(root, `.profile-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(profile), "utf8");
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, destination); break; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code || "") || attempt >= 7) throw error;
          await delay(25 * (attempt + 1));
        }
      }
      return profile;
    } catch (error) { await rm(temporary, { force: true }).catch(() => {}); throw error; }
  });
  localWrites.set(destination, task);
  try { return await task; }
  finally { if (localWrites.get(destination) === task) localWrites.delete(destination); }
}
