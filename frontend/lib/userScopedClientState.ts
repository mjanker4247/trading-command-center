import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

export function sessionUserKey(
  status: "authenticated" | "unauthenticated" | "loading",
  session: Session | null
): string | null {
  if (status === "loading") return null;
  if (status !== "authenticated") return "signed-out";

  const user = session?.user as { id?: string | null; email?: string | null } | undefined;
  if (user?.id) return `id:${user.id}`;
  if (user?.email) return `email:${user.email}`;
  return "authenticated";
}

export function resetUserScopedClientState(queryClient: QueryClient): void {
  resetPortfolioPrefetchState();
  void queryClient.cancelQueries();
  queryClient.clear();
}
