import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultStudyProfile, getStudyProfile, saveStudyProfile } from "../lib/study-profile";

test("study profile persistence", async t => {
  const previousRoot = process.env.DATA_DIR;
  const previousCloud = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  const directory = await mkdtemp(path.join(os.tmpdir(), "margine-profile-"));
  process.env.DATA_DIR = directory;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousRoot;
    if (previousCloud === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previousCloud;
    await rm(directory, { recursive: true, force: true });
  });

  await t.test("missing profile starts onboarding without sharing a mutable default", async () => {
    const profile = await getStudyProfile();
    assert.deepEqual(profile, defaultStudyProfile);
    profile.studyProgram = "Mutazione locale";
    assert.equal((await getStudyProfile()).studyProgram, "");
    assert.equal(defaultStudyProfile.studyProgram, "");
  });

  await t.test("normalizes and persists the study program and completion status", async () => {
    const saved = await saveStudyProfile({ studyProgram: "  Laurea in Informatica  ", onboardingCompleted: true });
    assert.equal(saved.studyProgram, "Laurea in Informatica");
    assert.equal(saved.onboardingCompleted, true);
    assert.ok(Number.isFinite(Date.parse(saved.updatedAt!)));
    assert.deepEqual(await getStudyProfile(), saved);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "profile.json"), "utf8")), saved);
  });

  await t.test("allows skipping onboarding and clearing a previously saved program", async () => {
    const skipped = await saveStudyProfile({ studyProgram: "", onboardingCompleted: true });
    assert.equal(skipped.studyProgram, "");
    assert.equal(skipped.onboardingCompleted, true);
    assert.deepEqual(await getStudyProfile(), skipped);
  });

  await t.test("serializes competing saves and leaves no temporary files", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => saveStudyProfile({ studyProgram: `Percorso ${index}`, onboardingCompleted: true })));
    assert.deepEqual(await getStudyProfile(), results[7]);
    assert.deepEqual(await readdir(directory), ["profile.json"]);
  });

  await t.test("rejects oversized input and arbitrary path or user selectors", async () => {
    const before = await getStudyProfile();
    await assert.rejects(saveStudyProfile({ studyProgram: "x".repeat(301), onboardingCompleted: true }), /Profilo di studio non valido/);
    const arbitrary = { studyProgram: "Informatica", onboardingCompleted: true, userId: "another-user", path: "../outside.json" };
    await assert.rejects(saveStudyProfile(arbitrary), /Profilo di studio non valido/);
    assert.deepEqual(await getStudyProfile(), before);
    assert.deepEqual(await readdir(directory), ["profile.json"]);
  });

  await t.test("does not replace corrupt stored JSON with an empty profile", async () => {
    await writeFile(path.join(directory, "profile.json"), "not json");
    await assert.rejects(getStudyProfile(), SyntaxError);
    await writeFile(path.join(directory, "profile.json"), JSON.stringify({ studyProgram: "Informatica" }));
    await assert.rejects(getStudyProfile());
  });
});
