"use client";
import { TickerLabel } from "@/components/ui/TickerLabel";
import type { Run, Report, TickerMetadata } from "@/lib/types";
import { Markdown } from "@/components/ui/Markdown";
import { fmtPriceString, resolveQuoteCurrency } from "@/lib/currency";

interface Props {
  run: Run | undefined;
  report: Report | undefined;
  metadata?: TickerMetadata;
  /** Sidebar layout: smaller verdict badge, rationale collapsed below fold. */
  compact?: boolean;
}

const verdictStyles: Record<string, string> = {
  buy: "bg-green-900 text-green-300 font-bold rounded-lg",
  sell: "bg-red-900 text-red-300 font-bold rounded-lg",
  hold: "bg-yellow-900 text-yellow-300 font-bold rounded-lg",
};

const verdictSize = {
  default: "text-2xl px-6 py-3",
  compact: "text-xl px-4 py-2",
};

interface PriceLevelProps {
  label: string;
  value: string | null | undefined;
  currency: string;
}

function PriceLevel({ label, value, currency }: PriceLevelProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted text-xs uppercase tracking-wider">{label}</span>
      <span className="text-fg font-mono text-sm">{fmtPriceString(value, currency)}</span>
    </div>
  );
}

export function TraderDecision({ run, report, metadata, compact = false }: Props) {
  const isTerminated = run?.status === "aborted" || run?.status === "failed";
  const hasPrices =
    report?.suggested_entry || report?.suggested_stop || report?.suggested_target;
  const currency = resolveQuoteCurrency(
    report?.price_currency ?? run?.price_currency,
    metadata?.currency,
  );
  const sizeClass = compact ? verdictSize.compact : verdictSize.default;
  const padding = compact ? "p-4" : "p-6";

  return (
    <div className={`bg-surface border border-border rounded-lg ${padding}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={`font-semibold text-fg ${compact ? "text-base" : "text-lg"}`}>
          {run ? (
            <TickerLabel ticker={run.ticker} metadata={metadata} />
          ) : "—"}
        </h2>
        {run?.analysis_date && (
          <span className="text-muted text-sm">{run.analysis_date}</span>
        )}
      </div>

      {isTerminated && !report && (
        <p className="text-muted text-sm">
          This run did not complete successfully.
        </p>
      )}

      {!report && !isTerminated && (
        <p className="text-muted text-sm">Results not yet available.</p>
      )}

      {report && (
        <div className="flex flex-col gap-3">
          <div>
            <span className={`${verdictStyles[report.verdict] ?? verdictStyles.hold} ${sizeClass}`}>
              {report.verdict.toUpperCase()}
            </span>
          </div>

          {hasPrices && (
            <div className={`flex flex-col gap-3 border-t border-input-border pt-3 ${compact ? "" : "sm:flex-row sm:gap-6"}`}>
              <PriceLevel label="Entry" value={report.suggested_entry} currency={currency} />
              {!compact && <div className="hidden sm:block w-px bg-muted-surface" />}
              <PriceLevel label="Stop" value={report.suggested_stop} currency={currency} />
              {!compact && <div className="hidden sm:block w-px bg-muted-surface" />}
              <PriceLevel label="Target" value={report.suggested_target} currency={currency} />
            </div>
          )}

          {report.trader_decision && !compact && (
            <Markdown>{report.trader_decision}</Markdown>
          )}
          {report.trader_decision && compact && (
            <details className="group border-t border-input-border pt-3">
              <summary className="cursor-pointer text-xs text-muted hover:text-fg-secondary list-none flex items-center justify-between">
                <span>Rationale</span>
                <span className="text-subtle group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="mt-2 text-sm">
                <Markdown>{report.trader_decision}</Markdown>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
