import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { cloudEnabled, userRoot } from "./firebase-server";
import { dataRoot } from "./store";
import type { StudyProfile } from "./types";

export const defaultStudyProfile: Readonly<StudyProfile> = Object.freeze({ studyProgram: "", onboardingCompleted: false });

export const studyProfileInputSchema = z.object({
  studyProgram: z.string().trim().max(300),
  onboardingCompleted: z.boolean(),
}).strict();

const storedProfileSchema = studyProfileInputSchema.extend({ updatedAt: z.string().datetime().optional() });
const localWrites = new Map<string, Promise<unknown>>();

export async function getStudyProfile(): Promise<StudyProfile> {
  if (cloudEnabled()) {
    const snapshot = await (await userRoot()).collection("settings").doc("profile").get();
    return snapshot.exists ? storedProfileSchema.parse(snapshot.data()) : { ...defaultStudyProfile };
  }
  try {
    return storedProfileSchema.parse(JSON.parse(await readFile(path.join(dataRoot(), "profile.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...defaultStudyProfile };
    throw error;
  }
}

export async function saveStudyProfile(input: { studyProgram: string; onboardingCompleted: boolean }): Promise<StudyProfile> {
  const parsed = studyProfileInputSchema.safeParse(input);
  if (!parsed.success) throw Object.assign(new Error("Profilo di studio non valido."), { status: 400 });
  if (cloudEnabled()) {
    const profile = { ...parsed.data, updatedAt: new Date().toISOString() };
    await (await userRoot()).collection("settings").doc("profile").set(profile);
    return profile;
  }

  const root = dataRoot();
  const destination = path.join(root, "profile.json");
  const previous = localWrites.get(destination) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const profile = { ...parsed.data, updatedAt: new Date().toISOString() };
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
