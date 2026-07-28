import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionUserKey, shouldResetUserScopedState } from "./userScopedClientState";

test("sessionUserKey returns stable authenticated principal", () => {
  assert.equal(sessionUserKey("loading", null), undefined);
  assert.equal(sessionUserKey("unauthenticated", null), null);
  assert.equal(sessionUserKey("authenticated", { user: { id: "u1", email: "a@example.com" } }), "u1");
  assert.equal(sessionUserKey("authenticated", { user: { email: "a@example.com" } }), "a@example.com");
});

test("shouldResetUserScopedState only resets across known principal changes", () => {
  assert.equal(shouldResetUserScopedState(undefined, "u1"), false);
  assert.equal(shouldResetUserScopedState("u1", undefined), false);
  assert.equal(shouldResetUserScopedState("u1", "u1"), false);
  assert.equal(shouldResetUserScopedState("u1", null), true);
  assert.equal(shouldResetUserScopedState(null, "u2"), true);
  assert.equal(shouldResetUserScopedState("u1", "u2"), true);
});
