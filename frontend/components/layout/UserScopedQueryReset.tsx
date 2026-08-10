"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";
import { getSessionUserKey } from "@/lib/userSessionKey";

export function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const userKey = status === "authenticated" ? getSessionUserKey(session) : null;
  const previousUserKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;
    if (previousUserKey.current === undefined) {
      previousUserKey.current = userKey;
      return;
    }
    if (previousUserKey.current === userKey) return;

    previousUserKey.current = userKey;
    resetPortfolioPrefetchState();
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient, status, userKey]);

  return null;
}
