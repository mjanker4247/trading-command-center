"use client";

import { useState } from "react";
import { PricedInBadge } from "@/components/portfolio/PricedInBadge";
import {
  levelLabel,
  PRICED_IN_BACKGROUND,
  resolvePricedInForEarningsEvent,
  type PricedInStatus,
} from "@/lib/pricedIn";
import { signalToneBadgeClass } from "@/lib/uiClasses";

interface Props {
  ticker: string;
  analysisDate: string;
  variant?: "default" | "compact";
}

function toneBorder(status: PricedInStatus | null): string {
  if (!status) return "border-input-border";
  if (status.level === "full") return "border-green-500/40";
  if (status.level === "partial") return "border-amber-500/40";
  return "border-input-border";
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[10px]">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-fg tabular-nums">{value}</span>
    </div>
  );
}

function PricedInDetails({ status }: { status: PricedInStatus }) {
  const m = status.metrics;
  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-relaxed text-muted">{PRICED_IN_BACKGROUND}</p>
      <div className="rounded-md border border-input-border/60 bg-page px-2.5 py-2 space-y-1">
        <MetricRow label="IV percentile" value={`${m.ivPercentile}`} />
        <MetricRow label="Implied move (ATM-style)" value={`${m.impliedMovePct}%`} />
        <MetricRow label="Hist. post-event move" value={`${m.historicalMovePct}%`} />
        <MetricRow label="Implied / hist. ratio" value={m.moveRatio.toFixed(2)} />
        <MetricRow label="Consensus target gap" value={`${m.consensusTargetDistancePct}%`} />
        <MetricRow label="Options skew" value={m.optionsSkew} />
      </div>
      <p className="text-[10px] text-muted">
        <span className="font-medium text-fg-secondary">Key factor:</span> {status.keyFactor}
      </p>
      {status.source === "mock" && (
        <p className="text-[10px] text-subtle">
          Underlying feeds are mocked until options/consensus APIs are wired — the score weights
          those indicators the same way a live build would.
        </p>
      )}
    </div>
  );
}

export function PricedInConfirmation({
  ticker,
  analysisDate,
  variant = "default",
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const status = resolvePricedInForEarningsEvent(ticker, analysisDate);
  const borderColor = toneBorder(status);

  if (variant === "compact") {
    const chevron = (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted-surface text-base leading-none text-fg-secondary group-open:rotate-180 transition-transform duration-200">
        ▾
      </span>
    );

    return (
      <details
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        className={`bg-elevated border ${borderColor} rounded-lg text-xs group`}
      >
        <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2">
          <span className="font-medium text-fg">Event priced-in</span>
          <div className="flex items-center gap-2 shrink-0">
            <PricedInBadge status={status} />
            {status && (
              <span
                className={`hidden sm:inline text-[10px] font-semibold ${
                  status.level === "full"
                    ? "text-green-400"
                    : status.level === "partial"
                      ? "text-amber-400"
                      : "text-muted"
                }`}
              >
                {levelLabel(status.level)}
              </span>
            )}
            {chevron}
          </div>
        </summary>
        <div className="px-3 pb-3 pt-2 border-t border-input-border/50">
          {status ? (
            <PricedInDetails status={status} />
          ) : (
            <p className="text-[10px] text-muted">Priced-in data unavailable for this run.</p>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className={`bg-elevated border ${borderColor} rounded-lg p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Event priced-in</h3>
        <div className="flex items-center gap-2">
          <PricedInBadge status={status} />
          {status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${signalToneBadgeClass(
              status.level === "full" ? "success" : status.level === "partial" ? "warning" : "neutral",
            )}`}>
              {levelLabel(status.level)}
            </span>
          )}
        </div>
      </div>
      {status ? (
        <PricedInDetails status={status} />
      ) : (
        <p className="text-xs text-muted">Priced-in data unavailable.</p>
      )}
    </div>
  );
}
