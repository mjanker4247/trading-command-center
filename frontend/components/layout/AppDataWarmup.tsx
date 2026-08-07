"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedForUser = useRef<string | null>(null);

  useEffect(() => {
    const userKey = status === "authenticated" ? sessionUserKey(session) : null;
    if (!userKey || warmedForUser.current === userKey) return;
    warmedForUser.current = userKey;
    void prefetchAppData(queryClient);
  }, [session, status, queryClient]);

  return null;
}
