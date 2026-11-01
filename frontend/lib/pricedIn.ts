/**
 * Event "priced-in" status for upcoming market events (earnings, etc.).
 *
 * Calculation / mock stay here; UI only renders `PricedInStatus`.
 * v1 uses a deterministic mock until a live options/consensus API exists.
 */

export type PricedInLevel = "full" | "partial" | "none";

export interface PricedInMetrics {
  /** Implied-vol percentile vs recent history (0–100). */
  ivPercentile: number;
  /** Distance to consensus target as % of spot (signed). */
  consensusTargetDistancePct: number;
  /** Put/call skew summary as a short label. */
  optionsSkew: string;
}

export interface PricedInStatus {
  percentage: number;
  level: PricedInLevel;
  keyFactor: string;
  metrics: PricedInMetrics;
  /** Always "mock" until a real provider is wired. */
  source: "mock";
}

export const PRICED_IN_FULL_MIN = 70;
export const PRICED_IN_PARTIAL_MIN = 40;

export function levelFromPercentage(percentage: number): PricedInLevel {
  if (percentage >= PRICED_IN_FULL_MIN) return "full";
  if (percentage >= PRICED_IN_PARTIAL_MIN) return "partial";
  return "none";
}

export function levelLabel(level: PricedInLevel): string {
  switch (level) {
    case "full":
      return "Fully priced-in";
    case "partial":
      return "Partially priced-in";
    default:
      return "Not priced-in";
  }
}

/** Stable 32-bit hash for deterministic mock values. */
export function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit01(seed: number, salt: number): number {
  // xorshift-ish mix → [0, 1)
  let x = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x100000000;
}

const SKEW_LABELS = ["put-heavy", "call-heavy", "near-flat"] as const;

/**
 * Deterministic mock priced-in status for an earnings (or similar) event.
 * Same ticker + date → same result across renders.
 */
export function mockPricedInStatus(ticker: string, eventDate: string): PricedInStatus {
  const key = `${ticker.trim().toUpperCase()}|${eventDate.trim()}`;
  const seed = hashKey(key);
  const percentage = Math.round(unit01(seed, 1) * 100);
  const level = levelFromPercentage(percentage);
  const ivPercentile = Math.round(unit01(seed, 2) * 100);
  const consensusTargetDistancePct = Math.round((unit01(seed, 3) * 24 - 12) * 10) / 10;
  const optionsSkew = SKEW_LABELS[Math.floor(unit01(seed, 4) * SKEW_LABELS.length)]!;

  const keyFactor =
    level === "full"
      ? `IV already elevated (mock IV%ile ${ivPercentile})`
      : level === "partial"
        ? `Mixed: target gap ${consensusTargetDistancePct}% / skew ${optionsSkew} (mock)`
        : `Little move in options vs event (mock; skew ${optionsSkew})`;

  return {
    percentage,
    level,
    keyFactor,
    metrics: { ivPercentile, consensusTargetDistancePct, optionsSkew },
    source: "mock",
  };
}

/**
 * Resolve priced-in status for an earnings row.
 * Returns null when ticker/date missing (badge shows neutral fallback).
 */
export function resolvePricedInForEarningsEvent(
  ticker: string | null | undefined,
  eventDate: string | null | undefined,
): PricedInStatus | null {
  if (!ticker?.trim() || !eventDate?.trim()) return null;
  // Swap this body for a live provider later; keep the same return shape.
  return mockPricedInStatus(ticker, eventDate);
}

export function pricedInTooltip(status: PricedInStatus): string {
  const { metrics } = status;
  return [
    `${levelLabel(status.level)} · ${status.percentage}%`,
    `IV percentile: ${metrics.ivPercentile}`,
    `Consensus target distance: ${metrics.consensusTargetDistancePct}%`,
    `Options skew: ${metrics.optionsSkew}`,
    `Key factor: ${status.keyFactor}`,
    "Event pricing estimate (mock) — not a trade signal",
  ].join(" · ");
}
