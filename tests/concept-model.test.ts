import test from "node:test";
import assert from "node:assert/strict";
import { conceptModelSchema, conceptModelShape, validateConceptGeometry } from "../lib/concept-model";
import { heartModel } from "../lib/heart-model";
import { boundedChatHistory } from "../lib/analysis-chat";

test("the heart example is a bounded interactive model with twelve distinct selectable parts", () => {
  const model = conceptModelSchema.parse(heartModel);
  validateConceptGeometry(model);
  assert.equal(model.parts.length, 12);
  for (const name of ["Atrio destro", "Ventricolo sinistro", "Aorta", "Valvola mitrale", "Valvola polmonare"]) assert.ok(model.parts.some(part => part.name === name));
});

test("model geometry rejects executable content, unbounded dimensions, duplicate IDs and broken tubes", () => {
  const { id: _id, reference: _reference, ...data } = heartModel;
  assert.equal(conceptModelShape.safeParse({ ...data, script: "alert(1)" }).success, false);
  const changed = (patch: Record<string, unknown>) => ({ ...data, parts: data.parts.map((part, index) => index ? part : { ...part, ...patch }) });
  assert.equal(conceptModelShape.safeParse(changed({ shape: "html" })).success, false);
  assert.equal(conceptModelShape.safeParse(changed({ color: "url(https://example.com)" })).success, false);
  assert.equal(conceptModelShape.safeParse(changed({ size: { x: 1000000, y: 1, z: 1 } })).success, false);
  assert.throws(() => validateConceptGeometry({ ...data, parts: [data.parts[0], data.parts[0]] }), /duplicate/);
  assert.throws(() => validateConceptGeometry(changed({ shape: "tube", points: [] })), /incompleto/);
});

test("saved chat preserves the interactive model alongside the question and bounds older turns", () => {
  const history = boundedChatHistory([{ role: "user", content: "Spiegami il cuore" }, { role: "assistant", content: heartModel.title, visualization: heartModel }]);
  assert.deepEqual(history.at(-1)?.visualization, heartModel);
  assert.ok(new TextEncoder().encode(JSON.stringify(history)).byteLength < 280000);
});
