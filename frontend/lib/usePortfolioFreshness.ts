"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatRelativeSeconds } from "@/lib/formatRelativeTime";
import {
  buildPortfolioPrefetchQueryKeys,
  portfolioQueryKeys,
} from "@/lib/portfolioQueries";

interface UsePortfolioFreshnessOptions {
  portfolioId: string | null;
  markovEnabled: boolean;
  waveEnabled: boolean;
  isFetching: boolean;
}

export function usePortfolioFreshness({
  portfolioId,
  markovEnabled,
  waveEnabled,
  isFetching,
}: UsePortfolioFreshnessOptions): string | null {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!portfolioId) return null;
    if (isFetching) return "Updating…";

    const queryKeys = buildPortfolioPrefetchQueryKeys(portfolioId, {
      markovEnabled,
      waveEnabled,
    }).filter((key) => key !== portfolioQueryKeys.list);

    let latestUpdatedAt = 0;
    for (const queryKey of queryKeys) {
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      if (updatedAt > latestUpdatedAt) {
        latestUpdatedAt = updatedAt;
      }
    }

    if (latestUpdatedAt === 0) return null;

    const secondsAgo = Math.floor((Date.now() - latestUpdatedAt) / 1000);
    return `Updated ${formatRelativeSeconds(secondsAgo)}`;
  }, [portfolioId, markovEnabled, waveEnabled, isFetching, queryClient, tick]);
}
