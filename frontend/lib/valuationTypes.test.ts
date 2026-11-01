import { test } from "node:test";
import assert from "node:assert/strict";
import { latestFairDelta, type ValuationCorridorBlock } from "./valuationTypes";

test("latestFairDelta uses last fair point", () => {
  const block: ValuationCorridorBlock = {
    points: [
      { date: "2020-12-31", fair: 100, price: 90 },
      { date: "2021-12-31", fair: 120, price: 150 },
    ],
  };
  const { fair, pct } = latestFairDelta(block, 150);
  assert.equal(fair, 120);
  assert.ok(pct != null && pct > 0);
});

test("latestFairDelta null when missing", () => {
  assert.deepEqual(latestFairDelta(undefined, 100), { fair: null, pct: null });
  assert.deepEqual(latestFairDelta({ points: [] }, null), { fair: null, pct: null });
});
