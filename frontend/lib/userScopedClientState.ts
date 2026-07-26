import type { QueryClient } from "@tanstack/react-query";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null | undefined;

export function sessionUserKey(status: string, session: SessionLike): string {
  if (status !== "authenticated") return status;
  return session?.user?.id ?? session?.user?.email ?? "authenticated";
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  resetPortfolioPrefetchState();
  void queryClient.cancelQueries();
  queryClient.clear();
}
