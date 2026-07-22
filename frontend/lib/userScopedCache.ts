import type { QueryClient } from "@tanstack/react-query";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

export async function resetUserScopedClientState(queryClient: QueryClient): Promise<void> {
  resetPortfolioPrefetchState();
  await queryClient.cancelQueries();
  queryClient.clear();
}
