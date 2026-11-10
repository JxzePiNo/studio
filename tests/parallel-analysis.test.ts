import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { parallelPageRounds, runParallelFiles } from "../lib/parallel-analysis";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("file workers stay within the limit and start queued files as slots become free", async () => {
  const gates = Array.from({ length: 4 }, deferred);
  const started: number[] = [];
  let active = 0; let maximum = 0;
  const running = runParallelFiles([0, 1, 2, 3], 2, async index => {
    started.push(index); maximum = Math.max(maximum, ++active);
    await gates[index].promise; active--;
  });
  assert.deepEqual(started, [0, 1]);
  gates[0].resolve(); await setImmediate();
  assert.deepEqual(started, [0, 1, 2]);
  gates[1].resolve(); await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3]);
  gates[2].resolve(); gates[3].resolve(); await running;
  assert.equal(maximum, 2); assert.equal(active, 0);
});

test("stopping saves in-flight pages and leaves queued work untouched", async () => {
  const gate = deferred(); const saved: number[] = []; const started: number[] = [];
  let stop = false;
  const running = runParallelFiles([0, 1, 2], 2, async (index, shouldStop) => {
    started.push(index); await gate.promise; saved.push(index);
    assert.equal(shouldStop(), true);
  }, () => stop);
  stop = true; gate.resolve(); await running;
  assert.deepEqual(started, [0, 1]); assert.deepEqual(saved, [0, 1]);
});

test("an error stops new pages but waits for all active saves before rejecting", async () => {
  const failed = deferred(); const saving = deferred();
  const started: number[] = []; let saved = false; let finished = false;
  const error = new Error("Quota raggiunta");
  const running = runParallelFiles([0, 1, 2], 2, async (index, shouldStop) => {
    started.push(index);
    if (index === 0) await failed.promise;
    else { await saving.promise; saved = true; assert.equal(shouldStop(), true); }
  });
  const checked = assert.rejects(running, error).then(() => { finished = true; });
  failed.reject(error); await setImmediate();
  assert.deepEqual(started, [0, 1]); assert.equal(finished, false);
  saving.resolve(); await checked; assert.equal(saved, true);
});

test("parallel estimates account for sequential pages within each file", async () => {
  assert.equal(parallelPageRounds([3, 3], 2), 3);
  assert.equal(parallelPageRounds([10, 1, 1], 3), 10);
  assert.equal(parallelPageRounds([2, 2, 2], 2), 4);
  assert.equal(parallelPageRounds([0, 0], 3), 0);
  await assert.rejects(runParallelFiles([1], 0, async () => {}), RangeError);
  await assert.rejects(runParallelFiles([1], Infinity, async () => {}), RangeError);
});

test("automatic concurrency starts every file even beyond six and drains them all", async () => {
  const gate = deferred();
  const files = Array.from({ length: 12 }, (_, index) => index);
  const started: number[] = [];
  const completed: number[] = [];
  const running = runParallelFiles(files, files.length, async file => {
    started.push(file);
    await gate.promise;
    completed.push(file);
  });
  assert.deepEqual(started, files);
  gate.resolve();
  await running;
  assert.deepEqual(completed, files);
});

test("stopping one course leaves another course's file workers running", async () => {
  const gate = deferred();
  let stopFirst = false;
  const firstPages: number[] = [];
  const secondPages: number[] = [];
  const runCourse = (saved: number[], stop: () => boolean) => runParallelFiles([1, 2], 2, async (file, shouldStop) => {
    await gate.promise;
    saved.push(file * 10 + 1);
    if (!shouldStop()) saved.push(file * 10 + 2);
  }, stop);
  const first = runCourse(firstPages, () => stopFirst);
  const second = runCourse(secondPages, () => false);
  stopFirst = true;
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(firstPages, [11, 21]);
  assert.deepEqual(secondPages, [11, 12, 21, 22]);
});
