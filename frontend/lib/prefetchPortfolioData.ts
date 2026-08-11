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

function isCurrentPrefetch(generation: number): boolean {
  return generation === prefetchGeneration;
}

async function scopedPrefetchValue<T>(
  generation: number,
  load: () => Promise<T>
): Promise<T> {
  const value = await load();
  if (!isCurrentPrefetch(generation)) {
    throw new Error("Stale portfolio prefetch cancelled");
  }
  return value;
}

export async function prefetchMarketData(
  queryClient: QueryClient,
  generation = prefetchGeneration
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.trending,
      queryFn: () => scopedPrefetchValue(generation, getMarketTrending),
      staleTime: MARKET_STALE_TIMES.trending,
    }),
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.movers,
      queryFn: () => scopedPrefetchValue(generation, getMarketMovers),
      staleTime: MARKET_STALE_TIMES.movers,
    }),
    queryClient.prefetchQuery({
      queryKey: marketQueryKeys.sectors,
      queryFn: () => scopedPrefetchValue(generation, getMarketSectors),
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
  const generation = options.generation ?? prefetchGeneration;
  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.news(portfolioId),
      queryFn: () => scopedPrefetchValue(generation, () => getPortfolioNews(portfolioId, PORTFOLIO_NEWS_DAYS)),
      staleTime: PORTFOLIO_STALE_TIMES.news,
    }),
    prefetchMarketData(queryClient, generation),
  ];

  if (includeEarnings) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.earnings(portfolioId),
        queryFn: () => scopedPrefetchValue(generation, () => getPortfolioEarnings(portfolioId, PORTFOLIO_EARNINGS_DAYS_AHEAD)),
        staleTime: PORTFOLIO_STALE_TIMES.earnings,
      })
    );
  }

  await Promise.all(prefetches);
}

export async function prefetchPortfolioData(queryClient: QueryClient): Promise<void> {
  if (prefetchInFlight) return prefetchInFlight;

  const generation = prefetchGeneration;
  const promise = runPrefetch(queryClient, generation)
    .catch(() => undefined)
    .finally(() => {
      if (prefetchInFlight === promise) {
        prefetchInFlight = null;
      }
    });
  prefetchInFlight = promise;
  return prefetchInFlight;
}

/** Post-login warmup: market data first, then portfolio cache when available. */
export async function prefetchAppData(queryClient: QueryClient): Promise<void> {
  const generation = prefetchGeneration;
  void prefetchMarketData(queryClient, generation).catch(() => undefined);
  return prefetchPortfolioData(queryClient);
}

async function runPrefetch(queryClient: QueryClient, generation: number): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: portfolioQueryKeys.list,
    queryFn: () => scopedPrefetchValue(generation, listPortfolios),
  });
  if (!isCurrentPrefetch(generation)) return;

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
      queryFn: () => scopedPrefetchValue(generation, getAppSettings),
      staleTime: 60_000,
    });
    if (!isCurrentPrefetch(generation)) return;
    markovEnabled = settings.enableMarkovRegime !== false;
    waveEnabled = settings.enableElliottWave !== false;
  } catch {
    if (!isCurrentPrefetch(generation)) return;
    // Prefetch enrichment with defaults when settings are unavailable.
  }

  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.current(portfolioId),
      queryFn: () => scopedPrefetchValue(generation, () => getPortfolioCurrent(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.current,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.fundamentals(portfolioId),
      queryFn: () => scopedPrefetchValue(generation, () => getPortfolioFundamentals(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.fundamentals,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.behavioralAlerts(portfolioId),
      queryFn: () => scopedPrefetchValue(generation, () => getBehavioralAlerts(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.behavioralAlerts,
    }),
    prefetchPortfolioTabData(queryClient, portfolioId, { generation }),
  ];

  if (markovEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.regime(portfolioId),
        queryFn: () => scopedPrefetchValue(generation, () => getPortfolioRegime(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.regime,
      }),
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.trimSignals(portfolioId),
        queryFn: () => scopedPrefetchValue(generation, () => getPortfolioTrimSignals(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.trimSignals,
      })
    );
  }

  if (waveEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.wave(portfolioId),
        queryFn: () => scopedPrefetchValue(generation, () => getPortfolioWave(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.wave,
      })
    );
  }

  await Promise.all(prefetches);
}
