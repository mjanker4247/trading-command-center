/**
 * Pure Market Priced-In engines (macro rate step + earnings ATM straddle).
 * No I/O — callers supply numbers or fixture inputs.
 */

export type PricedInStatusKind = "fully" | "partially" | "unpriced";
export type PricedInEventType = "macro" | "earnings" | "valuation";

export interface PricedInAssessment {
  symbol: string;
  eventType: PricedInEventType;
  score: number; // 0–100
  status: PricedInStatusKind;
  metrics: {
    impliedMovePct?: number;
    historicalMovePct?: number;
    pricedInRatio?: number;
    eventProbability?: number;
    consensusDeviation?: number;
  };
  summary: string;
}

export type MacroPricedInInput = {
  symbol: string;
  currentRate: number;
  impliedRate: number;
  stepSize: number;
  meetingDate?: string;
};

export type EarningsPricedInInput = {
  symbol: string;
  spot: number;
  atmCall: number | null | undefined;
  atmPut: number | null | undefined;
  historicalAvgMovePct: number;
  eventDate?: string;
};

export const PRICED_IN_FULL_MIN = 80;
export const PRICED_IN_PARTIAL_MIN = 40;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function statusFromScore(score: number): PricedInStatusKind {
  if (score >= PRICED_IN_FULL_MIN) return "fully";
  if (score >= PRICED_IN_PARTIAL_MIN) return "partially";
  return "unpriced";
}

/** Map priced-in ratio (1.0 = implied ≈ hist) onto 0–100. */
export function normalizeRatioToScore(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(clamp(ratio * 100, 0, 100));
}

export function statusLabel(status: PricedInStatusKind): string {
  switch (status) {
    case "fully":
      return "Fully Priced-In";
    case "partially":
      return "Partially Priced-In";
    default:
      return "Unpriced / High Asymmetry";
  }
}

export function assessMacroPricedIn(input: MacroPricedInInput): PricedInAssessment | null {
  const { symbol, currentRate, impliedRate, stepSize } = input;
  if (!symbol?.trim()) return null;
  if (!Number.isFinite(currentRate) || !Number.isFinite(impliedRate)) return null;
  if (!Number.isFinite(stepSize) || stepSize <= 0) return null;

  const probability = clamp((impliedRate - currentRate) / stepSize, 0, 1);
  const score = Math.round(clamp(probability * 100, 0, 100));
  const status = statusFromScore(score);
  const stepBp = Math.round(stepSize * 10000); // rate fraction → bp if rates are decimals like 0.0025
  const stepLabel =
    stepSize > 0 && stepSize < 1
      ? `${stepBp} bp`
      : `${stepSize}`;

  return {
    symbol: symbol.trim().toUpperCase(),
    eventType: "macro",
    score,
    status,
    metrics: { eventProbability: probability },
    summary: `Implied move probability: ${score}% (step ${stepLabel})`,
  };
}

export function assessEarningsPricedIn(
  input: EarningsPricedInInput,
): PricedInAssessment | null {
  const { symbol, spot, atmCall, atmPut, historicalAvgMovePct } = input;
  if (!symbol?.trim()) return null;
  if (!Number.isFinite(spot) || spot <= 0) return null;
  if (atmCall == null || atmPut == null) return null;
  if (!Number.isFinite(atmCall) || !Number.isFinite(atmPut)) return null;
  if (atmCall < 0 || atmPut < 0) return null;
  if (!Number.isFinite(historicalAvgMovePct) || historicalAvgMovePct <= 0) return null;

  const impliedMovePct = ((atmCall + atmPut) * 0.85) / spot * 100;
  if (!Number.isFinite(impliedMovePct)) return null;

  const pricedInRatio = impliedMovePct / historicalAvgMovePct;
  const score = normalizeRatioToScore(pricedInRatio);
  const status = statusFromScore(score);

  return {
    symbol: symbol.trim().toUpperCase(),
    eventType: "earnings",
    score,
    status,
    metrics: {
      impliedMovePct: round1(impliedMovePct),
      historicalMovePct: round1(historicalAvgMovePct),
      pricedInRatio: round2(pricedInRatio),
    },
    summary: `Implied move: ±${round1(impliedMovePct)}% vs. Hist. median: ±${round1(historicalAvgMovePct)}%`,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
