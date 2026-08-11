import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionUserKey } from "./sessionUserKey";

test("sessionUserKey prefers stable user id", () => {
  assert.equal(
    sessionUserKey({ user: { id: "user-1", email: "user@example.com" } }),
    "user-1"
  );
});

test("sessionUserKey falls back to email when id is unavailable", () => {
  assert.equal(sessionUserKey({ user: { email: "user@example.com" } }), "user@example.com");
});

test("sessionUserKey returns null for missing user identity", () => {
  assert.equal(sessionUserKey({ user: {} }), null);
  assert.equal(sessionUserKey(null), null);
});
