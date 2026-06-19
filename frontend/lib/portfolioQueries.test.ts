import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioSyncQueryKeys } from "./portfolioQueries";

test("buildPortfolioSyncQueryKeys includes holdings enrichment keys", () => {
  const keys = buildPortfolioSyncQueryKeys({
    portfolioId: "p1",
    activeTab: "holdings",
    markovEnabled: true,
    waveEnabled: true,
  });

  assert.deepEqual(keys, [
    ["portfolios"],
    ["portfolio-current", "p1"],
    ["portfolio-fundamentals", "p1"],
    ["behavioralAlerts", "p1"],
    ["portfolio-regime", "p1"],
    ["portfolio-trim-signals", "p1"],
    ["portfolio-wave", "p1"],
  ]);
});

test("buildPortfolioSyncQueryKeys adds tab-specific keys", () => {
  const keys = buildPortfolioSyncQueryKeys({
    portfolioId: "p1",
    activeTab: "insights",
    markovEnabled: false,
    waveEnabled: false,
  });

  assert.deepEqual(keys, [
    ["portfolios"],
    ["portfolio-current", "p1"],
    ["portfolio-fundamentals", "p1"],
    ["behavioralAlerts", "p1"],
    ["insight-latest", "p1"],
    ["insights-list", "p1"],
  ]);
});
