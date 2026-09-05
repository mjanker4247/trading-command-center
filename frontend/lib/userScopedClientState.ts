import type { QueryClient } from "@tanstack/react-query";
import { clearLastPortfolioId } from "./portfolioSelection";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null | undefined;

let activeSessionUserKey: string | null | undefined;
let generation = 0;

export function sessionUserKey(session: SessionLike, status: string): string | null {
  if (status !== "authenticated") return null;
  return session?.user?.id ?? session?.user?.email ?? null;
}

export function getUserScopedGeneration(): number {
  return generation;
}

export function isCurrentUserScopedGeneration(value: number): boolean {
  return value === generation;
}

export function resetUserScopedClientState(queryClient: QueryClient, nextUserKey: string | null): void {
  if (activeSessionUserKey === nextUserKey) return;
  activeSessionUserKey = nextUserKey;
  generation += 1;
  clearLastPortfolioId();
  void queryClient.cancelQueries();
  queryClient.clear();
}
