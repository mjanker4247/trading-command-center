"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { resetUserScopedClientState, sessionUserKey } from "@/lib/userScopedClientState";

export function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousUserKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;

    const nextUserKey = status === "authenticated" ? sessionUserKey(session) : null;
    if (previousUserKey.current !== undefined && previousUserKey.current !== nextUserKey) {
      resetUserScopedClientState(queryClient);
    }
    previousUserKey.current = nextUserKey;
  }, [queryClient, session, status]);

  return null;
}
