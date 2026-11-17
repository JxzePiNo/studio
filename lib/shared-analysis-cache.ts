import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cloudEnabled, services } from "./firebase-server";
import { analysisExplanationSchema } from "./schema";
import type { Explanation } from "./types";

type Cached = { explanation: Explanation; generatedAt: string };
const pending = new Map<string, Promise<Cached>>();
const reusableExplanationSchema = analysisExplanationSchema.partial({ pageKind: true });
export function analysisKey(hash: string, page: number, model: string, prompt: string, context: { studyProgram?: string; courseName?: string; documentName?: string }) {
  return createHash("sha256").update(JSON.stringify([hash, page, model, prompt, context.studyProgram?.trim() || "", context.courseName?.trim() || "", context.documentName || ""])).digest("hex");
}
function cached(value: unknown): Cached | undefined {
  const data = value as Cached | undefined;
  const parsed = reusableExplanationSchema.safeParse(data?.explanation);
  return parsed.success && typeof data?.generatedAt === "string" ? { explanation: parsed.data, generatedAt: data.generatedAt } : undefined;
}

/** Read-only bulk lookup for uploads: never starts model generation. */
export async function cachedAnalyses(keys: string[]) {
  const found = new Map<string, Cached>();
  if (cloudEnabled()) {
    const db = services().db;
    for (let offset = 0; offset < keys.length; offset += 100) {
      const records = await db.getAll(...keys.slice(offset, offset + 100).map(key => db.collection("pdfAnalysisCache").doc(key)));
      for (const record of records) { const hit = cached(record.data()); if (hit) found.set(record.id, hit); }
    }
  } else {
    const directory = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), "data"), ".analysis-cache");
    for (let offset = 0; offset < keys.length; offset += 32) {
      await Promise.all(keys.slice(offset, offset + 32).map(async key => {
        try { const hit = cached(JSON.parse(await readFile(path.join(directory, `${key}.json`), "utf8"))); if (hit) found.set(key, hit); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
      }));
    }
  }
  return found;
}

/** Only immutable PDF-derived analysis goes here, never notes/chat/progress. */
export async function sharedAnalysis(key: string, generate: () => Promise<Explanation>, force = false): Promise<Cached> {
  const scope = cloudEnabled() ? "cloud" : path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), "data"));
  const pendingKey = `${scope}:${key}`;
  if (!force && pending.has(pendingKey)) return structuredClone(await pending.get(pendingKey)!);
  const task = (async () => {
    if (!cloudEnabled()) {
      const directory = path.join(scope, ".analysis-cache");
      const file = path.join(directory, `${key}.json`);
      if (!force) {
        try { const hit = cached(JSON.parse(await readFile(file, "utf8"))); if (hit) return hit; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
      }
      const result = { explanation: await generate(), generatedAt: new Date().toISOString() };
      await mkdir(directory, { recursive: true });
      const temporary = path.join(directory, `${key}.${randomUUID()}.tmp`);
      try { await writeFile(temporary, JSON.stringify(result)); await rename(temporary, file); }
      finally { await rm(temporary, { force: true }); }
      return result;
    }
    const db = services().db, ref = db.collection("pdfAnalysisCache").doc(key);
    const owner = randomUUID(), deadline = Date.now() + 155000;
    for (;;) {
      const claim = await db.runTransaction(async tx => {
        const previous = (await tx.get(ref)).data();
        const hit = !force ? cached(previous) : undefined;
        if (hit) return { hit, acquired: false };
        if (previous?.leaseUntil > Date.now()) return { acquired: false };
        tx.set(ref, { ...(cached(previous) || {}), owner, leaseUntil: Date.now() + 180000 });
        return { acquired: true };
      });
      if (claim.hit) return claim.hit;
      if (claim.acquired) break;
      if (Date.now() > deadline) throw Object.assign(new Error("Analisi in elaborazione. Riprova tra poco."), { status: 409 });
      await delay(750);
    }
    try {
      const result = { explanation: await generate(), generatedAt: new Date().toISOString() };
      await db.runTransaction(async tx => { if ((await tx.get(ref)).get("owner") === owner) tx.set(ref, result); });
      return result;
    } catch (error) {
      await db.runTransaction(async tx => {
        const previous = await tx.get(ref);
        if (previous.get("owner") !== owner) return;
        const fallback = cached(previous.data());
        if (fallback) tx.set(ref, fallback); else tx.delete(ref);
      }).catch(() => {});
      throw error;
    }
  })();
  pending.set(pendingKey, task);
  try { return structuredClone(await task); }
  finally { if (pending.get(pendingKey) === task) pending.delete(pendingKey); }
}
