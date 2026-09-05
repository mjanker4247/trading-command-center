import { test } from "node:test";
import assert from "node:assert/strict";
import { clearLastPortfolioId, resolvePortfolioId, setLastPortfolioId } from "./portfolioSelection";

const portfolios = [{ id: "a" }, { id: "b" }];

test("resolvePortfolioId returns null for empty list", () => {
  assert.equal(resolvePortfolioId([], "a"), null);
});

test("resolvePortfolioId prefers valid preferred id", () => {
  assert.equal(resolvePortfolioId(portfolios, "b"), "b");
});

test("resolvePortfolioId falls back to first portfolio when preferred is stale", () => {
  assert.equal(resolvePortfolioId(portfolios, "missing"), "a");
});

test("resolvePortfolioId falls back to first portfolio when preferred is null", () => {
  assert.equal(resolvePortfolioId(portfolios, null), "a");
});

test("clearLastPortfolioId removes the remembered portfolio", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });

  setLastPortfolioId("p1");
  assert.equal(storage.get("agentfloor:last-portfolio-id"), "p1");

  clearLastPortfolioId();
  assert.equal(storage.has("agentfloor:last-portfolio-id"), false);

  delete (globalThis as { window?: Window & typeof globalThis }).window;
  delete (globalThis as { localStorage?: Storage }).localStorage;
});
