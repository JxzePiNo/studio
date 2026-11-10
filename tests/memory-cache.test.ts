import assert from "node:assert/strict";
import test from "node:test";
import { MemoryCache } from "../lib/memory-cache";

test("memory cache evicts the least recently used entry at its count limit", () => {
  const cache = new MemoryCache<string>({ maxEntries: 2, maxBytes: 100, ttlMs: 1000 });
  cache.set("one", "first", 5);
  cache.set("two", "second", 6);
  assert.equal(cache.get("one"), "first");
  cache.set("three", "third", 5);
  assert.equal(cache.get("two"), undefined);
  assert.equal(cache.get("one"), "first");
  assert.equal(cache.get("three"), "third");
  assert.equal(cache.size, 2);
  assert.equal(cache.byteSize, 10);
});

test("memory cache bounds bytes and releases replaced, oversized and deleted values", () => {
  const cache = new MemoryCache<string>({ maxEntries: 10, maxBytes: 12, ttlMs: 1000 });
  cache.set("one", "first", 5);
  cache.set("two", "second", 6);
  cache.set("one", "replacement", 8);
  assert.equal(cache.get("two"), undefined);
  assert.equal(cache.byteSize, 8);
  assert.equal(cache.set("one", "too large", 13), false);
  assert.equal(cache.get("one"), undefined);
  assert.equal(cache.byteSize, 0);
  cache.set("three", "third", 4);
  assert.equal(cache.delete("three"), true);
  assert.equal(cache.delete("three"), false);
  assert.equal(cache.byteSize, 0);
  cache.set("four", "fourth", 6);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.byteSize, 0);
});

test("memory cache expires entries even when frequently read and reclaims expired bytes", () => {
  let now = 0;
  const cache = new MemoryCache<string>({ maxEntries: 2, maxBytes: 10, ttlMs: 10, now: () => now });
  cache.set("one", "first", 5);
  now = 9;
  assert.equal(cache.get("one"), "first");
  now = 10;
  assert.equal(cache.get("one"), undefined);
  assert.equal(cache.byteSize, 0);
  cache.set("two", "second", 5);
  now = 20;
  cache.set("three", "third", 5);
  assert.equal(cache.size, 1);
  assert.equal(cache.byteSize, 5);
  assert.equal(cache.get("two"), undefined);
});

test("memory cache validates limits and entry sizes", () => {
  assert.throws(() => new MemoryCache({ maxEntries: 0, maxBytes: 100, ttlMs: 1000 }), RangeError);
  assert.throws(() => new MemoryCache({ maxEntries: 1, maxBytes: Infinity, ttlMs: 1000 }), RangeError);
  assert.throws(() => new MemoryCache({ maxEntries: 1, maxBytes: 100, ttlMs: 0 }), RangeError);
  const cache = new MemoryCache({ maxEntries: 1, maxBytes: 100, ttlMs: 1000 });
  assert.throws(() => cache.set("bad", "value", NaN), RangeError);
  assert.throws(() => cache.set("bad", "value", -1), RangeError);
});
