import type { QueryClient } from "@tanstack/react-query";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

type SessionLike = {
  accessToken?: string;
  user?: {
    email?: string | null;
  } | null;
} | null | undefined;

export function sessionUserKey(session: SessionLike): string | null {
  if (!session) return null;
  if (typeof session.accessToken === "string" && session.accessToken) {
    return `token:${session.accessToken}`;
  }

  const email = session.user?.email?.trim().toLowerCase();
  return email ? `email:${email}` : null;
}

export async function resetUserScopedClientState(queryClient: QueryClient): Promise<void> {
  resetPortfolioPrefetchState();
  await queryClient.cancelQueries();
  queryClient.clear();
}
