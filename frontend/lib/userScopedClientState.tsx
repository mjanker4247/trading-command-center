"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { clearLastPortfolioId } from "@/lib/portfolioSelection";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/sessionUserKey";

export { sessionUserKey } from "@/lib/sessionUserKey";

export function resetUserScopedClientState(queryClient: QueryClient): void {
  resetPortfolioPrefetchState();
  void queryClient.cancelQueries();
  queryClient.clear();
  clearLastPortfolioId();
}

export function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const lastUserKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const nextUserKey = status === "authenticated" ? sessionUserKey(session) : null;
    if (lastUserKey.current === undefined) {
      lastUserKey.current = nextUserKey;
      return;
    }
    if (lastUserKey.current === nextUserKey) return;

    resetUserScopedClientState(queryClient);
    lastUserKey.current = nextUserKey;
  }, [queryClient, session, status]);

  return null;
}
