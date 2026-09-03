import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

export function sessionUserKey(session: Session | null | undefined): string | null {
  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  return user?.id ?? user?.email ?? null;
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  resetPortfolioPrefetchState();
  void queryClient.cancelQueries();
  queryClient.clear();
}
