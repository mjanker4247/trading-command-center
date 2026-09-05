import type { QueryClient } from "@tanstack/react-query";
import {
  listPortfolios,
  getPortfolioCurrent,
  getPortfolioFundamentals,
  getPortfolioRegime,
  getPortfolioWave,
  getPortfolioTrimSignals,
  getBehavioralAlerts,
  getAppSettings,
  getPortfolioNews,
  getPortfolioEarnings,
  getMarketTrending,
  getMarketMovers,
  getMarketSectors,
} from "@/lib/api";
import {
  portfolioQueryKeys,
  marketQueryKeys,
  PORTFOLIO_STALE_TIMES,
  MARKET_STALE_TIMES,
  PORTFOLIO_NEWS_DAYS,
  PORTFOLIO_EARNINGS_DAYS_AHEAD,
} from "@/lib/portfolioQueries";
import { getLastPortfolioId, resolvePortfolioId } from "@/lib/portfolioSelection";
import type { Portfolio } from "@/lib/types";
import {
  getUserScopedGeneration,
  isCurrentUserScopedGeneration,
} from "@/lib/userScopedClientState";

let prefetchInFlight: { generation: number; promise: Promise<void> } | null = null;

async function forCurrentGeneration<T>(generation: number, load: () => Promise<T>): Promise<T> {
  if (!isCurrentUserScopedGeneration(generation)) throw new Error("Stale app data prefetch");
  const value = await load();
  if (!isCurrentUserScopedGeneration(generation)) throw new Error("Stale app data prefetch");
  return value;
}

export async function prefetchMarketData(
  queryClient: QueryClient,
  generation = getUserScopedGeneration()
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.trending,
      queryFn: () => forCurrentGeneration(generation, getMarketTrending),
      staleTime: MARKET_STALE_TIMES.trending,
    }),
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.movers,
      queryFn: () => forCurrentGeneration(generation, getMarketMovers),
      staleTime: MARKET_STALE_TIMES.movers,
    }),
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.sectors,
      queryFn: () => forCurrentGeneration(generation, getMarketSectors),
      staleTime: MARKET_STALE_TIMES.sectors,
    }),
  ]);
}

export async function prefetchPortfolioTabData(
  queryClient: QueryClient,
  portfolioId: string,
  options: { includeEarnings?: boolean; generation?: number } = {}
): Promise<void> {
  const includeEarnings = options.includeEarnings !== false;
  const generation = options.generation ?? getUserScopedGeneration();
  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.news(portfolioId),
      queryFn: () => forCurrentGeneration(generation, () => getPortfolioNews(portfolioId, PORTFOLIO_NEWS_DAYS)),
      staleTime: PORTFOLIO_STALE_TIMES.news,
    }),
    prefetchMarketData(queryClient, generation),
  ];

  if (includeEarnings) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.earnings(portfolioId),
        queryFn: () => forCurrentGeneration(generation, () => getPortfolioEarnings(portfolioId, PORTFOLIO_EARNINGS_DAYS_AHEAD)),
        staleTime: PORTFOLIO_STALE_TIMES.earnings,
      })
    );
  }

  await Promise.all(prefetches);
}

export async function prefetchPortfolioData(
  queryClient: QueryClient,
  generation = getUserScopedGeneration()
): Promise<void> {
  if (prefetchInFlight?.generation === generation) return prefetchInFlight.promise;

  const promise = runPrefetch(queryClient, generation).finally(() => {
    if (prefetchInFlight?.generation === generation) {
      prefetchInFlight = null;
    }
  });
  prefetchInFlight = { generation, promise };
  return promise;
}

/** Post-login warmup: market data first, then portfolio cache when available. */
export async function prefetchAppData(
  queryClient: QueryClient,
  generation = getUserScopedGeneration()
): Promise<void> {
  void prefetchMarketData(queryClient, generation);
  return prefetchPortfolioData(queryClient, generation);
}

async function runPrefetch(queryClient: QueryClient, generation: number): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: portfolioQueryKeys.list,
    queryFn: () => forCurrentGeneration(generation, listPortfolios),
  });
  if (!isCurrentUserScopedGeneration(generation)) return;

  const portfolios = queryClient.getQueryData<Portfolio[]>(portfolioQueryKeys.list) ?? [];
  const portfolioId = resolvePortfolioId(portfolios, getLastPortfolioId());
  if (!portfolioId) {
    await prefetchMarketData(queryClient, generation);
    return;
  }

  let markovEnabled = true;
  let waveEnabled = true;
  try {
    const settings = await queryClient.fetchQuery({
      queryKey: ["app-settings"],
      queryFn: () => forCurrentGeneration(generation, getAppSettings),
      staleTime: 60_000,
    });
    markovEnabled = settings.enableMarkovRegime !== false;
    waveEnabled = settings.enableElliottWave !== false;
  } catch {
    // Prefetch enrichment with defaults when settings are unavailable.
  }

  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.current(portfolioId),
      queryFn: () => forCurrentGeneration(generation, () => getPortfolioCurrent(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.current,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.fundamentals(portfolioId),
      queryFn: () => forCurrentGeneration(generation, () => getPortfolioFundamentals(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.fundamentals,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.behavioralAlerts(portfolioId),
      queryFn: () => forCurrentGeneration(generation, () => getBehavioralAlerts(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.behavioralAlerts,
    }),
    prefetchPortfolioTabData(queryClient, portfolioId, { generation }),
  ];

  if (markovEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.regime(portfolioId),
        queryFn: () => forCurrentGeneration(generation, () => getPortfolioRegime(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.regime,
      }),
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.trimSignals(portfolioId),
        queryFn: () => forCurrentGeneration(generation, () => getPortfolioTrimSignals(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.trimSignals,
      })
    );
  }

  if (waveEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.wave(portfolioId),
        queryFn: () => forCurrentGeneration(generation, () => getPortfolioWave(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.wave,
      })
    );
  }

  await Promise.all(prefetches);
}
