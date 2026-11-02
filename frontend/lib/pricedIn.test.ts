import { test } from "node:test";
import assert from "node:assert/strict";
import {
  levelFromPercentage,
  levelLabel,
  resolveEarningsPricedIn,
  resolvePricedInForEarningsEvent,
  mockEarningsEngineInput,
  PRICED_IN_FULL_MIN,
  PRICED_IN_PARTIAL_MIN,
} from "./pricedIn";
import { assessEarningsPricedIn } from "./pricedInEngine";

test("levelFromPercentage thresholds match engine (≥80 fully)", () => {
  assert.equal(levelFromPercentage(PRICED_IN_FULL_MIN), "full");
  assert.equal(levelFromPercentage(100), "full");
  assert.equal(levelFromPercentage(PRICED_IN_PARTIAL_MIN), "partial");
  assert.equal(levelFromPercentage(79), "partial");
  assert.equal(levelFromPercentage(PRICED_IN_PARTIAL_MIN - 1), "none");
});

test("levelLabel covers legacy and new status names", () => {
  assert.equal(levelLabel("full"), "Fully Priced-In");
  assert.equal(levelLabel("fully"), "Fully Priced-In");
  assert.equal(levelLabel("partial"), "Partially Priced-In");
  assert.equal(levelLabel("none"), "Unpriced / High Asymmetry");
  assert.equal(levelLabel("unpriced"), "Unpriced / High Asymmetry");
});

test("fixture input feeds earnings engine deterministically", () => {
  const input = mockEarningsEngineInput("AAPL", "2026-11-15");
  const a = assessEarningsPricedIn(input);
  const b = resolveEarningsPricedIn("aapl", "2026-11-15");
  assert.ok(a);
  assert.deepEqual(a, b);
  assert.equal(a!.eventType, "earnings");
  assert.ok(a!.score >= 0 && a!.score <= 100);
});

test("resolveEarningsPricedIn is deterministic for same ticker+date", () => {
  const a = resolveEarningsPricedIn("aapl", "2026-11-15");
  const b = resolveEarningsPricedIn("AAPL", "2026-11-15");
  assert.deepEqual(a, b);
});

test("resolveEarningsPricedIn differs across dates", () => {
  const a = resolveEarningsPricedIn("MSFT", "2026-11-01");
  const b = resolveEarningsPricedIn("MSFT", "2026-12-01");
  assert.notDeepEqual(a, b);
});

test("resolvePricedInForEarningsEvent returns null when inputs missing", () => {
  assert.equal(resolvePricedInForEarningsEvent(null, "2026-11-01"), null);
  assert.equal(resolvePricedInForEarningsEvent("AAPL", null), null);
  assert.equal(resolvePricedInForEarningsEvent("  ", "2026-11-01"), null);
});

test("legacy alias resolvePricedInForEarningsEvent matches resolveEarningsPricedIn", () => {
  const a = resolvePricedInForEarningsEvent("NVDA", "2026-11-20");
  const b = resolveEarningsPricedIn("NVDA", "2026-11-20");
  assert.deepEqual(a, b);
});
