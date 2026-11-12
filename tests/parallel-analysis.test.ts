import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { parallelPageRounds, runParallelFiles, documentPageOrder, runDocumentPages, parallelDocumentRounds, documentParallelism } from "../lib/parallel-analysis";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("four page fronts meet without overlaps, including odd, tiny and cached documents", () => {
  assert.deepEqual(documentPageOrder(40).slice(0, 8), [1, 20, 21, 40, 2, 19, 22, 39]);
  assert.deepEqual(documentPageOrder(700).slice(0, 70), Array.from({ length: 70 }, (_, i) => i * 10 + 1));
  for (let pages = 0; pages <= 101; pages++) {
    const order = documentPageOrder(pages);
    assert.equal(order.length, pages);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: pages }, (_, i) => i + 1));
  }
  assert.deepEqual(documentPageOrder(8).filter(page => ![1, 4, 5, 8].includes(page)), [2, 3, 6, 7]);
  assert.equal(parallelDocumentRounds([100, 40]), 10);
  assert.equal(parallelDocumentRounds([0]), 0);
  assert.equal(documentParallelism(Array(20).fill(100)), 200, "no global cap of 16 or another arbitrary ceiling");
});

test("every document runs four pages concurrently and stop drains all active saves", async () => {
  const gate = deferred();
  let stop = false;
  const started: string[] = [], saved: string[] = [];
  const running = runParallelFiles([0, 1, 2, 3, 4, 5], 6, async id => {
    await runDocumentPages(documentPageOrder(12), async page => {
      const key = `${id}:${page}`; started.push(key);
      await gate.promise; saved.push(key);
    }, () => stop);
  });
  assert.equal(started.length, 24);
  for (let id = 0; id < 6; id++) assert.deepEqual(started.filter(key => key.startsWith(`${id}:`)), [1, 6, 7, 12].map(page => `${id}:${page}`));
  stop = true; gate.resolve(); await running;
  assert.equal(started.length, 24); assert.equal(saved.length, 24);
});

test("a 700-page PDF starts 70 pages and keeps its capacity when resuming partially cached work", async () => {
  const gate = deferred();
  const started: number[] = [], saved: number[] = [];
  let stop = false;
  const pending = documentPageOrder(700).filter(page => page % 10 !== 0);
  const running = runDocumentPages(pending, async page => { started.push(page); await gate.promise; saved.push(page); }, () => stop, 700);
  assert.equal(started.length, 70);
  assert.deepEqual(started, Array.from({ length: 70 }, (_, i) => i * 10 + 1));
  stop = true; gate.resolve(); await running;
  assert.equal(saved.length, 70);
  const resumed: number[] = [];
  const cached = new Set([...saved, ...Array.from({ length: 70 }, (_, i) => i * 10 + 10)]);
  await runDocumentPages(documentPageOrder(700).filter(page => !cached.has(page)), async page => { resumed.push(page); }, () => false, 700);
  assert.equal(resumed.length + cached.size, 700);
  assert.equal(new Set([...resumed, ...cached]).size, 700);
});

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
