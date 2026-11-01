"use client";

import { useMemo, useState } from "react";
import type { ValuationCorridorBlock, ValuationPayload } from "@/lib/valuationTypes";

type Props = {
  summary: ValuationPayload["summary"];
  epsBlock: ValuationCorridorBlock | undefined;
  estimates: ValuationPayload["estimates"];
};

function cagr(start: number, end: number, years: number): number | null {
  if (years <= 0 || start <= 0 || end <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

export function ForecastCalculator({ summary, epsBlock, estimates }: Props) {
  const defaultMultiple = epsBlock?.median_multiple ?? summary.trailing_pe ?? 20;
  const [terminalMultiple, setTerminalMultiple] = useState(
    () => Math.round(Number(defaultMultiple) * 10) / 10 || 20,
  );
  const [years, setYears] = useState(3);

  const spot = summary.price ?? null;
  const forwardEps = estimates?.forward_eps?.[0]?.eps_avg ?? null;
  const currency = summary.currency ?? "USD";

  const result = useMemo(() => {
    if (spot == null || forwardEps == null || forwardEps <= 0) {
      return { terminalPrice: null, totalReturn: null, cagr: null };
    }
    // ponytail: FY+1 EPS held flat as proxy for year-N EPS until richer estimates land
    const terminalPrice = forwardEps * terminalMultiple;
    const totalReturn = (terminalPrice - spot) / spot;
    return {
      terminalPrice,
      totalReturn,
      cagr: cagr(spot, terminalPrice, years),
    };
  }, [spot, forwardEps, terminalMultiple, years]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">Forecast &amp; CAGR</h2>
      <p className="mt-0.5 text-[11px] text-muted">
        Research calculator — terminal price = forward EPS × terminal multiple.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Terminal P/E
          <input
            type="range"
            min={5}
            max={60}
            step={0.5}
            value={terminalMultiple}
            onChange={(e) => setTerminalMultiple(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--af-link)]"
          />
          <span className="mt-1 block font-mono tabular-nums text-fg">{terminalMultiple.toFixed(1)}×</span>
        </label>
        <label className="block text-xs text-muted">
          Horizon (years)
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--af-link)]"
          />
          <span className="mt-1 block font-mono tabular-nums text-fg">{years}Y</span>
        </label>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
        <div>
          <dt className="text-muted">Fwd EPS</dt>
          <dd className="font-mono tabular-nums text-fg">
            {forwardEps != null ? fmtMoney(forwardEps) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Terminal price</dt>
          <dd className="font-mono tabular-nums text-fg">
            {result.terminalPrice != null ? fmtMoney(result.terminalPrice) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">CAGR</dt>
          <dd className="font-mono tabular-nums text-fg">
            {result.cagr == null ? "—" : `${(result.cagr * 100).toFixed(1)}%`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
