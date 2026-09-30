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

let prefetchInFlight: Promise<void> | null = null;
let prefetchGeneration = 0;

export function resetPortfolioPrefetchState(): void {
  prefetchGeneration += 1;
  prefetchInFlight = null;
}

async function guardPrefetch<T>(generation: number, fn: () => Promise<T>): Promise<T> {
  const value = await fn();
  if (generation !== prefetchGeneration) {
    throw new Error("Stale portfolio prefetch ignored");
  }
  return value;
}

export async function prefetchMarketData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.trending,
      queryFn: getMarketTrending,
      staleTime: MARKET_STALE_TIMES.trending,
    }),
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.movers,
      queryFn: getMarketMovers,
      staleTime: MARKET_STALE_TIMES.movers,
    }),
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.sectors,
      queryFn: getMarketSectors,
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
  const queryFn = <T,>(fn: () => Promise<T>) =>
    options.generation === undefined ? fn : () => guardPrefetch(options.generation!, fn);
  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.news(portfolioId),
      queryFn: queryFn(() => getPortfolioNews(portfolioId, PORTFOLIO_NEWS_DAYS)),
      staleTime: PORTFOLIO_STALE_TIMES.news,
    }),
    prefetchMarketData(queryClient),
  ];

  if (includeEarnings) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.earnings(portfolioId),
        queryFn: queryFn(() => getPortfolioEarnings(portfolioId, PORTFOLIO_EARNINGS_DAYS_AHEAD)),
        staleTime: PORTFOLIO_STALE_TIMES.earnings,
      })
    );
  }

  await Promise.all(prefetches);
}

export async function prefetchPortfolioData(queryClient: QueryClient): Promise<void> {
  if (prefetchInFlight) return prefetchInFlight;

  const generation = prefetchGeneration;
  prefetchInFlight = runPrefetch(queryClient, generation).finally(() => {
    if (generation === prefetchGeneration) {
      prefetchInFlight = null;
    }
  });
  return prefetchInFlight;
}

/** Post-login warmup: market data first, then portfolio cache when available. */
export async function prefetchAppData(queryClient: QueryClient): Promise<void> {
  void prefetchMarketData(queryClient);
  return prefetchPortfolioData(queryClient);
}

async function runPrefetch(queryClient: QueryClient, generation: number): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: portfolioQueryKeys.list,
    queryFn: () => guardPrefetch(generation, listPortfolios),
  });

  if (generation !== prefetchGeneration) return;
  const portfolios = queryClient.getQueryData<Portfolio[]>(portfolioQueryKeys.list) ?? [];
  const portfolioId = resolvePortfolioId(portfolios, getLastPortfolioId());
  if (!portfolioId) {
    await prefetchMarketData(queryClient);
    return;
  }

  let markovEnabled = true;
  let waveEnabled = true;
  try {
    const settings = await queryClient.fetchQuery({
      queryKey: ["app-settings"],
      queryFn: () => guardPrefetch(generation, getAppSettings),
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
      queryFn: () => guardPrefetch(generation, () => getPortfolioCurrent(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.current,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.fundamentals(portfolioId),
      queryFn: () => guardPrefetch(generation, () => getPortfolioFundamentals(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.fundamentals,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.behavioralAlerts(portfolioId),
      queryFn: () => guardPrefetch(generation, () => getBehavioralAlerts(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.behavioralAlerts,
    }),
    prefetchPortfolioTabData(queryClient, portfolioId, { generation }),
  ];

  if (markovEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.regime(portfolioId),
        queryFn: () => guardPrefetch(generation, () => getPortfolioRegime(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.regime,
      }),
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.trimSignals(portfolioId),
        queryFn: () => guardPrefetch(generation, () => getPortfolioTrimSignals(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.trimSignals,
      })
    );
  }

  if (waveEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.wave(portfolioId),
        queryFn: () => guardPrefetch(generation, () => getPortfolioWave(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.wave,
      })
    );
  }

  await Promise.all(prefetches);
}
