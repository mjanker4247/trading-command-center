"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { resetUserScopedClientState, sessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const principalRef = useRef<string | null>(null);
  const warmedForRef = useRef<string | null>(null);

  useEffect(() => {
    const principal = status === "authenticated" ? sessionUserKey(session) : null;
    if (principalRef.current !== principal) {
      resetUserScopedClientState(queryClient);
      principalRef.current = principal;
      warmedForRef.current = null;
    }
    if (!principal || warmedForRef.current === principal) return;
    warmedForRef.current = principal;
    void prefetchAppData(queryClient);
  }, [session, status, queryClient]);

  return null;
}
