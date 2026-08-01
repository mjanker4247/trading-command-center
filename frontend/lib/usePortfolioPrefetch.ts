"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchPortfolioData } from "@/lib/prefetchPortfolioData";
import { sessionUserKey } from "@/lib/userScopedClientState";

const PORTFOLIO_PATH = "/portfolio";

export function usePortfolioPrefetch() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { data: session } = useSession();
  const userKey = sessionUserKey(session);

  return useCallback(() => {
    if (pathname === PORTFOLIO_PATH || !userKey) return;
    void prefetchPortfolioData(queryClient, userKey);
  }, [pathname, queryClient, userKey]);
}
