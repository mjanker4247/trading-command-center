"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { getUserScopedGeneration, sessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedFor = useRef<string | null>(null);
  const userKey = sessionUserKey(session, status);

  useEffect(() => {
    if (status !== "authenticated" || !userKey) {
      warmedFor.current = null;
      return;
    }
    if (warmedFor.current === userKey) return;
    warmedFor.current = userKey;
    queueMicrotask(() => {
      void prefetchAppData(queryClient, getUserScopedGeneration());
    });
  }, [status, queryClient, userKey]);

  return null;
}
