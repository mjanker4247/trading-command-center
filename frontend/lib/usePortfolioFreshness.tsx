"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatRelativeSeconds } from "@/lib/formatRelativeTime";
import {
  buildPortfolioPrefetchQueryKeys,
  portfolioQueryKeys,
} from "@/lib/portfolioQueries";

export interface PortfolioFreshnessOptions {
  portfolioId: string | null;
  markovEnabled: boolean;
  waveEnabled: boolean;
  isFetching: boolean;
}

function usePortfolioFreshnessLabel({
  portfolioId,
  markovEnabled,
  waveEnabled,
  isFetching,
}: PortfolioFreshnessOptions): string | null {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!portfolioId) return null;
    if (isFetching) return "Updating…";
    if (now === 0) return null;

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

    const secondsAgo = Math.floor((now - latestUpdatedAt) / 1000);
    return `Updated ${formatRelativeSeconds(secondsAgo)}`;
  }, [portfolioId, markovEnabled, waveEnabled, isFetching, queryClient, now]);
}

export function PortfolioFreshnessLabel(props: PortfolioFreshnessOptions) {
  const label = usePortfolioFreshnessLabel(props);
  if (!label) return null;

  return (
    <span
      className="text-muted text-xs whitespace-nowrap"
      title="Time since portfolio prices and enrichment data were last refreshed"
    >
      {label}
    </span>
  );
}
