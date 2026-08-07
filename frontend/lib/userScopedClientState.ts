"use client";

import type { QueryClient } from "@tanstack/react-query";
import { clearLastPortfolioId } from "@/lib/portfolioSelection";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null | undefined;

export function sessionUserKey(session: SessionLike): string | null {
  const user = session?.user;
  return user?.id ?? user?.email ?? null;
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
  resetPortfolioPrefetchState();
  clearLastPortfolioId();
}
