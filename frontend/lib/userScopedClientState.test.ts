import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { resetUserScopedClientState, sessionUserKey } from "./userScopedClientState";

test("sessionUserKey prefers stable user id", () => {
  const session = { user: { id: "user-1", email: "a@example.com" } } as unknown as Session;
  assert.equal(sessionUserKey(session), "user-1");
});

test("sessionUserKey falls back to email when id is absent", () => {
  const session = { user: { email: "a@example.com" } } as unknown as Session;
  assert.equal(sessionUserKey(session), "a@example.com");
});

test("resetUserScopedClientState cancels and clears the query client", () => {
  const calls: string[] = [];
  const queryClient = {
    cancelQueries: () => {
      calls.push("cancel");
      return Promise.resolve();
    },
    clear: () => {
      calls.push("clear");
    },
  } as unknown as QueryClient;

  resetUserScopedClientState(queryClient);

  assert.deepEqual(calls, ["cancel", "clear"]);
});
