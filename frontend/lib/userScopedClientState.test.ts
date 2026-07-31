import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { resetUserScopedClientState, sessionUserKey } from "./userScopedClientState";

test("sessionUserKey prefers stable user ids", () => {
  assert.equal(
    sessionUserKey("authenticated", { user: { id: "user-1", email: "a@example.com" }, expires: "" } as any),
    "id:user-1"
  );
});

test("resetUserScopedClientState clears cached query data", () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["portfolio"], [{ id: "secret-portfolio" }]);

  resetUserScopedClientState(queryClient);

  assert.equal(queryClient.getQueryData(["portfolio"]), undefined);
});
