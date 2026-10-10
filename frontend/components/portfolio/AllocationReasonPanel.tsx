"use client";

import Link from "next/link";
import { useTickerMetadata } from "@/lib/useTickerMetadata";
import { TickerLabel } from "@/components/ui/TickerLabel";
import { ALERT_BANNER_CLASS, signalToneBadgeClass } from "@/lib/uiClasses";
import type { AllocationReasonSummary } from "@/lib/allocationReasons";
import type { AllocationAction, AllocationHoldingRow } from "@/lib/types";

function actionBadgeClass(action: AllocationAction): string {
  if (action === "BUY") return signalToneBadgeClass("success");
  if (action === "SELL") return signalToneBadgeClass("danger");
  return signalToneBadgeClass("neutral");
}

interface Props {
  ticker: string;
  row: AllocationHoldingRow;
  summary: AllocationReasonSummary;
  backHref: string;
  objectiveLabel: string;
}

export function AllocationReasonPanel({
  ticker,
  row,
  summary,
  backHref,
  objectiveLabel,
}: Props) {
  const { data: tickerMetadata = {} } = useTickerMetadata([ticker]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <TickerLabel ticker={ticker} metadata={tickerMetadata[ticker.toUpperCase()]} />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${actionBadgeClass(row.action)}`}
            >
              {row.action}
            </span>
            <span className="text-xs text-muted">{objectiveLabel}</span>
          </div>
        </div>
        <Link
          href={backHref}
          className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
        >
          ← Back to Allocation
        </Link>
      </div>

      <p className="text-sm text-fg leading-relaxed">{summary.headline}</p>
      <p className="text-sm text-fg-secondary leading-relaxed">{summary.framing}</p>

      <ol className="space-y-3">
        {summary.bullets.map((b, i) => (
          <li
            key={b.title}
            className="rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="flex gap-3">
              <span className="font-data text-xs text-muted tabular-nums pt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  {b.title}
                </h3>
                <p className="text-sm text-fg-secondary leading-relaxed">{b.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
          What this is not
        </h3>
        <ul className="list-disc pl-4 space-y-1.5">
          {summary.notThis.map((line) => (
            <li key={line} className="text-sm text-fg-secondary leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className={ALERT_BANNER_CLASS}>
        <span className="font-medium text-amber-300/90">Practical reading — </span>
        {summary.practical}
      </div>

      <p className="text-xs text-muted leading-relaxed">{summary.disclaimer}</p>
    </div>
  );
}
