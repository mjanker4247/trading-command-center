"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { getSessionUserKey } from "@/lib/userScopedClientState";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedUserKey = useRef<string | null>(null);

  useEffect(() => {
    const userKey = getSessionUserKey(status, session);
    if (!userKey || userKey === "signed-out" || warmedUserKey.current === userKey) return;
    warmedUserKey.current = userKey;
    void prefetchAppData(queryClient);
  }, [status, session, queryClient]);

  return null;
}
