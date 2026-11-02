import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessEarningsPricedIn,
  assessMacroPricedIn,
  normalizeRatioToScore,
  statusFromScore,
  PRICED_IN_FULL_MIN,
  PRICED_IN_PARTIAL_MIN,
} from "./pricedInEngine";

test("statusFromScore thresholds", () => {
  assert.equal(statusFromScore(0), "unpriced");
  assert.equal(statusFromScore(PRICED_IN_PARTIAL_MIN - 1), "unpriced");
  assert.equal(statusFromScore(PRICED_IN_PARTIAL_MIN), "partially");
  assert.equal(statusFromScore(79), "partially");
  assert.equal(statusFromScore(PRICED_IN_FULL_MIN), "fully");
  assert.equal(statusFromScore(100), "fully");
});

test("normalizeRatioToScore boundaries", () => {
  assert.equal(normalizeRatioToScore(0), 0);
  assert.equal(normalizeRatioToScore(0.5), 50);
  assert.equal(normalizeRatioToScore(1), 100);
  assert.equal(normalizeRatioToScore(2), 100);
  assert.equal(normalizeRatioToScore(Number.NaN), 0);
});

test("macro: equal rates → score 0 unpriced", () => {
  const a = assessMacroPricedIn({
    symbol: "FED",
    currentRate: 0.05,
    impliedRate: 0.05,
    stepSize: 0.0025,
  });
  assert.ok(a);
  assert.equal(a!.score, 0);
  assert.equal(a!.status, "unpriced");
  assert.equal(a!.metrics.eventProbability, 0);
});

test("macro: full step → score 100 fully", () => {
  const a = assessMacroPricedIn({
    symbol: "FED",
    currentRate: 0.05,
    impliedRate: 0.0525,
    stepSize: 0.0025,
  });
  assert.ok(a);
  assert.equal(a!.score, 100);
  assert.equal(a!.status, "fully");
});

test("macro: half step → score 50 partially", () => {
  const a = assessMacroPricedIn({
    symbol: "FED",
    currentRate: 0.05,
    impliedRate: 0.05125,
    stepSize: 0.0025,
  });
  assert.ok(a);
  assert.equal(a!.score, 50);
  assert.equal(a!.status, "partially");
});

test("macro: step_size <= 0 → null", () => {
  assert.equal(
    assessMacroPricedIn({
      symbol: "FED",
      currentRate: 0.05,
      impliedRate: 0.0525,
      stepSize: 0,
    }),
    null,
  );
  assert.equal(
    assessMacroPricedIn({
      symbol: "FED",
      currentRate: 0.05,
      impliedRate: 0.0525,
      stepSize: -0.0025,
    }),
    null,
  );
});

test("earnings: ratio 1.0 → score 100", () => {
  // ((c+p)*0.85)/S0*100 = hist → ratio 1
  // pick S0=100, hist=4.25 → need (c+p)*0.85 = 4.25 → c+p = 5
  const a = assessEarningsPricedIn({
    symbol: "AAPL",
    spot: 100,
    atmCall: 2.5,
    atmPut: 2.5,
    historicalAvgMovePct: 4.25,
  });
  assert.ok(a);
  assert.equal(a!.score, 100);
  assert.equal(a!.status, "fully");
  assert.equal(a!.metrics.impliedMovePct, 4.3); // round1 of 4.25
});

test("earnings: ratio 0.5 → score 50", () => {
  const a = assessEarningsPricedIn({
    symbol: "AAPL",
    spot: 100,
    atmCall: 1.25,
    atmPut: 1.25,
    historicalAvgMovePct: 4.25,
  });
  assert.ok(a);
  assert.equal(a!.score, 50);
  assert.equal(a!.status, "partially");
});

test("earnings: zero straddle → score 0", () => {
  const a = assessEarningsPricedIn({
    symbol: "AAPL",
    spot: 100,
    atmCall: 0,
    atmPut: 0,
    historicalAvgMovePct: 4,
  });
  assert.ok(a);
  assert.equal(a!.score, 0);
  assert.equal(a!.status, "unpriced");
});

test("earnings: historicalAvgMovePct <= 0 → null", () => {
  assert.equal(
    assessEarningsPricedIn({
      symbol: "AAPL",
      spot: 100,
      atmCall: 2,
      atmPut: 2,
      historicalAvgMovePct: 0,
    }),
    null,
  );
});

test("earnings: missing option leg → null", () => {
  assert.equal(
    assessEarningsPricedIn({
      symbol: "AAPL",
      spot: 100,
      atmCall: 2,
      atmPut: null,
      historicalAvgMovePct: 4,
    }),
    null,
  );
  assert.equal(
    assessEarningsPricedIn({
      symbol: "AAPL",
      spot: 100,
      atmCall: undefined,
      atmPut: 2,
      historicalAvgMovePct: 4,
    }),
    null,
  );
});

test("earnings: S0 <= 0 → null", () => {
  assert.equal(
    assessEarningsPricedIn({
      symbol: "AAPL",
      spot: 0,
      atmCall: 2,
      atmPut: 2,
      historicalAvgMovePct: 4,
    }),
    null,
  );
});
