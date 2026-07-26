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
  const userKey = sessionUserKey(status, session);

  useEffect(() => {
    if (status !== "authenticated" || warmedUserKey.current === userKey) return;
    warmedUserKey.current = userKey;
    void prefetchAppData(queryClient);
  }, [status, queryClient, userKey]);

  return null;
}
