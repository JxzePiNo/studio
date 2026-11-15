import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getTonyTours, saveTonyTour } from "../lib/tony-tour-store";
import { normalizeTourSeen } from "../lib/tony-tours";
import { positionTourPanel } from "../lib/tour-position";
import { PATCH } from "../app/api/tours/route";

test("existing accounts with no tour flags receive three unseen tours without changing their profile", async t => {
  const previous = process.env.DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-tours-")); process.env.DATA_DIR = directory;
  t.after(async () => { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); });
  const profile = { studyProgram: "Matematica", onboardingCompleted: true, nickname: "tony", university: "Roma" };
  await writeFile(path.join(directory, "profile.json"), JSON.stringify(profile));
  assert.deepEqual(await getTonyTours(), { home: false, course: false, reader: false });
  await Promise.all([saveTonyTour("home", true), saveTonyTour("course", true)]);
  assert.deepEqual(await getTonyTours(), { home: true, course: true, reader: false });
  await saveTonyTour("reader", true);
  await saveTonyTour("course", false);
  assert.deepEqual(await getTonyTours(), { home: true, course: false, reader: true });
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "profile.json"), "utf8")), profile);
  const patch = (body: unknown) => PATCH(new Request("http://localhost/api/tours", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await patch({ section: "unknown", seen: true })).status, 400);
  assert.equal((await patch({ section: "reader", seen: "true" })).status, 400);
  assert.equal((await patch({ section: "reader", seen: true, uid: "other" })).status, 400);
  assert.equal((await patch({ section: "course", seen: true })).status, 200);
  assert.equal((await getTonyTours()).course, true);
});

test("missing and malformed stored flags are never interpreted as completed tours", () => {
  assert.deepEqual(normalizeTourSeen({ home: true, course: "true", reader: 1 }), { home: true, course: false, reader: false });
  assert.deepEqual(normalizeTourSeen(undefined), { home: false, course: false, reader: false });
});

test("Tony stays near the target and inside desktop and mobile viewports", () => {
  for (const width of [390, 1280]) {
    const viewport = { width, height: 844 }, panel = { width: Math.min(430, width - 24), height: 260 };
    for (const target of [null, { left: 12, top: 10, width: 40, height: 40 }, { left: width - 60, top: 780, width: 40, height: 40 }, { left: 0, top: 80, width, height: 730 }]) {
      const position = positionTourPanel(target, panel, viewport);
      assert.ok(position.left >= 12 && position.top >= 12);
      assert.ok(position.left + panel.width <= width - 12);
      assert.ok(position.top + panel.height <= 844 - 12);
    }
  }
});
