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
let portfolioPrefetchGeneration = 0;

export function resetPortfolioPrefetchState() {
  portfolioPrefetchGeneration += 1;
  prefetchInFlight = null;
}

export function isPortfolioPrefetchGenerationCurrent(generation: number): boolean {
  return generation === portfolioPrefetchGeneration;
}

function ensureCurrentPrefetchGeneration(generation: number) {
  if (!isPortfolioPrefetchGenerationCurrent(generation)) {
    throw new Error("Stale portfolio prefetch generation");
  }
}

function guardedQueryFn<T>(generation: number, queryFn: () => Promise<T>): () => Promise<T> {
  return async () => {
    ensureCurrentPrefetchGeneration(generation);
    const result = await queryFn();
    ensureCurrentPrefetchGeneration(generation);
    return result;
  };
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
  const generation = options.generation ?? portfolioPrefetchGeneration;
  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.news(portfolioId),
      queryFn: guardedQueryFn(generation, () => getPortfolioNews(portfolioId, PORTFOLIO_NEWS_DAYS)),
      staleTime: PORTFOLIO_STALE_TIMES.news,
    }),
    prefetchMarketData(queryClient),
  ];

  if (includeEarnings) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.earnings(portfolioId),
        queryFn: guardedQueryFn(generation, () => getPortfolioEarnings(portfolioId, PORTFOLIO_EARNINGS_DAYS_AHEAD)),
        staleTime: PORTFOLIO_STALE_TIMES.earnings,
      })
    );
  }

  await Promise.all(prefetches);
}

export async function prefetchPortfolioData(queryClient: QueryClient): Promise<void> {
  if (prefetchInFlight) return prefetchInFlight;

  const generation = portfolioPrefetchGeneration;
  prefetchInFlight = runPrefetch(queryClient, generation).finally(() => {
    if (isPortfolioPrefetchGenerationCurrent(generation)) {
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
    queryFn: guardedQueryFn(generation, listPortfolios),
  });
  if (!isPortfolioPrefetchGenerationCurrent(generation)) return;

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
      queryFn: guardedQueryFn(generation, getAppSettings),
      staleTime: 60_000,
    });
    markovEnabled = settings.enableMarkovRegime !== false;
    waveEnabled = settings.enableElliottWave !== false;
  } catch {
    // Prefetch enrichment with defaults when settings are unavailable.
  }
  if (!isPortfolioPrefetchGenerationCurrent(generation)) return;

  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.current(portfolioId),
      queryFn: guardedQueryFn(generation, () => getPortfolioCurrent(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.current,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.fundamentals(portfolioId),
      queryFn: guardedQueryFn(generation, () => getPortfolioFundamentals(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.fundamentals,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.behavioralAlerts(portfolioId),
      queryFn: guardedQueryFn(generation, () => getBehavioralAlerts(portfolioId)),
      staleTime: PORTFOLIO_STALE_TIMES.behavioralAlerts,
    }),
    prefetchPortfolioTabData(queryClient, portfolioId, { generation }),
  ];

  if (markovEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.regime(portfolioId),
        queryFn: guardedQueryFn(generation, () => getPortfolioRegime(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.regime,
      }),
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.trimSignals(portfolioId),
        queryFn: guardedQueryFn(generation, () => getPortfolioTrimSignals(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.trimSignals,
      })
    );
  }

  if (waveEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.wave(portfolioId),
        queryFn: guardedQueryFn(generation, () => getPortfolioWave(portfolioId)),
        staleTime: PORTFOLIO_STALE_TIMES.wave,
      })
    );
  }

  await Promise.all(prefetches);
}
