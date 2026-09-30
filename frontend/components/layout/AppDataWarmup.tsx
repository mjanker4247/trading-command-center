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

  useEffect(() => {
    if (status !== "authenticated") {
      warmedUserKey.current = null;
      return;
    }

    const currentUserKey = sessionUserKey(session);
    if (!currentUserKey || warmedUserKey.current === currentUserKey) return;
    warmedUserKey.current = currentUserKey;
    void prefetchAppData(queryClient);
  }, [session, status, queryClient]);

  return null;
}
