"use client";

import { MarkovConfirmation } from "@/components/runs/MarkovConfirmation";
import { KalmanConfirmation } from "@/components/runs/KalmanConfirmation";
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
  const showAny =
    strategy.markovEnabled || strategy.kalmanEnabled || strategy.waveEnabled;

  if (!showAny) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
        Signal confluence
      </h3>
      <div className="space-y-2">
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
      </div>
    </section>
  );
}
