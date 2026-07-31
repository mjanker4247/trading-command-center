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
  const currentKey = sessionUserKey(status, session);

  useEffect(() => {
    if (status !== "authenticated" || !currentKey || warmedFor.current === currentKey) return;
    warmedFor.current = currentKey;
    void prefetchAppData(queryClient);
  }, [status, currentKey, queryClient]);

  return null;
}
