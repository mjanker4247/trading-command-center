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
  return session?.user?.id ?? session?.user?.email ?? null;
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
  resetPortfolioPrefetchState();
  clearLastPortfolioId();
}
