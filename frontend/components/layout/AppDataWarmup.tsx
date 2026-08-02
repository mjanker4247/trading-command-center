"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { resetUserScopedClientState, sessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedUserKey = useRef<string | null>(null);
  const currentUserKey = sessionUserKey(session);

  useEffect(() => {
    if (status !== "authenticated") {
      if (warmedUserKey.current !== null) {
        resetUserScopedClientState(queryClient);
        warmedUserKey.current = null;
      }
      return;
    }

    if (!currentUserKey || warmedUserKey.current === currentUserKey) return;
    resetUserScopedClientState(queryClient);
    warmedUserKey.current = currentUserKey;
    void prefetchAppData(queryClient);
  }, [currentUserKey, status, queryClient]);

  return null;
}
