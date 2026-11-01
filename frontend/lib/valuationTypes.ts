/** Types for GET /tickers/{ticker}/valuation */

export type ValuationMetric = "eps" | "ocf" | "fcf";

export type ValuationSeriesPoint = {
  date: string;
  value: number;
};

export type ValuationCorridorPoint = {
  date: string;
  metric?: number | null;
  price?: number | null;
  fair?: number | null;
  multiple?: number | null;
};

export type ValuationCorridorBlock = {
  lookback_years?: number;
  median_multiple?: number | null;
  insufficient_history?: boolean;
  points?: ValuationCorridorPoint[];
};

export type ValuationPayload = {
  ticker: string;
  source: string;
  lookback_years: number;
  available_lookbacks: number[];
  summary: {
    price?: number | null;
    currency?: string | null;
    trailing_pe?: number | null;
    forward_pe?: number | null;
    dividend_yield?: number | null;
  };
  series: {
    price?: ValuationSeriesPoint[];
    fair_eps?: ValuationSeriesPoint[];
    fair_ocf?: ValuationSeriesPoint[];
    fair_fcf?: ValuationSeriesPoint[];
  };
  corridors: Partial<Record<ValuationMetric, ValuationCorridorBlock>>;
  estimates?: {
    source?: string;
    forward_eps?: { period: string; eps_avg: number }[];
    growth?: number | null;
  };
  pricedIn?: {
    growth?: {
      impliedCagr?: number | null;
      consensusCagr?: number | null;
      gapPp?: number | null;
      method?: string;
      source?: string;
    } | null;
  };
  unavailable_reason?: string | null;
};

export function latestFairDelta(
  block: ValuationCorridorBlock | undefined,
  spot: number | null | undefined,
): { fair: number | null; pct: number | null } {
  const pts = block?.points ?? [];
  let fair: number | null = null;
  for (let i = pts.length - 1; i >= 0; i--) {
    const f = pts[i]?.fair;
    if (f != null && Number.isFinite(f)) {
      fair = f;
      break;
    }
  }
  if (fair == null || spot == null || !Number.isFinite(spot) || fair === 0) {
    return { fair, pct: null };
  }
  return { fair, pct: ((spot - fair) / fair) * 100 };
}
