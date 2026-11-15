import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cloudEnabled, userRoot } from "./firebase-server";
import { dataRoot } from "./store";
import { normalizeTourSeen, type TourSection } from "./tony-tours";

const writes = new Map<string, Promise<unknown>>();
async function readLocal() {
  try { return normalizeTourSeen(JSON.parse(await readFile(path.join(dataRoot(), "tours.json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return normalizeTourSeen(null); throw error; }
}
export async function getTonyTours() {
  if (cloudEnabled()) return normalizeTourSeen((await (await userRoot()).collection("settings").doc("tours").get()).data());
  await writes.get(dataRoot())?.catch(() => {});
  return readLocal();
}
export async function saveTonyTour(section: TourSection, seen: boolean) {
  if (cloudEnabled()) {
    const ref = (await userRoot()).collection("settings").doc("tours");
    await ref.set({ [section]: seen }, { merge: true });
    return normalizeTourSeen((await ref.get()).data());
  }
  const root = dataRoot();
  const task = (writes.get(root) || Promise.resolve()).catch(() => {}).then(async () => {
    const state = { ...await readLocal(), [section]: seen };
    await mkdir(root, { recursive: true });
    const temporary = path.join(root, `.tours-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(state), "utf8");
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, path.join(root, "tours.json")); break; }
        catch (error) { if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code || "") || attempt >= 7) throw error; await delay(25 * (attempt + 1)); }
      }
      return state;
    } catch (error) { await rm(temporary, { force: true }).catch(() => {}); throw error; }
  });
  writes.set(root, task);
  try { return await task; } finally { if (writes.get(root) === task) writes.delete(root); }
}
