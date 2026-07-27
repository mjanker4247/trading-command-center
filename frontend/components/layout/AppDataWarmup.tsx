"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/sessionUserKey";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedFor = useRef<string | null>(null);
  const userKey = sessionUserKey(status, session);

  useEffect(() => {
    if (status !== "authenticated" || !userKey || warmedFor.current === userKey) return;
    warmedFor.current = userKey;
    void prefetchAppData(queryClient);
  }, [status, queryClient, userKey]);

  return null;
}
