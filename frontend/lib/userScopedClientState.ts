import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { clearLastPortfolioId } from "@/lib/portfolioSelection";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

type SessionWithUserId = Session & {
  user?: Session["user"] & { id?: string | null };
};

export function sessionUserKey(session: Session | null | undefined): string | null {
  const user = (session as SessionWithUserId | null | undefined)?.user;
  return user?.id ?? user?.email ?? null;
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
  resetPortfolioPrefetchState();
  clearLastPortfolioId();
}
