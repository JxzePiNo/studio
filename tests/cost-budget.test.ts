import test from "node:test";
import assert from "node:assert/strict";
import { costBudget, usdToEur, euroCost, eurAmount } from "../lib/cost-budget";

test("cost comparison converts with the fixed planning rate and uses the 9.99 euro reference", () => {
  assert.equal(usdToEur(10), 9.1);
  assert.match(euroCost(2.5), /2,27/);
  assert.match(eurAmount(2.999), /2,99/);
  assert.match(eurAmount(2.01), /2,01/);
  assert.match(eurAmount(0.009), /0,00/);
  assert.equal(costBudget(null), null);
  assert.equal(costBudget(0)?.fill, 0);
  assert.ok(Math.abs(costBudget(9.99)!.percent - 91) < 1e-10);
  assert.equal(costBudget(9.99 / 0.91)?.fill, 100);
  const over = costBudget(12)!;
  assert.ok(over.percent > 100);
  assert.equal(over.fill, 100);
  assert.ok(Math.abs(over.exceeded - 0.93) < 1e-10);
  assert.equal(over.tone, "high");
});
