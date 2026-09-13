"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/sessionUserKey";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedUserKey = useRef<string | null>(null);

  useEffect(() => {
    const currentUserKey = status === "authenticated" ? sessionUserKey(session) : null;
    if (!currentUserKey || warmedUserKey.current === currentUserKey) return;
    warmedUserKey.current = currentUserKey;
    void prefetchAppData(queryClient);
  }, [session, status, queryClient]);

  return null;
}
