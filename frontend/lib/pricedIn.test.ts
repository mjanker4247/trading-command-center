import { test } from "node:test";
import assert from "node:assert/strict";
import {
  levelFromPercentage,
  levelLabel,
  mockPricedInStatus,
  resolvePricedInForEarningsEvent,
  scorePricedInPercentage,
  PRICED_IN_FULL_MIN,
  PRICED_IN_PARTIAL_MIN,
  type PricedInMetrics,
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

test("scorePricedInPercentage rises with IV and move ratio", () => {
  const soft: PricedInMetrics = {
    ivPercentile: 20,
    impliedMovePct: 4,
    historicalMovePct: 8,
    moveRatio: 0.5,
    consensusTargetDistancePct: 10,
    optionsSkew: "near-flat",
  };
  const hot: PricedInMetrics = {
    ivPercentile: 90,
    impliedMovePct: 16,
    historicalMovePct: 8,
    moveRatio: 2,
    consensusTargetDistancePct: 1,
    optionsSkew: "put-heavy",
  };
  assert.ok(scorePricedInPercentage(hot) > scorePricedInPercentage(soft));
  assert.equal(
    mockPricedInStatus("TEST", "2099-01-01").percentage,
    scorePricedInPercentage(mockPricedInStatus("TEST", "2099-01-01").metrics),
  );
});

test("mockPricedInStatus percentage matches composed metrics", () => {
  const status = mockPricedInStatus("AAPL", "2026-11-15");
  assert.equal(status.percentage, scorePricedInPercentage(status.metrics));
  assert.equal(status.level, levelFromPercentage(status.percentage));
  assert.ok(status.metrics.moveRatio > 0);
  assert.ok(status.metrics.impliedMovePct > 0);
  assert.ok(status.metrics.historicalMovePct > 0);
});

test("mockPricedInStatus is deterministic for same ticker+date", () => {
  const a = mockPricedInStatus("aapl", "2026-11-15");
  const b = mockPricedInStatus("AAPL", "2026-11-15");
  assert.deepEqual(a, b);
  assert.equal(a.source, "mock");
});

test("mockPricedInStatus differs across dates", () => {
  const a = mockPricedInStatus("MSFT", "2026-11-01");
  const b = mockPricedInStatus("MSFT", "2026-12-01");
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
