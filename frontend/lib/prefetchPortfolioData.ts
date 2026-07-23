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
import { getUserScopedStateVersion } from "@/lib/userScopedClientState";

let prefetchInFlight: { promise: Promise<void>; version: number } | null = null;

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
  options: { includeEarnings?: boolean } = {}
): Promise<void> {
  const includeEarnings = options.includeEarnings !== false;
  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.news(portfolioId),
      queryFn: () => getPortfolioNews(portfolioId, PORTFOLIO_NEWS_DAYS),
      staleTime: PORTFOLIO_STALE_TIMES.news,
    }),
    prefetchMarketData(queryClient),
  ];

  if (includeEarnings) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.earnings(portfolioId),
        queryFn: () => getPortfolioEarnings(portfolioId, PORTFOLIO_EARNINGS_DAYS_AHEAD),
        staleTime: PORTFOLIO_STALE_TIMES.earnings,
      })
    );
  }

  await Promise.all(prefetches);
  if (isStalePrefetch(version)) {
    queryClient.clear();
  }
}

export async function prefetchPortfolioData(queryClient: QueryClient): Promise<void> {
  const version = getUserScopedStateVersion();
  if (prefetchInFlight?.version === version) return prefetchInFlight.promise;

  const promise = runPrefetch(queryClient, version).finally(() => {
    if (prefetchInFlight?.promise === promise) {
      prefetchInFlight = null;
    }
  });
  prefetchInFlight = { promise, version };
  return promise;
}

/** Post-login warmup: market data first, then portfolio cache when available. */
export async function prefetchAppData(queryClient: QueryClient): Promise<void> {
  void prefetchMarketData(queryClient);
  return prefetchPortfolioData(queryClient);
}

function isStalePrefetch(version: number): boolean {
  return version !== getUserScopedStateVersion();
}

async function runPrefetch(queryClient: QueryClient, version: number): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: portfolioQueryKeys.list,
    queryFn: listPortfolios,
  });
  if (isStalePrefetch(version)) return;

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
      queryFn: getAppSettings,
      staleTime: 60_000,
    });
    if (isStalePrefetch(version)) return;
    markovEnabled = settings.enableMarkovRegime !== false;
    waveEnabled = settings.enableElliottWave !== false;
  } catch {
    // Prefetch enrichment with defaults when settings are unavailable.
  }

  if (isStalePrefetch(version)) return;

  const prefetches: Array<Promise<void>> = [
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.current(portfolioId),
      queryFn: () => getPortfolioCurrent(portfolioId),
      staleTime: PORTFOLIO_STALE_TIMES.current,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.fundamentals(portfolioId),
      queryFn: () => getPortfolioFundamentals(portfolioId),
      staleTime: PORTFOLIO_STALE_TIMES.fundamentals,
    }),
    queryClient.prefetchQuery({
      queryKey: portfolioQueryKeys.behavioralAlerts(portfolioId),
      queryFn: () => getBehavioralAlerts(portfolioId),
      staleTime: PORTFOLIO_STALE_TIMES.behavioralAlerts,
    }),
    prefetchPortfolioTabData(queryClient, portfolioId),
  ];

  if (markovEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.regime(portfolioId),
        queryFn: () => getPortfolioRegime(portfolioId),
        staleTime: PORTFOLIO_STALE_TIMES.regime,
      }),
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.trimSignals(portfolioId),
        queryFn: () => getPortfolioTrimSignals(portfolioId),
        staleTime: PORTFOLIO_STALE_TIMES.trimSignals,
      })
    );
  }

  if (waveEnabled) {
    prefetches.push(
      queryClient.prefetchQuery({
        queryKey: portfolioQueryKeys.wave(portfolioId),
        queryFn: () => getPortfolioWave(portfolioId),
        staleTime: PORTFOLIO_STALE_TIMES.wave,
      })
    );
  }

  await Promise.all(prefetches);
}
