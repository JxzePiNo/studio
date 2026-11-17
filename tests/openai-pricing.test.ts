import test from "node:test";
import assert from "node:assert/strict";
import { estimateEventCost, estimateModelCost, estimateUserCost, imageUsageDetails, usdAmount } from "../lib/openai-pricing";
import type { UsageModel, UsageSummary } from "../lib/admin-types";

const mini: UsageModel = { model: "gpt-4.1-mini", input: 1000, cached: 200, output: 300, total: 1300, calls: 1, unknown: 0 };
const summary = (models: UsageModel[]): UsageSummary => ({ models: Object.fromEntries(models.map(model => [model.model, model])), calls: models.reduce((sum, model) => sum + model.calls, 0), errors: 0, firstRecordedAt: "2026-11-17", lastRecordedAt: "2026-11-17" });
const near = (actual: number | null, expected: number) => { assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`); };

test("standard text cost subtracts cached tokens, resolves the exact snapshot and respects contract overrides", () => {
  near(estimateModelCost(mini).usd, 0.00082);
  near(estimateModelCost({ ...mini, model: "gpt-4.1-mini-2025-04-14" }).usd, 0.00082);
  near(estimateModelCost(mini, { "gpt-4.1-mini": { input: 2, cached: 1, output: 8 } }).usd, 0.0042);
  assert.equal(estimateModelCost({ ...mini, model: "gpt-4.1-mini-future" }).usd, null);
  assert.notEqual(usdAmount(0.0000004), usdAmount(0), "tiny paid calls must not appear free");
});

test("image cost uses separate modalities and no cache discount for direct Images API calls", () => {
  const image = { ...mini, model: "gpt-image-2", input: 300, textInput: 100, imageInput: 200, output: 1000, detailedCalls: 1 };
  const estimate = estimateModelCost(image);
  near(estimate.usd, 0.0321);
  assert.equal(estimate.complete, true);
  near(estimateModelCost({ ...image, cached: 300 }, { "gpt-image-2": { input: 0, cached: 0, output: 0 } }).usd, 0.0321);
  const legacy = estimateModelCost({ ...mini, model: "gpt-image-2", output: 1000 });
  near(legacy.usd, 0.03);
  assert.equal(legacy.complete, false);
  assert.equal(legacy.unpricedCalls, 1);
});

test("per-user totals distinguish unmeasured calls, unknown models, partial costs and real zero usage", () => {
  const unknown = { ...mini, model: "unknown-model" };
  const total = estimateUserCost(summary([mini, unknown]));
  near(total.usd, 0.00082);
  assert.equal(total.complete, false);
  assert.equal(total.unpricedCalls, 1);
  assert.equal(estimateUserCost(null).usd, null);
  assert.equal(estimateModelCost({ ...mini, input: 0, output: 0, cached: 0, unknown: 1 }).usd, null);
  assert.equal(estimateModelCost({ ...mini, input: 0, output: 0, cached: 0 }).usd, 0);
  const interrupted = estimateModelCost({ ...mini, calls: 2, unknown: 1 });
  near(interrupted.usd, 0.00082);
  assert.equal(interrupted.complete, false);
});

test("image modality details are preserved only when measured and internally consistent", () => {
  assert.deepEqual(imageUsageDetails({ input_tokens: 30, input_tokens_details: { text_tokens: 10, image_tokens: 20 } }), { textInput: 10, imageInput: 20 });
  assert.equal(imageUsageDetails({ input_tokens: 30, input_tokens_details: { text_tokens: 10 } }), undefined);
  assert.equal(imageUsageDetails({ input_tokens: 30, input_tokens_details: { text_tokens: 10, image_tokens: -20 } }), undefined);
  assert.equal(imageUsageDetails({ input_tokens: 30, input_tokens_details: { text_tokens: 10, image_tokens: 30 } }), undefined);
  assert.equal(imageUsageDetails(null), undefined);
  const event = { ...mini, id: "request", feature: "chat", measured: true, status: "incomplete", durationMs: 500, at: "2026-11-17" };
  near(estimateEventCost(event).usd, 0.00082);
  assert.equal(estimateEventCost({ ...event, measured: false }).usd, null);
});
