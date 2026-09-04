"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/prefetchPortfolioData";

export function AppDataWarmup() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const warmedFor = useRef<string | null>(null);
  const userKey = status === "authenticated" ? session?.user?.email ?? "__authenticated__" : null;

  useEffect(() => {
    if (!userKey) {
      warmedFor.current = null;
      return;
    }
    if (warmedFor.current === userKey) return;
    warmedFor.current = userKey;
    void prefetchAppData(queryClient);
  }, [userKey, queryClient]);

  return null;
}
