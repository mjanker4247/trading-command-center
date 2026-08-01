"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedUserKey = useRef<string | null>(null);
  const userKey = sessionUserKey(session);

  useEffect(() => {
    if (status !== "authenticated" || !userKey) {
      warmedUserKey.current = null;
      return;
    }
    if (warmedUserKey.current === userKey) return;
    warmedUserKey.current = userKey;
    void prefetchAppData(queryClient, userKey);
  }, [status, queryClient, userKey]);

  return null;
}
