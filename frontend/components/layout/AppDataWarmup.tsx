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

  useEffect(() => {
    if (status !== "authenticated") {
      warmedFor.current = null;
      return;
    }
    const key = sessionUserKey(session);
    if (!key || warmedFor.current === key) return;
    warmedFor.current = key;
    void prefetchAppData(queryClient);
  }, [status, session, queryClient]);

  return null;
}
