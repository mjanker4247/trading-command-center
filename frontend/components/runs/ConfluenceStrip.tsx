"use client";

import Link from "next/link";
import { MarkovConfirmation } from "@/components/runs/MarkovConfirmation";
import { KalmanConfirmation } from "@/components/runs/KalmanConfirmation";
import { PricedInConfirmation } from "@/components/runs/PricedInConfirmation";
import { WaveConfirmation } from "@/components/wave/WaveConfirmation";
import type { Report, Run } from "@/lib/types";

type StrategyFlags = {
  markovEnabled: boolean;
  kalmanEnabled: boolean;
  waveEnabled: boolean;
};

type ConfluenceStripProps = {
  run: Run;
  report: Report | undefined;
  strategy: StrategyFlags;
  metadataCurrency?: string | null;
};

export function ConfluenceStrip({
  run,
  report,
  strategy,
  metadataCurrency,
}: ConfluenceStripProps) {
  const enabledCount = [
    strategy.markovEnabled,
    strategy.kalmanEnabled,
    strategy.waveEnabled,
  ].filter(Boolean).length;
  // Event priced-in always accompanies the run date (not a strategy toggle).
  const signalCount = enabledCount + 1;
  const valuationHref = `/tickers/${encodeURIComponent(run.ticker)}/valuation-technicals?from=run&runId=${encodeURIComponent(run.id)}`;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted">
        <span>Signal confluence</span>
        <span className="normal-case tracking-normal text-[10px] text-subtle">
          {signalCount} signal{signalCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-2 border-t border-input-border px-3 pb-3 pt-2">
        {strategy.markovEnabled && (
          <MarkovConfirmation
            ticker={run.ticker}
            verdict={run.verdict}
            variant="compact"
          />
        )}
        {strategy.kalmanEnabled && (
          <KalmanConfirmation
            ticker={run.ticker}
            verdict={run.verdict}
            priceCurrency={report?.price_currency ?? run.price_currency}
            metadataCurrency={metadataCurrency}
            variant="compact"
          />
        )}
        {strategy.waveEnabled && (
          <WaveConfirmation
            ticker={run.ticker}
            verdict={run.verdict}
            suggestedEntry={report?.suggested_entry}
            suggestedStop={report?.suggested_stop}
            suggestedTarget={report?.suggested_target}
            priceCurrency={report?.price_currency ?? run.price_currency}
            variant="compact"
          />
        )}
        <PricedInConfirmation
          ticker={run.ticker}
          analysisDate={run.analysis_date}
          variant="compact"
        />
        <div className="pt-1">
          <Link
            href={valuationHref}
            className="inline-flex text-[11px] font-medium text-link hover:text-link-hover hover:underline"
          >
            Open Valuation &amp; Technicals →
          </Link>
        </div>
      </div>
    </div>
  );
}
