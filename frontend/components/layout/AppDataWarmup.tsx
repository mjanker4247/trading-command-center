"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      warmedFor.current = null;
      return;
    }

    const userKey = sessionUserKey(session);
    if (!userKey || warmedFor.current === userKey) return;
    warmedFor.current = userKey;
    void prefetchAppData(queryClient);
  }, [session, status, queryClient]);

  return null;
}
