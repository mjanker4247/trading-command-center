"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { optimizePortfolio } from "@/lib/api";
import { portfolioQueryKeys, PORTFOLIO_STALE_TIMES } from "@/lib/portfolioQueries";
import { InfoPopover } from "@/components/settings/InfoPopover";
import { TickerLabel } from "@/components/ui/TickerLabel";
import { useTickerMetadata } from "@/lib/useTickerMetadata";
import {
  ALERT_BANNER_CLASS,
  BTN_PRIMARY_SM_CLASS,
  FIELD_INPUT_SM_CLASS,
  FIELD_LABEL_CLASS,
  signalToneBadgeClass,
} from "@/lib/uiClasses";
import type { AllocationObjective, AllocationResult } from "@/lib/types";

interface Props {
  portfolioId: string;
  hasHoldings: boolean;
  enabled: boolean;
}

const ALLOCATION_TOOLTIPS = {
  objective:
    "What the optimizer maximizes. Max Sharpe seeks return per unit of risk; Min volatility seeks the calmest mix; Black-Litterman starts from an equal-weight market prior and can tilt with AI verdict views.",
  minPos:
    "Floor weight for any single holding in the target portfolio (0–1). Leave at 0 to allow zero-weight names. Raising it forces broader diversification.",
  maxPos:
    "Ceiling weight for any single holding (0–1). Default 0.4 caps any name at 40% so the target stays diversified. If the cap is too tight for your holdings count, the server relaxes it just enough to stay feasible.",
  verdictViews:
    "Black-Litterman only. Maps your latest AI buy/sell run verdicts into soft expected-return views (+5% / −5%). Off = equilibrium prior only (no investor views).",
} as const;

type TooltipKey = keyof typeof ALLOCATION_TOOLTIPS;

function pct(w: number): string {
  return `${(w * 100).toFixed(1)}%`;
}

function signedPct(w: number): string {
  const v = w * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtShares(n: number): string {
  if (Math.abs(n) < 0.0001) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function deltaToneClass(value: number): string {
  if (value > 0.001) return "text-green-400";
  if (value < -0.001) return "text-red-400";
  return "text-muted";
}

const SUMMARY_CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted-surface px-2.5 py-1 text-xs text-fg-secondary";
const SUMMARY_CHIP_VALUE_CLASS = "font-data font-medium text-fg";

function FieldLabel({
  htmlFor,
  label,
  tipKey,
  openInfo,
  setOpenInfo,
}: {
  htmlFor: string;
  label: string;
  tipKey: TooltipKey;
  openInfo: TooltipKey | null;
  setOpenInfo: (k: TooltipKey | null) => void;
}) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <label htmlFor={htmlFor} className={`${FIELD_LABEL_CLASS} mb-0`}>
        {label}
      </label>
      <InfoPopover
        tooltip={ALLOCATION_TOOLTIPS[tipKey]}
        open={openInfo === tipKey}
        onToggle={() => setOpenInfo(openInfo === tipKey ? null : tipKey)}
        controlId={htmlFor}
        className="inline-flex"
        ariaLabel={`About ${label}`}
        popoverWidth={280}
      />
    </div>
  );
}

export function AllocationPanel({ portfolioId, hasHoldings, enabled }: Props) {
  const qc = useQueryClient();
  const [objective, setObjective] = useState<AllocationObjective>("sharpe");
  const [minPos, setMinPos] = useState("0");
  const [maxPos, setMaxPos] = useState("0.4");
  const [useVerdictViews, setUseVerdictViews] = useState(false);
  const [openInfo, setOpenInfo] = useState<TooltipKey | null>(null);

  const params = {
    objective,
    min_pos: Number(minPos) || 0,
    max_pos: Number(maxPos) || 0.4,
    use_verdict_views: useVerdictViews && objective === "black_litterman",
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...portfolioQueryKeys.optimize(portfolioId), params],
    queryFn: () => optimizePortfolio(portfolioId, params),
    staleTime: PORTFOLIO_STALE_TIMES.optimize,
    enabled: enabled && hasHoldings,
  });

  const mutation = useMutation({
    mutationFn: () => optimizePortfolio(portfolioId, params, "POST"),
    onSuccess: (result) => {
      qc.setQueryData([...portfolioQueryKeys.optimize(portfolioId), params], result);
    },
  });

  const result: AllocationResult | undefined = mutation.data ?? data;
  const busy = isLoading || mutation.isPending;
  const errMsg =
    (mutation.error instanceof Error && mutation.error.message) ||
    (isError && error instanceof Error ? error.message : null);

  const holdingTickers = useMemo(
    () => (result?.holdings ?? []).map((h) => h.ticker),
    [result?.holdings],
  );
  const { data: tickerMetadata = {} } = useTickerMetadata(holdingTickers, {
    enabled: holdingTickers.length > 0,
  });

  if (!enabled) {
    return (
      <div className="text-muted text-sm py-8 text-center">
        Portfolio optimizer is disabled in Strategy settings.
      </div>
    );
  }

  if (!hasHoldings) {
    return (
      <div className="text-muted text-sm py-8 text-center">
        Add holdings to run Markowitz / Black-Litterman allocation.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-fg">Target allocation</h2>
          <p className="text-xs text-muted mt-0.5">
            Research-only Markowitz / Black-Litterman weights vs your current portfolio. No orders are placed.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel
              htmlFor="alloc-objective"
              label="Objective"
              tipKey="objective"
              openInfo={openInfo}
              setOpenInfo={setOpenInfo}
            />
            <select
              id="alloc-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value as AllocationObjective)}
              className={FIELD_INPUT_SM_CLASS}
            >
              <option value="sharpe">Max Sharpe</option>
              <option value="volatility">Min volatility</option>
              <option value="black_litterman">Black-Litterman</option>
            </select>
          </div>
          <div>
            <FieldLabel
              htmlFor="alloc-min"
              label="Min position"
              tipKey="minPos"
              openInfo={openInfo}
              setOpenInfo={setOpenInfo}
            />
            <input
              id="alloc-min"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={minPos}
              onChange={(e) => setMinPos(e.target.value)}
              className={FIELD_INPUT_SM_CLASS}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="alloc-max"
              label="Max position"
              tipKey="maxPos"
              openInfo={openInfo}
              setOpenInfo={setOpenInfo}
            />
            <input
              id="alloc-max"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={maxPos}
              onChange={(e) => setMaxPos(e.target.value)}
              className={FIELD_INPUT_SM_CLASS}
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            {objective === "black_litterman" && (
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input
                  type="checkbox"
                  checked={useVerdictViews}
                  onChange={(e) => setUseVerdictViews(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Use AI verdict views</span>
                <InfoPopover
                  tooltip={ALLOCATION_TOOLTIPS.verdictViews}
                  open={openInfo === "verdictViews"}
                  onToggle={() =>
                    setOpenInfo(openInfo === "verdictViews" ? null : "verdictViews")
                  }
                  className="inline-flex"
                  ariaLabel="About AI verdict views"
                  popoverWidth={280}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={busy}
              className={BTN_PRIMARY_SM_CLASS}
            >
              {busy ? "Optimizing…" : "Run optimize"}
            </button>
          </div>
        </div>
      </div>

      {errMsg && (
        <div className={ALERT_BANNER_CLASS}>
          {errMsg}{" "}
          <button type="button" onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {busy && !result && (
        <div className="text-muted text-sm py-8 text-center">Computing allocation…</div>
      )}

      {result && result.holdings.length === 0 && (
        <div className="text-muted text-sm py-8 text-center">
          No allocation rows to show. Check that holdings have prices and overlapping history.
        </div>
      )}

      {result && result.holdings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Target weights vs your current book. Green / red deltas are research suggestions only — nothing is traded.
          </p>

          <div className="flex flex-wrap gap-2">
            <span className={SUMMARY_CHIP_CLASS}>
              Expected return{" "}
              <span className={SUMMARY_CHIP_VALUE_CLASS}>
                {(result.expected_return * 100).toFixed(1)}%
              </span>
            </span>
            <span className={SUMMARY_CHIP_CLASS}>
              Volatility{" "}
              <span className={SUMMARY_CHIP_VALUE_CLASS}>
                {(result.volatility * 100).toFixed(1)}%
              </span>
            </span>
            <span className={SUMMARY_CHIP_CLASS}>
              Sharpe <span className={SUMMARY_CHIP_VALUE_CLASS}>{result.sharpe.toFixed(2)}</span>
            </span>
            {result.views_applied.length > 0 && (
              <span className={SUMMARY_CHIP_CLASS}>
                Views{" "}
                <span className={SUMMARY_CHIP_VALUE_CLASS}>
                  {result.views_applied.join(", ")}
                </span>
              </span>
            )}
            {result.skipped.length > 0 && (
              <span
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs ${signalToneBadgeClass("warning")}`}
              >
                Skipped: {result.skipped.join(", ")}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Ticker</th>
                  <th className="text-right px-4 py-3">Current</th>
                  <th className="text-right px-4 py-3">Target</th>
                  <th className="text-right px-4 py-3">Δ Weight</th>
                  <th className="hidden sm:table-cell text-right px-4 py-3">Δ Shares</th>
                </tr>
              </thead>
              <tbody>
                {result.holdings.map((row) => (
                  <tr
                    key={row.ticker}
                    className="border-t border-border hover:bg-input/30"
                  >
                    <td className="px-4 py-2.5">
                      <TickerLabel
                        ticker={row.ticker}
                        metadata={tickerMetadata[row.ticker.toUpperCase()]}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-data text-fg-secondary">
                      {pct(row.current_weight)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-data text-fg">
                      {pct(row.target_weight)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right text-xs font-data ${deltaToneClass(row.delta_weight)}`}
                    >
                      {Math.abs(row.delta_weight) < 0.0005 ? "—" : signedPct(row.delta_weight)}
                    </td>
                    <td
                      className={`hidden sm:table-cell px-4 py-2.5 text-right text-xs font-data ${deltaToneClass(row.share_delta)}`}
                    >
                      {fmtShares(row.share_delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
