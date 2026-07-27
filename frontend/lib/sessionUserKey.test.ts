import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionUserKey } from "./sessionUserKey";

test("sessionUserKey returns null while session is loading", () => {
  assert.equal(sessionUserKey("loading", undefined), null);
});

test("sessionUserKey prefers stable user id for authenticated sessions", () => {
  assert.equal(
    sessionUserKey("authenticated", {
      expires: "2099-01-01T00:00:00.000Z",
      accessToken: "token-a",
      user: { id: "user-1", email: "user@example.com" },
    }),
    "user-1"
  );
});

test("sessionUserKey distinguishes unauthenticated state", () => {
  assert.equal(sessionUserKey("unauthenticated", null), "unauthenticated");
});
