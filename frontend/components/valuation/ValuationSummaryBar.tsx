"use client";

import { latestFairDelta, type ValuationMetric, type ValuationPayload } from "@/lib/valuationTypes";
import { fmtMoney } from "@/lib/currency";

type Props = {
  data: ValuationPayload;
  metric: ValuationMetric;
};

function fmtRatio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function ValuationSummaryBar({ data, metric }: Props) {
  const currency = data.summary.currency ?? "USD";
  const spot = data.summary.price ?? null;
  const { fair, pct } = latestFairDelta(data.corridors[metric], spot);
  const belowFair = pct != null && pct < 0;
  const aboveFair = pct != null && pct > 0;
  const deltaClass = belowFair
    ? "text-success"
    : aboveFair
      ? "text-danger"
      : "text-muted";
  const deltaLabel = belowFair
    ? "Below fair value"
    : aboveFair
      ? "Above fair value"
      : "Near fair value";

  const yieldRaw = data.summary.dividend_yield;
  // yfinance often returns yield as fraction (0.005) or percent — normalize heuristically
  const yieldPct =
    yieldRaw == null
      ? null
      : Math.abs(yieldRaw) <= 1
        ? yieldRaw * 100
        : yieldRaw;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Price</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-fg">
            {spot != null ? fmtMoney(spot, currency) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Fair ({metric.toUpperCase()})
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums text-fg">
            {fair != null ? fmtMoney(fair, currency) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">vs fair</p>
          <p className={`font-mono text-lg font-semibold tabular-nums ${deltaClass}`}>
            {fmtPct(pct)}
          </p>
          <p className="text-[10px] text-muted">{deltaLabel}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">P/E</p>
          <p className="font-mono text-sm tabular-nums text-fg-secondary">
            {fmtRatio(data.summary.trailing_pe)}
            {data.summary.forward_pe != null ? (
              <span className="text-muted"> / fwd {fmtRatio(data.summary.forward_pe)}</span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Div yield</p>
          <p className="font-mono text-sm tabular-nums text-fg-secondary">
            {yieldPct != null ? `${yieldPct.toFixed(2)}%` : "—"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted">Source</p>
          <p className="text-xs text-fg-secondary">{data.source}</p>
        </div>
      </div>
    </div>
  );
}
