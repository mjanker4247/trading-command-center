"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { clearLastPortfolioId } from "@/lib/portfolioSelection";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

export function sessionUserKey(session: Session | null): string | null {
  const user = session?.user as { id?: string; email?: string } | undefined;
  return user?.id ?? user?.email ?? null;
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  resetPortfolioPrefetchState();
  clearLastPortfolioId();
  void queryClient.cancelQueries();
  queryClient.clear();
}
