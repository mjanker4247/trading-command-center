"use client";

import {
  levelLabel,
  PRICED_IN_BACKGROUND,
  resolvePricedInForEarningsEvent,
  type PricedInStatus,
} from "@/lib/pricedIn";
import type { ValuationPayload } from "@/lib/valuationTypes";

type Props = {
  ticker: string;
  /** ISO date used for deterministic event mock (run analysis date or today). */
  eventDate: string;
  growth: NonNullable<ValuationPayload["pricedIn"]>["growth"];
};

function fmtCagr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // yfinance earningsGrowth is typically a fraction
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function EventCard({ status }: { status: PricedInStatus | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Event priced-in</h3>
        <span className="rounded-md bg-muted-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          mock
        </span>
      </div>
      {status ? (
        <>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-fg">
            {status.percentage}%
          </p>
          <p className="text-xs text-fg-secondary">{levelLabel(status.level)}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">{status.keyFactor}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-link">What this means</summary>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{PRICED_IN_BACKGROUND}</p>
          </details>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">No event date for priced-in estimate.</p>
      )}
    </div>
  );
}

function GrowthCard({
  growth,
}: {
  growth: Props["growth"];
}) {
  const consensus = growth?.consensusCagr ?? null;
  const implied = growth?.impliedCagr ?? null;
  const gap =
    growth?.gapPp ??
    (implied != null && consensus != null
      ? (Math.abs(implied) <= 1 ? implied * 100 : implied) -
        (Math.abs(consensus) <= 1 ? consensus * 100 : consensus)
      : null);

  const rich = gap != null && gap > 1;
  const cheap = gap != null && gap < -1;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Growth priced-in</h3>
        <span className="rounded-md bg-muted-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {growth?.source ?? "none"}
        </span>
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Implied by price</dt>
          <dd className="font-mono tabular-nums text-fg">{fmtCagr(implied)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Consensus</dt>
          <dd className="font-mono tabular-nums text-fg">{fmtCagr(consensus)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-input-border/60 pt-2">
          <dt className="text-muted">Gap</dt>
          <dd
            className={`font-mono tabular-nums ${
              rich ? "text-danger" : cheap ? "text-success" : "text-fg"
            }`}
          >
            {gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)} pp`}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {rich
          ? "Implied growth ≫ consensus — price looks rich vs street growth (research estimate)."
          : cheap
            ? "Implied growth ≪ consensus — price looks less demanding vs street growth."
            : "Implied growth vs consensus. Full reverse-multiple solve arrives with the forecast slider."}
      </p>
    </div>
  );
}

export function PricedInExpectationPanel({ ticker, eventDate, growth }: Props) {
  const status = resolvePricedInForEarningsEvent(ticker, eventDate);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-fg">Priced-in expectations</h2>
        <p className="text-[11px] text-muted">
          Event vol and fundamental growth are separate — not a single score.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <EventCard status={status} />
        <GrowthCard growth={growth} />
      </div>
    </section>
  );
}
