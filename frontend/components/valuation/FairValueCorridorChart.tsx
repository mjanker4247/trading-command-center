"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ValuationCorridorBlock, ValuationMetric } from "@/lib/valuationTypes";

type Props = {
  metric: ValuationMetric;
  lookback: number;
  availableLookbacks: number[];
  block: ValuationCorridorBlock | undefined;
  currency: string;
  onMetricChange: (m: ValuationMetric) => void;
  onLookbackChange: (n: number) => void;
};

type ChartRow = {
  date: string;
  label: string;
  price: number | null;
  fair: number | null;
  undervalBase: number | null;
  undervalGap: number | null;
  overvalBase: number | null;
  overvalGap: number | null;
};

const METRICS: { id: ValuationMetric; label: string }[] = [
  { id: "eps", label: "EPS" },
  { id: "ocf", label: "OCF" },
  { id: "fcf", label: "FCF" },
];

function yearLabel(iso: string): string {
  return iso.slice(0, 4);
}

function buildRows(block: ValuationCorridorBlock | undefined): ChartRow[] {
  const pts = block?.points ?? [];
  return pts
    .filter((p) => p.price != null || p.fair != null)
    .map((p) => {
      const price = p.price != null && Number.isFinite(p.price) ? p.price : null;
      const fair = p.fair != null && Number.isFinite(p.fair) ? p.fair : null;
      let undervalBase: number | null = null;
      let undervalGap: number | null = null;
      let overvalBase: number | null = null;
      let overvalGap: number | null = null;
      if (price != null && fair != null) {
        if (price < fair) {
          undervalBase = price;
          undervalGap = fair - price;
        } else if (price > fair) {
          overvalBase = fair;
          overvalGap = price - fair;
        }
      }
      return {
        date: p.date,
        label: yearLabel(p.date),
        price,
        fair,
        undervalBase,
        undervalGap,
        overvalBase,
        overvalGap,
      };
    });
}

function CorridorTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fmt = (n: number | null) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currency || "USD",
          maximumFractionDigits: 2,
        }).format(n);
  const vs =
    row.price != null && row.fair != null && row.fair !== 0
      ? ((row.price - row.fair) / row.fair) * 100
      : null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-fg">{row.label}</p>
      <p className="font-mono tabular-nums text-fg-secondary">Price {fmt(row.price)}</p>
      <p className="font-mono tabular-nums text-fg-secondary">Fair {fmt(row.fair)}</p>
      {vs != null && (
        <p className="mt-1 font-mono tabular-nums text-muted">
          {vs >= 0 ? "+" : ""}
          {vs.toFixed(1)}% vs fair
        </p>
      )}
    </div>
  );
}

export function FairValueCorridorChart({
  metric,
  lookback,
  availableLookbacks,
  block,
  currency,
  onMetricChange,
  onLookbackChange,
}: Props) {
  const rows = useMemo(() => buildRows(block), [block]);
  const insufficient = block?.insufficient_history || rows.length < 2;
  const lookbacks = availableLookbacks.length ? availableLookbacks : [lookback];

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Fair value corridor</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Median multiples — research estimate, not a trade signal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-input-border bg-elevated p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMetricChange(m.id)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  metric === m.id
                    ? "bg-surface text-link shadow-sm"
                    : "text-muted hover:text-fg-secondary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            Lookback
            <select
              value={lookback}
              onChange={(e) => onLookbackChange(Number(e.target.value))}
              className="rounded-md border border-input-border bg-input px-2 py-1 text-xs text-fg"
            >
              {lookbacks.map((n) => (
                <option key={n} value={n}>
                  {n}Y
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {insufficient ? (
        <p className="py-12 text-center text-sm text-muted">
          Insufficient history for {metric.toUpperCase()} corridor.
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--af-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--af-muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--af-border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--af-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat(undefined, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(v)
                }
              />
              <Tooltip content={<CorridorTooltip currency={currency} />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--af-muted)" }}
                formatter={(value) => <span className="text-muted">{value}</span>}
              />
              {/* Undervaluation band: price → fair (success-soft) */}
              <Area
                type="monotone"
                dataKey="undervalBase"
                stackId="under"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="undervalGap"
                name="Below fair"
                stackId="under"
                stroke="none"
                fill="var(--af-success-soft)"
                fillOpacity={0.85}
                isAnimationActive={false}
              />
              {/* Overvaluation band: fair → price (danger-soft) */}
              <Area
                type="monotone"
                dataKey="overvalBase"
                stackId="over"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="overvalGap"
                name="Above fair"
                stackId="over"
                stroke="none"
                fill="var(--af-danger-soft)"
                fillOpacity={0.85}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="fair"
                name={`Fair (${metric.toUpperCase()})`}
                stroke="var(--af-info)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--af-info)" }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="price"
                name="Price"
                stroke="var(--af-fg)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--af-fg)" }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {block?.median_multiple != null && (
        <p className="mt-2 text-[11px] text-muted">
          Trailing median multiple ({lookback}Y):{" "}
          <span className="font-mono tabular-nums text-fg-secondary">
            {block.median_multiple.toFixed(1)}×
          </span>
        </p>
      )}
    </section>
  );
}
