"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { getSessionUserKey } from "@/lib/userSessionKey";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedUserKey = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      warmedUserKey.current = null;
      return;
    }
    const userKey = getSessionUserKey(session);
    if (!userKey || warmedUserKey.current === userKey) return;
    warmedUserKey.current = userKey;
    void prefetchAppData(queryClient, userKey);
  }, [session, status, queryClient]);

  return null;
}
