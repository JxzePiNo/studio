import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { retryAnalysis } from "../lib/analysis-retry";
import { ApiResponseError, readApiResponse } from "../lib/api-response";
import { retryableAnalysisError } from "../lib/openai";

test("analysis recovers after temporary failures, with three attempts and increasing delays", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await retryAnalysis(async () => {
    if (++calls < 3) throw new ApiResponseError("Temporary", 502, "/analyze");
    return "saved";
  }, { wait: async ms => { delays.push(ms); } });
  assert.equal(result, "saved"); assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 5000]);
});

test("analysis exhausts its attempts and preserves the final error", async () => {
  let calls = 0;
  const failure = new TypeError("fetch failed");
  await assert.rejects(retryAnalysis(async () => { calls++; throw failure; }, { wait: async () => {} }), error => error === failure);
  assert.equal(calls, 3);
});

test("permanent API failures, explicit refusals and cancellation are not retried", async () => {
  for (const status of [400, 401, 403, 413, 502]) {
    let calls = 0;
    await assert.rejects(retryAnalysis(async () => {
      calls++;
      return readApiResponse(new Response(JSON.stringify({ error: "Permanent", retryable: false }), { status }));
    }, { wait: async () => {} }));
    assert.equal(calls, 1);
  }
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(retryAnalysis(async () => { calls++; throw new TypeError("Network"); }, {
    signal: controller.signal, wait: async () => { controller.abort(); },
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  for (const status of [400, 401, 403, 404]) {
    assert.equal(retryableAnalysisError(new OpenAI.APIError(status, {}, "error", new Headers())), false);
  }
  assert.equal(retryableAnalysisError(new OpenAI.APIError(429, { code: "insufficient_quota" }, "quota", new Headers())), false);
  assert.equal(retryableAnalysisError(new OpenAI.APIError(503, {}, "temporary", new Headers())), true);
  assert.equal(retryableAnalysisError({ retryable: false }), false);
});
