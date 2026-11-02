"use client";

import { useState } from "react";
import { PricedInBadge } from "@/components/portfolio/PricedInBadge";
import {
  PRICED_IN_BACKGROUND,
  resolveEarningsPricedIn,
  statusLabel,
  statusTone,
  type PricedInAssessment,
} from "@/lib/pricedIn";
import { signalToneBadgeClass } from "@/lib/uiClasses";

interface Props {
  ticker: string;
  analysisDate: string;
  variant?: "default" | "compact";
}

function toneBorder(assessment: PricedInAssessment | null): string {
  if (!assessment) return "border-input-border";
  if (assessment.status === "fully") return "border-green-500/40";
  if (assessment.status === "partially") return "border-amber-500/40";
  if (assessment.status === "unpriced") return "border-blue-500/40";
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

function PricedInDetails({ assessment }: { assessment: PricedInAssessment }) {
  const m = assessment.metrics;
  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-relaxed text-muted">{PRICED_IN_BACKGROUND}</p>
      <div className="rounded-md border border-input-border/60 bg-page px-2.5 py-2 space-y-1">
        {m.impliedMovePct != null && (
          <MetricRow label="Implied move (ATM×0.85)" value={`±${m.impliedMovePct}%`} />
        )}
        {m.historicalMovePct != null && (
          <MetricRow label="Hist. post-event move" value={`±${m.historicalMovePct}%`} />
        )}
        {m.pricedInRatio != null && (
          <MetricRow label="Implied / hist. ratio" value={m.pricedInRatio.toFixed(2)} />
        )}
        {m.eventProbability != null && (
          <MetricRow
            label="Event probability"
            value={`${(m.eventProbability * 100).toFixed(0)}%`}
          />
        )}
      </div>
      <p className="text-[10px] text-muted">
        <span className="font-medium text-fg-secondary">Driver:</span> {assessment.summary}
      </p>
      <p className="text-[10px] text-subtle">
        Fixture inputs until live options/rates APIs are wired — engine math matches the live path.
      </p>
    </div>
  );
}

export function PricedInConfirmation({
  ticker,
  analysisDate,
  variant = "default",
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const assessment = resolveEarningsPricedIn(ticker, analysisDate);
  const borderColor = toneBorder(assessment);

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
            <PricedInBadge status={assessment} />
            {assessment && (
              <span
                className={`hidden sm:inline text-[10px] font-semibold ${
                  assessment.status === "fully"
                    ? "text-green-400"
                    : assessment.status === "partially"
                      ? "text-amber-400"
                      : "text-blue-400"
                }`}
              >
                {statusLabel(assessment.status)}
              </span>
            )}
            {chevron}
          </div>
        </summary>
        <div className="px-3 pb-3 pt-2 border-t border-input-border/50">
          {assessment ? (
            <PricedInDetails assessment={assessment} />
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
          <PricedInBadge status={assessment} />
          {assessment && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${signalToneBadgeClass(statusTone(assessment.status))}`}
            >
              {statusLabel(assessment.status)}
            </span>
          )}
        </div>
      </div>
      {assessment ? (
        <PricedInDetails assessment={assessment} />
      ) : (
        <p className="text-xs text-muted">Priced-in data unavailable.</p>
      )}
    </div>
  );
}
