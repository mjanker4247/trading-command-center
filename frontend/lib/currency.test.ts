import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtMoney } from "./currency.ts";

test("fmtMoney formats standard ISO currencies", () => {
  assert.equal(fmtMoney(1234.56, "USD"), "$1,234.56");
  assert.equal(fmtMoney(1234.56, "JPY"), "¥1,235");
});

test("fmtMoney falls back for supported crypto quote assets", () => {
  assert.equal(fmtMoney(1234.56, "USDT"), "1,234.56 USDT");
  assert.equal(fmtMoney(1234.56, "usdc"), "1,234.56 USDC");
});
