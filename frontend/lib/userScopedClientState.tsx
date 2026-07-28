"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { resetPortfolioPrefetchState } from "@/lib/prefetchPortfolioData";

type SessionStatus = "authenticated" | "unauthenticated" | "loading";
type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null;

export function sessionUserKey(status: SessionStatus, session: SessionLike): string | null | undefined {
  if (status === "loading") return undefined;
  if (status !== "authenticated") return null;
  return session?.user?.id ?? session?.user?.email ?? null;
}

export function shouldResetUserScopedState(
  previousKey: string | null | undefined,
  nextKey: string | null | undefined
): boolean {
  return previousKey !== undefined && nextKey !== undefined && previousKey !== nextKey;
}

export function UserScopedQueryReset() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousKeyRef = useRef<string | null | undefined>(undefined);

  const nextKey = sessionUserKey(status, session);

  useEffect(() => {
    if (nextKey === undefined) return;

    if (shouldResetUserScopedState(previousKeyRef.current, nextKey)) {
      resetPortfolioPrefetchState();
      void queryClient.cancelQueries();
      queryClient.clear();
    }

    previousKeyRef.current = nextKey;
  }, [nextKey, queryClient]);

  return null;
}
