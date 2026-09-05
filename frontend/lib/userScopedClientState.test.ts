import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueryClient } from "@tanstack/react-query";
import {
  getUserScopedGeneration,
  resetUserScopedClientState,
  sessionUserKey,
} from "./userScopedClientState";

test("sessionUserKey uses stable authenticated principal", () => {
  assert.equal(sessionUserKey({ user: { id: "u1", email: "a@example.com" } }, "authenticated"), "u1");
  assert.equal(sessionUserKey({ user: { email: "a@example.com" } }, "authenticated"), "a@example.com");
  assert.equal(sessionUserKey({ user: { id: "u1" } }, "unauthenticated"), null);
});

test("resetUserScopedClientState clears only when the session principal changes", () => {
  let clears = 0;
  let cancellations = 0;
  const queryClient = {
    cancelQueries: () => {
      cancellations += 1;
      return Promise.resolve();
    },
    clear: () => {
      clears += 1;
    },
  } as unknown as QueryClient;

  const initialGeneration = getUserScopedGeneration();
  resetUserScopedClientState(queryClient, "u1");
  assert.equal(getUserScopedGeneration(), initialGeneration + 1);
  assert.equal(clears, 1);
  assert.equal(cancellations, 1);

  resetUserScopedClientState(queryClient, "u1");
  assert.equal(getUserScopedGeneration(), initialGeneration + 1);
  assert.equal(clears, 1);
  assert.equal(cancellations, 1);

  resetUserScopedClientState(queryClient, "u2");
  assert.equal(getUserScopedGeneration(), initialGeneration + 2);
  assert.equal(clears, 2);
  assert.equal(cancellations, 2);
});
