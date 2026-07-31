"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { resetUserScopedClientState, sessionUserKey } from "@/lib/userScopedClientState";

export function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const currentKey = sessionUserKey(status, session);
  const previousKey = useRef<string | null>(null);

  useEffect(() => {
    if (!currentKey) return;
    if (previousKey.current === null) {
      previousKey.current = currentKey;
      return;
    }
    if (previousKey.current !== currentKey) {
      resetUserScopedClientState(queryClient);
      previousKey.current = currentKey;
    }
  }, [currentKey, queryClient]);

  return null;
}
