"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Breadcrumbs, RESEARCH_BREADCRUMB } from "@/components/layout/Breadcrumbs";
import { PageShell } from "@/components/layout/PageShell";
import { FairValueCorridorChart } from "@/components/valuation/FairValueCorridorChart";
import { ForecastCalculator } from "@/components/valuation/ForecastCalculator";
import { PricedInExpectationPanel } from "@/components/valuation/PricedInExpectationPanel";
import { TechnicalConfluenceChart } from "@/components/valuation/TechnicalConfluenceChart";
import { ValuationSummaryBar } from "@/components/valuation/ValuationSummaryBar";
import { getRun, getTickerValuation } from "@/lib/api";
import { useTickerMetadata } from "@/lib/useTickerMetadata";
import type { ValuationMetric } from "@/lib/valuationTypes";

export default function ValuationTechnicalsPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const symbol = decodeURIComponent(ticker).toUpperCase();
  const from = searchParams.get("from");
  const runId = searchParams.get("runId");

  const [metric, setMetric] = useState<ValuationMetric>("eps");
  const [lookback, setLookback] = useState(5);

  const { data: metadataByTicker = {} } = useTickerMetadata([symbol]);
  const metadata = metadataByTicker[symbol];
  const companyName = metadata?.company_name ?? metadata?.display_name ?? symbol;

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId!),
    enabled: Boolean(from === "run" && runId),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const {
    data: valuation,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["ticker-valuation", symbol, lookback],
    queryFn: () => getTickerValuation(symbol, lookback),
    staleTime: 1000 * 60 * 60 * 6,
    retry: false,
  });

  const crumbs = useMemo(() => {
    const items = [RESEARCH_BREADCRUMB];
    if (from === "run" && runId) {
      items.push({ label: "Run", href: `/runs/${runId}` });
    }
    items.push({ label: "Valuation & Charts" });
    items.push({ label: symbol });
    return items;
  }, [from, runId, symbol]);

  const availableLookbacks = valuation?.available_lookbacks?.length
    ? valuation.available_lookbacks
    : [lookback];
  const effectiveLookback = valuation?.lookback_years ?? lookback;
  const currency = valuation?.summary.currency ?? metadata?.currency ?? "USD";
  const unavailable = Boolean(valuation?.unavailable_reason) || valuation?.source === "none";
  const eventDate =
    run?.analysis_date ?? new Date().toISOString().slice(0, 10);

  return (
    <PageShell gap="6">
      <header className="space-y-3">
        <Breadcrumbs items={crumbs} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyLogo ticker={symbol} size="lg" />
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-semibold text-fg">{symbol}</h1>
              <p className="truncate text-sm text-muted">{companyName}</p>
              <p className="mt-1 text-sm text-fg-secondary">Valuation &amp; Technical Confluence</p>
            </div>
          </div>
          {from === "run" && runId ? (
            <Link
              href={`/runs/${runId}`}
              className="text-xs font-medium text-link hover:text-link-hover hover:underline"
            >
              ← Back to run
            </Link>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Research estimates only — fair-value corridors and priced-in views are not trade advice.
        </p>
      </header>

      {isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-elevated" />
      )}

      {isError && (
        <div className="rounded-lg border border-border bg-elevated p-4 text-sm text-muted">
          {error instanceof Error ? error.message : "Valuation unavailable."}
        </div>
      )}

      {!isLoading && !isError && valuation && unavailable && (
        <div className="rounded-lg border border-border bg-elevated p-4 text-sm text-muted">
          Not enough fundamental history to build a fair-value corridor for {symbol}.
        </div>
      )}

      {!isLoading && !isError && valuation && !unavailable && (
        <>
          <ValuationSummaryBar data={valuation} metric={metric} />
          <FairValueCorridorChart
            metric={metric}
            lookback={effectiveLookback}
            availableLookbacks={availableLookbacks}
            block={valuation.corridors[metric]}
            currency={currency}
            onMetricChange={setMetric}
            onLookbackChange={setLookback}
          />
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold text-fg">Technical confluence</h2>
            <p className="mb-3 text-[11px] text-muted">
              Price history (markers for regime / Kalman / wave land next).
            </p>
            <TechnicalConfluenceChart points={valuation.series.price ?? []} />
          </section>
          <ForecastCalculator
            summary={valuation.summary}
            epsBlock={valuation.corridors.eps}
            estimates={valuation.estimates}
          />
          <PricedInExpectationPanel
            ticker={symbol}
            eventDate={eventDate}
            growth={valuation.pricedIn?.growth}
          />
        </>
      )}
    </PageShell>
  );
}
