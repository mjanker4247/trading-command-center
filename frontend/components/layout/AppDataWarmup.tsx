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
  const currentUserKey = status === "authenticated" ? sessionUserKey(session) : null;

  useEffect(() => {
    if (!currentUserKey || warmedUserKey.current === currentUserKey) return;
    warmedUserKey.current = currentUserKey;
    void prefetchAppData(queryClient);
  }, [currentUserKey, queryClient]);

  return null;
}
