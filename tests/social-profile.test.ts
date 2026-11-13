import test from "node:test";
import assert from "node:assert/strict";
import { memoryFirestore } from "./helpers/memory-firestore";
import { saveCloudStudyProfile, studyProfileInputSchema } from "../lib/study-profile";
import { FriendsService } from "../lib/friends";
import { needsProfileOnboarding } from "../lib/profile-onboarding";

test("social nicknames are unique under competing claims, and profile updates sync the searchable directory", async () => {
  const db = memoryFirestore();
  const alice = db.collection("users").doc("alice").collection("settings").doc("profile"), bob = db.collection("users").doc("bob").collection("settings").doc("profile");
  const input = { studyProgram: "Informatica", onboardingCompleted: true, nickname: "unico", university: "Roma" };
  const results = await Promise.allSettled([saveCloudStudyProfile(alice, input), saveCloudStudyProfile(bob, input)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason.status, 409);
  await db.collection("socialProfiles").doc("alice").set({ enabled: true, discoverable: true, shareActivity: true, name: "Alice" });
  await saveCloudStudyProfile(alice, { ...input, nickname: "alice_new", displayName: "Alice Rossi", university: "Milano" });
  assert.equal((await db.collection("socialDirectory").doc("alice").get()).get("universityKey"), "milano");
  await saveCloudStudyProfile(bob, input);
  assert.equal((await db.collection("socialNicknames").doc("unico").get()).get("uid"), "bob");
  await saveCloudStudyProfile(alice, { studyProgram: "Matematica", onboardingCompleted: true });
  assert.equal((await alice.get()).get("university"), "Milano"); assert.equal((await alice.get()).get("nickname"), "alice_new");
  assert.equal(studyProfileInputSchema.safeParse({ ...input, nickname: "../bad" }).success, false);
  assert.equal(studyProfileInputSchema.safeParse({ ...input, uid: "bob" }).success, false);
});

test("Friends is automatic for new and existing profiles and keeps visibility preferences", async () => {
  const db = memoryFirestore();
  const identity = { name: "Alice", nickname: "alice", city: "Roma", university: "Sapienza", studyProgram: "Informatica" };
  const service = new FriendsService(db, "alice");
  await service.ensureProfile(identity);
  assert.equal((await service.self()).self!.enabled, true);
  assert.equal("city" in (await service.self()).self!, false);
  assert.equal((await db.collection("socialDirectory").doc("alice").get()).exists, true);
  await service.saveSettings({ action: "settings", enabled: false, discoverable: false, shareActivity: false }, identity);
  assert.equal((await service.self()).self!.enabled, true, "legacy disable requests cannot deactivate Friends");
  await db.collection("socialProfiles").doc("alice").update({ enabled: false });
  await service.ensureProfile(identity);
  const self = (await service.self()).self!;
  assert.equal(self.enabled, true); assert.equal(self.discoverable, false); assert.equal(self.shareActivity, false);
  assert.equal((await db.collection("socialProfiles").doc("alice").get()).get("enabled"), true);
  assert.equal((await db.collection("socialDirectory").doc("alice").get()).exists, false);
  const reference = db.collection("users").doc("bob").collection("settings").doc("profile");
  await saveCloudStudyProfile(reference, { studyProgram: "Informatica", onboardingCompleted: true, nickname: "bob", city: "Milano" });
  assert.equal((await db.collection("socialProfiles").doc("bob").get()).get("enabled"), true);
  assert.equal((await db.collection("socialProfiles").doc("bob").get()).get("city"), undefined);
});

test("onboarding needs username and university but never city", () => {
  const profile = { studyProgram: "Informatica", onboardingCompleted: true };
  assert.equal(needsProfileOnboarding(profile), true);
  assert.equal(needsProfileOnboarding({ ...profile, nickname: "alice" }), true);
  assert.equal(needsProfileOnboarding({ ...profile, university: "Roma" }), true);
  assert.equal(needsProfileOnboarding({ ...profile, nickname: "alice", university: "Roma" }), false);
  assert.equal(needsProfileOnboarding({ ...profile, nickname: "alice", university: "Roma", city: "" }), false);
});

test("custom profile photos persist in the personal profile and searchable social directory", async () => {
  const db = memoryFirestore();
  const reference = db.collection("users").doc("alice").collection("settings").doc("profile");
  const input = { studyProgram: "Informatica", onboardingCompleted: true, nickname: "alice", photoURL: "data:image/jpeg;base64,YWJj" };
  assert.equal(studyProfileInputSchema.safeParse(input).success, true);
  assert.equal(studyProfileInputSchema.safeParse({ ...input, photoURL: "javascript:alert(1)" }).success, false);
  assert.equal(studyProfileInputSchema.safeParse({ ...input, photoURL: "data:image/svg+xml;base64,YWJj" }).success, false);
  await saveCloudStudyProfile(reference, input);
  await saveCloudStudyProfile(reference, { studyProgram: "Matematica", onboardingCompleted: true });
  const service = new FriendsService(db, "alice");
  await service.ensureProfile({ name: "Alice", studyProgram: "Matematica", nickname: "alice", university: "Roma" });
  assert.equal((await reference.get()).get("photoURL"), input.photoURL);
  assert.equal((await db.collection("socialDirectory").doc("alice").get()).get("photoURL"), input.photoURL);
  assert.equal((await service.self()).self?.photoURL, input.photoURL);
});
