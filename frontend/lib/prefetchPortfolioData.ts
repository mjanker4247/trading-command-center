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

class PrefetchSupersededError extends Error {}

let prefetchInFlight: { userKey: string; promise: Promise<void> } | null = null;
let prefetchGeneration = 0;

export function resetPortfolioPrefetchState(): void {
  prefetchInFlight = null;
  prefetchGeneration += 1;
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
  options: { includeEarnings?: boolean; userKey?: string; generation?: number } = {}
): Promise<void> {
  const includeEarnings = options.includeEarnings !== false;
  const scoped = <T,>(load: () => Promise<T>): Promise<T> => {
    if (!options.userKey || options.generation == null) return load();
    return scopedPrefetchValue(options.userKey, options.generation, load);
  };
  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.news(portfolioId),
      queryFn: () => scoped(() => getPortfolioNews(portfolioId, PORTFOLIO_NEWS_DAYS)),
      staleTime: PORTFOLIO_STALE_TIMES.news,
    }),
    prefetchMarketData(queryClient),
  ];

  if (includeEarnings) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.earnings(portfolioId),
        queryFn: () => scoped(() => getPortfolioEarnings(portfolioId, PORTFOLIO_EARNINGS_DAYS_AHEAD)),
        staleTime: PORTFOLIO_STALE_TIMES.earnings,
      })
    );
  }

  await Promise.all(prefetches);
}

export async function prefetchPortfolioData(queryClient: QueryClient, userKey = "anonymous"): Promise<void> {
  if (prefetchInFlight?.userKey === userKey) return prefetchInFlight.promise;

  const generation = prefetchGeneration;
  const promise = runPrefetch(queryClient, userKey, generation)
    .catch((error) => {
      if (error instanceof PrefetchSupersededError) return;
      throw error;
    })
    .finally(() => {
      if (prefetchInFlight?.userKey === userKey && prefetchGeneration === generation) {
        prefetchInFlight = null;
      }
    });
  prefetchInFlight = { userKey, promise };
  return promise;
}

/** Post-login warmup: market data first, then portfolio cache when available. */
export async function prefetchAppData(queryClient: QueryClient, userKey = "anonymous"): Promise<void> {
  void prefetchMarketData(queryClient);
  return prefetchPortfolioData(queryClient, userKey);
}

function assertPrefetchCurrent(userKey: string, generation: number): void {
  if (prefetchGeneration !== generation || prefetchInFlight?.userKey !== userKey) {
    throw new PrefetchSupersededError();
  }
}

async function scopedPrefetchValue<T>(
  userKey: string,
  generation: number,
  load: () => Promise<T>
): Promise<T> {
  const value = await load();
  assertPrefetchCurrent(userKey, generation);
  return value;
}

async function runPrefetch(queryClient: QueryClient, userKey: string, generation: number): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: portfolioQueryKeys.list,
    queryFn: () => scopedPrefetchValue(userKey, generation, listPortfolios),
  });
  assertPrefetchCurrent(userKey, generation);

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
      queryFn: () => scopedPrefetchValue(userKey, generation, getAppSettings),
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
      queryFn: () => scopedPrefetchValue(userKey, generation, () => getPortfolioCurrent(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.current,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.fundamentals(portfolioId),
      queryFn: () => scopedPrefetchValue(userKey, generation, () => getPortfolioFundamentals(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.fundamentals,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.behavioralAlerts(portfolioId),
      queryFn: () => scopedPrefetchValue(userKey, generation, () => getBehavioralAlerts(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.behavioralAlerts,
    }),
    prefetchPortfolioTabData(queryClient, portfolioId, { userKey, generation }),
  ];

  if (markovEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.regime(portfolioId),
        queryFn: () => scopedPrefetchValue(userKey, generation, () => getPortfolioRegime(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.regime,
      }),
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.trimSignals(portfolioId),
        queryFn: () => scopedPrefetchValue(userKey, generation, () => getPortfolioTrimSignals(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.trimSignals,
      })
    );
  }

  if (waveEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.wave(portfolioId),
        queryFn: () => scopedPrefetchValue(userKey, generation, () => getPortfolioWave(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.wave,
      })
    );
  }

  await Promise.all(prefetches);
}
