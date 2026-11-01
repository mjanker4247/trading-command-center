/**
 * Event "priced-in" status for upcoming market events (earnings, etc.).
 *
 * Calculation / mock stay here; UI only renders `PricedInStatus`.
 * v1 mocks the *inputs* (options/consensus feeds) but composes the % from
 * commonly used event-pricing indicators — not a free-floating random score.
 *
 * Common practitioner toolkit this maps to:
 * - IV percentile / rank into the print
 * - Implied move (ATM straddle) vs average historical post-event move
 * - Options skew (put vs call) for asymmetric hedging into the event
 * - Distance to street consensus / whisper as a residual surprise gap
 */

export type PricedInLevel = "full" | "partial" | "none";
export type OptionsSkewLabel = "put-heavy" | "call-heavy" | "near-flat";

export interface PricedInMetrics {
  /** Implied-vol percentile vs recent history (0–100). */
  ivPercentile: number;
  /** ATM-straddle style implied 1-day move into the event (%). */
  impliedMovePct: number;
  /** Average absolute post-event move over recent prints (%). */
  historicalMovePct: number;
  /** impliedMove / historicalMove (>1 → options imply a larger move than usual). */
  moveRatio: number;
  /** Distance to consensus target as % of spot (signed). */
  consensusTargetDistancePct: number;
  /** Put/call skew summary. */
  optionsSkew: OptionsSkewLabel;
}

export interface PricedInStatus {
  percentage: number;
  level: PricedInLevel;
  keyFactor: string;
  metrics: PricedInMetrics;
  /** Always "mock" until a live provider is wired. */
  source: "mock";
}

export const PRICED_IN_FULL_MIN = 70;
export const PRICED_IN_PARTIAL_MIN = 40;

/** Short explainer for confluence / earnings UI. */
export const PRICED_IN_BACKGROUND = [
  "“Priced-in” estimates how much of an upcoming event (often earnings) is already reflected in the options market and street consensus — not a buy/sell signal.",
  "Practitioners usually compare: (1) IV percentile into the print, (2) implied move from the ATM straddle vs the stock’s typical post-event move, (3) put/call skew, and (4) gap to consensus/whisper targets.",
  "High IV + implied move ≫ historical move → more of the expected volatility is paid for already. A large consensus gap can still leave directional surprise room even when vol looks priced.",
].join(" ");

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
  let x = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x100000000;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Compose a 0–100 priced-in score from common event-pricing inputs.
 *
 * Weights (research heuristic, not a live model):
 * - 40% IV percentile (elevated vol into the event)
 * - 40% move ratio (implied vs historical absolute move)
 * - 20% consensus proximity (large |target gap| → less “settled”)
 * Skew adds a small asymmetric hedge cue (±4 pts).
 */
export function scorePricedInPercentage(metrics: PricedInMetrics): number {
  const ivScore = clamp(metrics.ivPercentile, 0, 100);
  // ratio 0 → 0, 1 → ~50, ≥2 → 100
  const moveScore = clamp(metrics.moveRatio * 50, 0, 100);
  const consensusScore = clamp(100 - Math.abs(metrics.consensusTargetDistancePct) * 5, 0, 100);
  const skewAdj =
    metrics.optionsSkew === "near-flat" ? 0 : metrics.optionsSkew === "put-heavy" ? 4 : -2;

  const raw = ivScore * 0.4 + moveScore * 0.4 + consensusScore * 0.2 + skewAdj;
  return Math.round(clamp(raw, 0, 100));
}

function keyFactorFor(metrics: PricedInMetrics, level: PricedInLevel): string {
  if (level === "full") {
    return `IV%ile ${metrics.ivPercentile} with implied ${metrics.impliedMovePct}% vs hist ${metrics.historicalMovePct}% (ratio ${metrics.moveRatio.toFixed(2)})`;
  }
  if (level === "partial") {
    return `Mixed: move ratio ${metrics.moveRatio.toFixed(2)}, consensus gap ${metrics.consensusTargetDistancePct}%, skew ${metrics.optionsSkew}`;
  }
  return `Soft vol pricing — IV%ile ${metrics.ivPercentile}, implied ${metrics.impliedMovePct}% ≈ hist ${metrics.historicalMovePct}%`;
}

const SKEW_LABELS: OptionsSkewLabel[] = ["put-heavy", "call-heavy", "near-flat"];

/**
 * Deterministic mock priced-in status for an earnings (or similar) event.
 * Same ticker + date → same result across renders.
 */
export function mockPricedInStatus(ticker: string, eventDate: string): PricedInStatus {
  const key = `${ticker.trim().toUpperCase()}|${eventDate.trim()}`;
  const seed = hashKey(key);

  const ivPercentile = Math.round(unit01(seed, 2) * 100);
  const historicalMovePct = Math.round((3 + unit01(seed, 5) * 9) * 10) / 10; // ~3–12%
  const moveRatio = Math.round((0.4 + unit01(seed, 6) * 2.2) * 100) / 100; // ~0.4–2.6
  const impliedMovePct = Math.round(historicalMovePct * moveRatio * 10) / 10;
  const consensusTargetDistancePct = Math.round((unit01(seed, 3) * 24 - 12) * 10) / 10;
  const optionsSkew = SKEW_LABELS[Math.floor(unit01(seed, 4) * SKEW_LABELS.length)]!;

  const metrics: PricedInMetrics = {
    ivPercentile,
    impliedMovePct,
    historicalMovePct,
    moveRatio,
    consensusTargetDistancePct,
    optionsSkew,
  };

  const percentage = scorePricedInPercentage(metrics);
  const level = levelFromPercentage(percentage);

  return {
    percentage,
    level,
    keyFactor: keyFactorFor(metrics, level),
    metrics,
    source: "mock",
  };
}

/**
 * Resolve priced-in status for an earnings / analysis-date event.
 * Returns null when ticker/date missing (badge shows neutral fallback).
 */
export function resolvePricedInForEarningsEvent(
  ticker: string | null | undefined,
  eventDate: string | null | undefined,
): PricedInStatus | null {
  if (!ticker?.trim() || !eventDate?.trim()) return null;
  return mockPricedInStatus(ticker, eventDate);
}

export function pricedInTooltip(status: PricedInStatus): string {
  const { metrics } = status;
  return [
    `${levelLabel(status.level)} · ${status.percentage}%`,
    `IV percentile: ${metrics.ivPercentile}`,
    `Implied move: ${metrics.impliedMovePct}%`,
    `Hist. post-event: ${metrics.historicalMovePct}%`,
    `Move ratio: ${metrics.moveRatio.toFixed(2)}`,
    `Consensus target distance: ${metrics.consensusTargetDistancePct}%`,
    `Options skew: ${metrics.optionsSkew}`,
    `Key factor: ${status.keyFactor}`,
    "Event pricing estimate (mock inputs) — not a trade signal",
  ].join(" · ");
}
