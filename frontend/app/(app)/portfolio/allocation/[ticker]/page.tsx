"use client";

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getAppSettings,
  getPortfolioCurrent,
  listPortfolios,
  optimizePortfolio,
} from "@/lib/api";
import {
  buildAllocationReasons,
  parseOptimizeSearchParams,
} from "@/lib/allocationReasons";
import { AllocationReasonPanel } from "@/components/portfolio/AllocationReasonPanel";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader, PageTitle } from "@/components/layout/PageHeader";
import { ALERT_BANNER_CLASS } from "@/lib/uiClasses";
import { portfolioQueryKeys, PORTFOLIO_STALE_TIMES } from "@/lib/portfolioQueries";
import {
  getLastPortfolioId,
  resolvePortfolioId,
} from "@/lib/portfolioSelection";

const OBJECTIVE_LABEL = {
  sharpe: "Max Sharpe",
  volatility: "Min volatility",
  black_litterman: "Black-Litterman",
} as const;

function AllocationReasonContent() {
  const { ticker: tickerParam } = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const ticker = decodeURIComponent(tickerParam ?? "").toUpperCase();
  const optimizeParams = useMemo(
    () => parseOptimizeSearchParams(searchParams),
    [searchParams],
  );

  const { data: strategySettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    retry: false,
  });
  const optimizerEnabled = strategySettings?.enablePortfolioOptimizer !== false;

  const { data: portfolios = [], isLoading: portfoliosLoading } = useQuery({
    queryKey: portfolioQueryKeys.list,
    queryFn: listPortfolios,
  });

  const portfolioId = useMemo(() => {
    const fromUrl = searchParams.get("portfolio");
    return resolvePortfolioId(portfolios, fromUrl ?? getLastPortfolioId());
  }, [portfolios, searchParams]);

  const { data: current } = useQuery({
    queryKey: portfolioQueryKeys.current(portfolioId ?? ""),
    queryFn: () => getPortfolioCurrent(portfolioId!),
    enabled: portfolioId != null,
    staleTime: PORTFOLIO_STALE_TIMES.current,
  });
  const currency = current?.display_currency ?? "USD";

  const {
    data: result,
    isLoading: optimizeLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [...portfolioQueryKeys.optimize(portfolioId ?? ""), optimizeParams],
    queryFn: () => optimizePortfolio(portfolioId!, optimizeParams),
    staleTime: PORTFOLIO_STALE_TIMES.optimize,
    enabled: portfolioId != null && optimizerEnabled && !settingsLoading,
  });

  const row = result?.holdings.find((h) => h.ticker.toUpperCase() === ticker);
  const summary =
    result && row ? buildAllocationReasons(result, row, currency) : null;
  const backHref = "/portfolio?tab=allocation";
  const loading = settingsLoading || portfoliosLoading || optimizeLoading;
  const actionWord = row?.action ?? "action";

  return (
    <PageShell>
      <Breadcrumbs
        className="mb-2"
        items={[
          { label: "Portfolio", href: "/portfolio" },
          { label: "Allocation", href: backHref },
          { label: ticker || "…" },
        ]}
      />
      <PageHeader
        title={
          <PageTitle>
            Why {ticker || "this"} {actionWord}?
          </PageTitle>
        }
        description="Portfolio-construction math for this ticker — not a fundamental stock thesis. Research only."
      />

      {!optimizerEnabled && !settingsLoading && (
        <div className="text-muted text-sm py-8 text-center">
          Portfolio optimizer is disabled in Strategy settings.
        </div>
      )}

      {optimizerEnabled && !portfolioId && !portfoliosLoading && (
        <div className="text-muted text-sm py-8 text-center">
          No portfolio selected. Open Portfolio → Allocation first.
        </div>
      )}

      {isError && (
        <div className={ALERT_BANNER_CLASS}>
          {error instanceof Error ? error.message : "Failed to load allocation."}
        </div>
      )}

      {loading && !summary && (
        <div className="text-muted text-sm py-8 text-center">Loading reasons…</div>
      )}

      {result && !row && !loading && (
        <div className="text-muted text-sm py-8 text-center">
          {ticker} is not in this optimize result. Re-run allocation from the Allocation
          tab, then open the action again.
        </div>
      )}

      {summary && row && result && (
        <AllocationReasonPanel
          ticker={ticker}
          row={row}
          summary={summary}
          backHref={backHref}
          objectiveLabel={OBJECTIVE_LABEL[result.objective]}
        />
      )}
    </PageShell>
  );
}

export default function AllocationReasonPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageHeader title={<PageTitle>Why this action?</PageTitle>} />
          <div className="text-muted text-sm">Loading…</div>
        </PageShell>
      }
    >
      <AllocationReasonContent />
    </Suspense>
  );
}
