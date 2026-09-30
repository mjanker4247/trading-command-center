import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { clearLastPortfolioId } from "@/lib/portfolioSelection";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

export function sessionUserKey(session: Session | null): string | null {
  if (!session?.user) return null;
  return (session.user as { id?: string }).id ?? session.user.email ?? null;
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  resetPortfolioPrefetchState();
  void queryClient.cancelQueries();
  queryClient.clear();
  clearLastPortfolioId();
}
