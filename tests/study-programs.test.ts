import assert from "node:assert/strict";
import test from "node:test";
import { customStudyProgram, normalizeStudyProgram, searchStudyPrograms, STUDY_PROGRAMS } from "../lib/study-programs";

test("degree search matches case, accents, punctuation and words in any order", () => {
  assert.equal(normalizeStudyProgram(" UNIVERSITÀ dell’Educazione "), "universita dell educazione");
  assert.ok(searchStudyPrograms("INFORMATICA triennale").some(item => item.area === "Informatica"));
  assert.ok(searchStudyPrograms("eta evolutiva").some(item => item.area.includes("età evolutiva")));
  assert.ok(searchStudyPrograms("scienze dell’educazione").some(item => item.level === "triennale"));
  assert.deepEqual(searchStudyPrograms("corso assolutamente inesistente"), []);
});

test("level filters and catalogue keep distinct, nonduplicate degrees", () => {
  assert.equal(new Set(STUDY_PROGRAMS.map(item => normalizeStudyProgram(item.label))).size, STUDY_PROGRAMS.length);
  for (const level of ["triennale", "magistrale", "ciclo-unico"] as const) {
    const results = searchStudyPrograms("", level);
    assert.ok(results.length > 0);
    assert.ok(results.every(item => item.level === level));
  }
  assert.ok(searchStudyPrograms("Ingegneria meccanica", "triennale").length);
  assert.ok(searchStudyPrograms("Psicologia", "magistrale").length);
});

test("custom courses are accepted without catalogue membership and respect storage limit", () => {
  assert.equal(customStudyProgram("  Laurea in Studi interdisciplinari del futuro  "), "Laurea in Studi interdisciplinari del futuro");
  assert.equal(customStudyProgram("   "), null);
  assert.equal(customStudyProgram("x".repeat(301)), null);
  assert.equal(customStudyProgram("x".repeat(300)), "x".repeat(300));
});
