"use client";

import {
  PRICED_IN_DISCLAIMER,
  statusLabel,
  statusTone,
  type PricedInAssessment,
} from "@/lib/pricedIn";
import { signalToneBadgeClass } from "@/lib/uiClasses";

interface Props {
  status: PricedInAssessment | null | undefined;
  /** Show score % only (default) or include short status word on wide layouts via CSS. */
  showLabel?: boolean;
}

/** Compact event priced-in pill with hover/focus popover. Null → muted fallback. */
export function PricedInBadge({ status, showLabel = false }: Props) {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded ${signalToneBadgeClass("neutral")}`}
        title="Priced-in data unavailable"
      >
        —
      </span>
    );
  }

  const tone = statusTone(status.status);
  const m = status.metrics;

  return (
    <span className="relative inline-flex group/pricedin">
      <span
        tabIndex={0}
        className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded cursor-default outline-none focus-visible:ring-2 focus-visible:ring-info/40 ${signalToneBadgeClass(tone)}`}
        aria-label={`${statusLabel(status.status)}, ${status.score} percent. ${status.summary}`}
      >
        {status.score}%
        {showLabel ? (
          <span className="hidden sm:inline font-sans font-medium normal-case tracking-normal">
            {statusLabel(status.status)}
          </span>
        ) : null}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-2 text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover/pricedin:opacity-100 group-focus-within/pricedin:opacity-100"
      >
        <span className="block text-[11px] font-medium text-fg">
          {statusLabel(status.status)} · {status.score}%
        </span>
        <span className="mt-1 block text-[10px] leading-snug text-fg-secondary">{status.summary}</span>
        {m.impliedMovePct != null && m.historicalMovePct != null && (
          <span className="mt-1.5 block font-mono text-[10px] tabular-nums text-muted">
            ±{m.impliedMovePct}% / ±{m.historicalMovePct}%
            {m.pricedInRatio != null ? ` · ratio ${m.pricedInRatio.toFixed(2)}` : ""}
          </span>
        )}
        {m.eventProbability != null && (
          <span className="mt-1.5 block font-mono text-[10px] tabular-nums text-muted">
            P(event) {(m.eventProbability * 100).toFixed(0)}%
          </span>
        )}
        <span className="mt-1.5 block text-[9px] leading-snug text-subtle">{PRICED_IN_DISCLAIMER}</span>
      </span>
    </span>
  );
}
