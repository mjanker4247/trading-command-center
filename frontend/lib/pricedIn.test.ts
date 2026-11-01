import { test } from "node:test";
import assert from "node:assert/strict";
import {
  levelFromPercentage,
  levelLabel,
  mockPricedInStatus,
  resolvePricedInForEarningsEvent,
  PRICED_IN_FULL_MIN,
  PRICED_IN_PARTIAL_MIN,
} from "./pricedIn";

test("levelFromPercentage thresholds", () => {
  assert.equal(levelFromPercentage(PRICED_IN_FULL_MIN), "full");
  assert.equal(levelFromPercentage(100), "full");
  assert.equal(levelFromPercentage(PRICED_IN_PARTIAL_MIN), "partial");
  assert.equal(levelFromPercentage(69), "partial");
  assert.equal(levelFromPercentage(PRICED_IN_PARTIAL_MIN - 1), "none");
  assert.equal(levelFromPercentage(0), "none");
});

test("levelLabel covers all levels", () => {
  assert.equal(levelLabel("full"), "Fully priced-in");
  assert.equal(levelLabel("partial"), "Partially priced-in");
  assert.equal(levelLabel("none"), "Not priced-in");
});

test("mockPricedInStatus is deterministic for same ticker+date", () => {
  const a = mockPricedInStatus("aapl", "2026-11-15");
  const b = mockPricedInStatus("AAPL", "2026-11-15");
  assert.deepEqual(a, b);
  assert.equal(a.source, "mock");
  assert.equal(a.level, levelFromPercentage(a.percentage));
  assert.ok(a.percentage >= 0 && a.percentage <= 100);
});

test("mockPricedInStatus differs across dates", () => {
  const a = mockPricedInStatus("MSFT", "2026-11-01");
  const b = mockPricedInStatus("MSFT", "2026-12-01");
  // Extremely unlikely identical under hash mix; assert not deep-equal.
  assert.notDeepEqual(a, b);
});

test("resolvePricedInForEarningsEvent returns null when inputs missing", () => {
  assert.equal(resolvePricedInForEarningsEvent(null, "2026-11-01"), null);
  assert.equal(resolvePricedInForEarningsEvent("AAPL", null), null);
  assert.equal(resolvePricedInForEarningsEvent("  ", "2026-11-01"), null);
  assert.equal(resolvePricedInForEarningsEvent("AAPL", "  "), null);
});

test("resolvePricedInForEarningsEvent returns mock status", () => {
  const status = resolvePricedInForEarningsEvent("NVDA", "2026-11-20");
  assert.ok(status);
  assert.equal(status!.source, "mock");
});
