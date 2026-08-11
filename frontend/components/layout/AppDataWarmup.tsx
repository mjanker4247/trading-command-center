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
    if (status !== "authenticated") {
      warmedUserKey.current = null;
      return;
    }

    const userKey = sessionUserKey(session);
    if (!userKey || warmedUserKey.current === userKey) return;
    warmedUserKey.current = userKey;
    void prefetchAppData(queryClient).catch(() => undefined);
  }, [session, status, queryClient]);

  return null;
}
