"use client";

import {
  levelLabel,
  pricedInTooltip,
  type PricedInLevel,
  type PricedInStatus,
} from "@/lib/pricedIn";
import { signalToneBadgeClass } from "@/lib/uiClasses";

function toneForLevel(level: PricedInLevel): "success" | "warning" | "neutral" {
  if (level === "full") return "success";
  if (level === "partial") return "warning";
  return "neutral";
}

interface Props {
  status: PricedInStatus | null | undefined;
}

/** Compact event priced-in pill. Null/undefined → muted fallback. */
export function PricedInBadge({ status }: Props) {
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

  return (
    <span
      className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded ${signalToneBadgeClass(toneForLevel(status.level))}`}
      title={pricedInTooltip(status)}
      aria-label={`${levelLabel(status.level)}, ${status.percentage} percent`}
    >
      {status.percentage}%
    </span>
  );
}
