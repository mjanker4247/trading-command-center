"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchPortfolioData } from "@/lib/prefetchPortfolioData";
import { getSessionUserKey } from "@/lib/userSessionKey";

const PORTFOLIO_PATH = "/portfolio";

export function usePortfolioPrefetch() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return useCallback(() => {
    const userKey = status === "authenticated" ? getSessionUserKey(session) : null;
    if (pathname === PORTFOLIO_PATH || !userKey) return;
    void prefetchPortfolioData(queryClient, userKey);
  }, [pathname, queryClient, session, status]);
}
