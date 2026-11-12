import test from "node:test";
import assert from "node:assert/strict";
import { heartMap } from "../lib/artifact-example";
import { graphPositions, graphSvg } from "../lib/artifact-layout";
import { studyArtifactSchema, validateArtifact } from "../lib/study-artifact";

test("mind maps reject cycles, disconnected concepts and duplicate ids; diagrams allow connected cycles", () => {
  validateArtifact(studyArtifactSchema.parse(heartMap));
  assert.throws(() => validateArtifact({ ...heartMap, nodes: [...heartMap.nodes, heartMap.nodes[0]] }));
  assert.throws(() => validateArtifact({ ...heartMap, edges: heartMap.edges.slice(1) }));
  const cyclic = { ...heartMap, edges: [...heartMap.edges, { id: "cycle", source: "av", target: "heart", label: "" }] };
  assert.throws(() => validateArtifact(cyclic));
  validateArtifact({ ...cyclic, kind: "diagram" });
  assert.equal(studyArtifactSchema.safeParse({ ...heartMap, nodes: [{ ...heartMap.nodes[0], label: "" }] }).success, false);
});

test("layouts place both sides of a mind map, respect saved positions and lay out cyclic diagrams", () => {
  const positions = graphPositions(heartMap);
  assert.equal(positions.size, heartMap.nodes.length);
  assert.ok([...positions.values()].some(point => point.x < 0));
  assert.ok([...positions.values()].some(point => point.x > 0));
  assert.deepEqual(graphPositions({ ...heartMap, layout: [{ id: "heart", x: 42, y: 27 }] }).get("heart"), { x: 42, y: 27 });
  assert.equal(graphPositions({ ...heartMap, kind: "diagram" }).size, heartMap.nodes.length);
});

test("SVG export escapes generated or edited labels instead of interpreting markup", () => {
  const svg = graphSvg({ ...heartMap, title: '<script>alert("x")</script>', nodes: heartMap.nodes.map(node => ({ ...node, label: "<img onload=alert(1)>" })) });
  assert.ok(!svg.includes("<script>")); assert.ok(!svg.includes("<img"));
  assert.ok(svg.includes("&lt;script&gt;")); assert.ok(svg.includes("&lt;img"));
});
