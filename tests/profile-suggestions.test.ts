import test from "node:test";
import assert from "node:assert/strict";
import { canonicalUniversity, normalizeUniversity, searchUniversities } from "../lib/universities";
import { normalizeUsername, suggestUsername, validUsername } from "../lib/username";
import { studyProfileInputSchema, saveCloudStudyProfile } from "../lib/study-profile";
import { memoryFirestore } from "./helpers/memory-firestore";

test("university suggestions cover cities, acronyms and distinct institutions", () => {
  for (const city of ["Firenze", "Siena", "Perugia", "Roma", "Milano", "Torino", "Politecnico"]) assert.ok(searchUniversities(city).length > 0, city);
  assert.equal(canonicalUniversity("unifi"), "Università degli Studi di Firenze");
  assert.equal(canonicalUniversity("Universita di Firenze"), "Università degli Studi di Firenze");
  assert.equal(canonicalUniversity("Polimi"), "Politecnico di Milano");
  assert.equal(searchUniversities("Mialno").some(item => item.label === "Politecnico di Milano"), true);
  assert.ok(searchUniversities("Roma").length >= 3);
  assert.notEqual(normalizeUniversity(canonicalUniversity("polimi")), normalizeUniversity(canonicalUniversity("unimi")));
  assert.equal(canonicalUniversity("  Ateneo personale estero  "), "Ateneo personale estero");
});
test("username suggestions derive editable dotted handles and normalize the visible @ prefix", async () => {
  assert.equal(suggestUsername("Iacopo Paolucci"), "iacopo.paolucci");
  assert.equal(suggestUsername("Éléonore D’Angelo"), "eleonore.dangelo");
  assert.equal(suggestUsername(""), "");
  assert.equal(normalizeUsername(" @Iacopo.Paolucci "), "iacopo.paolucci");
  for (const value of ["../outside", "foo/bar", ".alice", "alice.", "alice..bob"]) assert.equal(validUsername(value), false, value);
  const input = studyProfileInputSchema.parse({ studyProgram: "Informatica", onboardingCompleted: true, nickname: "@Iacopo.Paolucci", university: "unifi", city: "Firenze" });
  assert.equal(input.nickname, "iacopo.paolucci"); assert.equal(input.university, "Università degli Studi di Firenze");
  const db = memoryFirestore();
  await saveCloudStudyProfile(db.collection("users").doc("alice").collection("settings").doc("profile"), input);
  await assert.rejects(saveCloudStudyProfile(db.collection("users").doc("bob").collection("settings").doc("profile"), input), { status: 409 });
});
