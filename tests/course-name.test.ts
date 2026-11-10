import assert from "node:assert/strict";
import test from "node:test";
import { formatCourseName } from "../lib/course-name";

test("course display title capitalizes significant words and preserves connecting words", () => {
  assert.equal(formatCourseName(" KNOWLEDGE ENGINEER "), "Knowledge Engineer");
  assert.equal(formatCourseName("fundamentals OF machine learning"), "Fundamentals of Machine Learning");
  assert.equal(formatCourseName("ingegneria del software e delle reti"), "Ingegneria del Software e delle Reti");
  assert.equal(formatCourseName("fondamenti dell'intelligenza artificiale"), "Fondamenti dell'Intelligenza Artificiale");
  assert.equal(formatCourseName("of mice and men"), "Of Mice and Men");
  assert.equal(formatCourseName("  "), "");
});
