/**
 * Priced-in facade: deterministic fixture inputs → pure engines.
 * UI should prefer `PricedInAssessment` from `pricedInEngine`.
 */

import {
  assessEarningsPricedIn,
  assessMacroPricedIn,
  statusLabel,
  type PricedInAssessment,
  type PricedInStatusKind,
  PRICED_IN_FULL_MIN,
  PRICED_IN_PARTIAL_MIN,
} from "./pricedInEngine";

export type {
  PricedInAssessment,
  PricedInEventType,
  PricedInStatusKind,
  MacroPricedInInput,
  EarningsPricedInInput,
} from "./pricedInEngine";

export {
  assessEarningsPricedIn,
  assessMacroPricedIn,
  statusFromScore,
  statusLabel,
  normalizeRatioToScore,
  PRICED_IN_FULL_MIN,
  PRICED_IN_PARTIAL_MIN,
} from "./pricedInEngine";

/** @deprecated Use PricedInStatusKind — kept for any lingering aliases. */
export type PricedInLevel = "full" | "partial" | "none";

export const PRICED_IN_BACKGROUND = [
  "“Priced-in” estimates how much of an upcoming event is already reflected in options or rate markets — not a buy/sell signal.",
  "Earnings engine: ATM call+put straddle × 0.85 / spot vs historical average post-event move.",
  "Macro engine: (implied rate − current rate) / step size → event probability.",
].join(" ");

export const PRICED_IN_DISCLAIMER =
  "Research estimate (fixture inputs until live options/rates feeds) — not a trade signal.";

export function levelFromPercentage(percentage: number): PricedInLevel {
  if (percentage >= PRICED_IN_FULL_MIN) return "full";
  if (percentage >= PRICED_IN_PARTIAL_MIN) return "partial";
  return "none";
}

export function levelLabel(level: PricedInLevel | PricedInStatusKind): string {
  if (level === "fully" || level === "full") return statusLabel("fully");
  if (level === "partially" || level === "partial") return statusLabel("partially");
  return statusLabel("unpriced");
}

export function statusTone(
  status: PricedInStatusKind | null | undefined,
): "success" | "warning" | "info" | "neutral" {
  if (!status) return "neutral";
  if (status === "fully") return "success";
  if (status === "partially") return "warning";
  return "info";
}

/** Stable 32-bit hash for deterministic fixture values. */
export function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit01(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x100000000;
}

/**
 * Build deterministic mock ATM / spot / hist inputs for the earnings engine.
 */
export function mockEarningsEngineInput(ticker: string, eventDate: string) {
  const key = `${ticker.trim().toUpperCase()}|${eventDate.trim()}`;
  const seed = hashKey(key);
  const spot = Math.round((80 + unit01(seed, 1) * 320) * 100) / 100;
  const historicalAvgMovePct = Math.round((3 + unit01(seed, 2) * 9) * 10) / 10; // 3–12%
  const ratio = 0.35 + unit01(seed, 3) * 1.5; // ~0.35–1.85 → spans unpriced→fully
  const impliedMovePct = historicalAvgMovePct * ratio;
  // ((c+p)*0.85)/S0*100 = impliedMovePct → c+p = impliedMovePct/100 * S0 / 0.85
  const straddle = (impliedMovePct / 100) * spot / 0.85;
  const atmCall = Math.round((straddle / 2) * 100) / 100;
  const atmPut = Math.round((straddle / 2) * 100) / 100;
  return {
    symbol: ticker.trim().toUpperCase(),
    spot,
    atmCall,
    atmPut,
    historicalAvgMovePct,
    eventDate: eventDate.trim(),
  };
}

export function mockMacroEngineInput(symbol: string, meetingDate: string) {
  const key = `${symbol.trim().toUpperCase()}|${meetingDate.trim()}`;
  const seed = hashKey(key);
  const currentRate = 0.04 + unit01(seed, 1) * 0.02;
  const stepSize = 0.0025;
  const probability = unit01(seed, 2); // 0–1
  const impliedRate = currentRate + probability * stepSize;
  return {
    symbol: symbol.trim().toUpperCase(),
    currentRate,
    impliedRate,
    stepSize,
    meetingDate: meetingDate.trim(),
  };
}

export function resolveEarningsPricedIn(
  ticker: string | null | undefined,
  eventDate: string | null | undefined,
): PricedInAssessment | null {
  if (!ticker?.trim() || !eventDate?.trim()) return null;
  return assessEarningsPricedIn(mockEarningsEngineInput(ticker, eventDate));
}

export function resolveMacroPricedIn(
  symbol: string | null | undefined,
  meetingDate: string | null | undefined,
): PricedInAssessment | null {
  if (!symbol?.trim() || !meetingDate?.trim()) return null;
  return assessMacroPricedIn(mockMacroEngineInput(symbol, meetingDate));
}

/** @deprecated Prefer resolveEarningsPricedIn */
export function resolvePricedInForEarningsEvent(
  ticker: string | null | undefined,
  eventDate: string | null | undefined,
): PricedInAssessment | null {
  return resolveEarningsPricedIn(ticker, eventDate);
}

export function pricedInTooltip(assessment: PricedInAssessment): string {
  const parts = [
    `${statusLabel(assessment.status)} · ${assessment.score}%`,
    assessment.summary,
  ];
  const m = assessment.metrics;
  if (m.impliedMovePct != null && m.historicalMovePct != null) {
    parts.push(`Ratio: ${(m.pricedInRatio ?? 0).toFixed(2)}`);
  }
  if (m.eventProbability != null) {
    parts.push(`Probability: ${(m.eventProbability * 100).toFixed(0)}%`);
  }
  parts.push(PRICED_IN_DISCLAIMER);
  return parts.join(" · ");
}
