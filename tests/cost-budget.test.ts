import test from "node:test";
import assert from "node:assert/strict";
import { costBudget, usdToEur, euroCost } from "../lib/cost-budget";

test("cost comparison converts with the fixed planning rate and uses the 9.99 euro reference", () => {
  assert.equal(usdToEur(10), 10);
  assert.match(euroCost(2.5), /2,50/);
  assert.equal(costBudget(null), null);
  assert.equal(costBudget(0)?.fill, 0);
  assert.equal(costBudget(9.99)?.percent, 100);
  assert.equal(costBudget(9.99)?.fill, 100);
  const over = costBudget(12)!;
  assert.ok(over.percent > 100);
  assert.equal(over.fill, 100);
  assert.ok(Math.abs(over.exceeded - 2.01) < 1e-10);
  assert.equal(over.tone, "high");
});
