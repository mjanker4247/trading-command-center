"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedSessionKey = useRef<string | null>(null);
  const sessionKey = status === "authenticated" ? session?.user?.email ?? "authenticated" : null;

  useEffect(() => {
    if (!sessionKey) {
      warmedSessionKey.current = null;
      return;
    }
    if (warmedSessionKey.current === sessionKey) return;
    warmedSessionKey.current = sessionKey;
    void prefetchAppData(queryClient);
  }, [sessionKey, queryClient]);

  return null;
}
