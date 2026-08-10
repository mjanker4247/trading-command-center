import { test } from "node:test";
import assert from "node:assert/strict";
import { getSessionUserKey } from "./userSessionKey";

test("getSessionUserKey prefers stable user id", () => {
  assert.equal(
    getSessionUserKey({ user: { id: "user-1", email: "user@example.com" } }),
    "user-1"
  );
});

test("getSessionUserKey falls back to email for older sessions", () => {
  assert.equal(getSessionUserKey({ user: { email: "user@example.com" } }), "user@example.com");
});

test("getSessionUserKey returns null without an identity", () => {
  assert.equal(getSessionUserKey({ user: {} }), null);
  assert.equal(getSessionUserKey(null), null);
});
