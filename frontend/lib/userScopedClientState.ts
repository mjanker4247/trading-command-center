"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { clearLastPortfolioId } from "@/lib/portfolioSelection";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

function sessionUserKey(status: string, email?: string | null): string | null {
  if (status !== "authenticated") return null;
  return email ?? "__authenticated__";
}

export function resetUserScopedClientState(queryClient: QueryClient) {
  resetPortfolioPrefetchState();
  void queryClient.cancelQueries();
  queryClient.clear();
  clearLastPortfolioId();
}

export function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousUserKey = useRef<string | null | undefined>(undefined);
  const currentUserKey = sessionUserKey(status, session?.user?.email);

  useEffect(() => {
    if (previousUserKey.current === undefined) {
      previousUserKey.current = currentUserKey;
      return;
    }
    if (previousUserKey.current === currentUserKey) return;

    previousUserKey.current = currentUserKey;
    resetUserScopedClientState(queryClient);
  }, [currentUserKey, queryClient]);

  return null;
}
