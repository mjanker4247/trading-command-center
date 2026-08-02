import { test } from "node:test";
import assert from "node:assert/strict";
import { clearLastPortfolioId, getLastPortfolioId, resolvePortfolioId, setLastPortfolioId } from "./portfolioSelection";

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
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const storage = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: fakeLocalStorage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: fakeLocalStorage,
  });

  try {
    setLastPortfolioId("p1");
    assert.equal(getLastPortfolioId(), "p1");
    clearLastPortfolioId();
    assert.equal(getLastPortfolioId(), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});
