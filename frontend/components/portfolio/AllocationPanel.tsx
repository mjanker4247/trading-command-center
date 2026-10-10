"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { optimizePortfolio } from "@/lib/api";
import { allocationReasonHref } from "@/lib/allocationReasons";
import { portfolioQueryKeys, PORTFOLIO_STALE_TIMES } from "@/lib/portfolioQueries";
import { InfoPopover } from "@/components/settings/InfoPopover";
import { TickerLabel } from "@/components/ui/TickerLabel";
import { useTickerMetadata } from "@/lib/useTickerMetadata";
import {
  ALERT_BANNER_CLASS,
  BTN_PRIMARY_SM_CLASS,
  FIELD_INPUT_SM_CLASS,
  FIELD_LABEL_CLASS,
  TOUCH_TARGET_INLINE_LINK_CLASS,
  signalToneBadgeClass,
} from "@/lib/uiClasses";
import type {
  AllocationAction,
  AllocationHoldingRow,
  AllocationObjective,
  AllocationResult,
  OptimizePortfolioRequest,
  TickerMetadata,
} from "@/lib/types";

interface Props {
  portfolioId: string;
  hasHoldings: boolean;
  enabled: boolean;
  displayCurrency?: string;
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
  maxConcentration:
    "Max effective weight for any single underlying company after look-through: direct stock + sum over ETFs of (ETF weight × Yahoo top-holding %). Caps cluster risk when dividend ETFs overlap. Set to 0 to disable. Default 10%. Trades stay in whole ETF/stock units.",
} as const;

type TooltipKey = keyof typeof ALLOCATION_TOOLTIPS;

/** Adaptive % so residual sleeves are not shown as 0.0%. */
function pct(w: number): string {
  const v = Math.abs(w * 100);
  if (v > 0 && v < 0.05) return `${(w * 100).toFixed(3)}%`;
  if (v > 0 && v < 1) return `${(w * 100).toFixed(2)}%`;
  return `${(w * 100).toFixed(1)}%`;
}

function signedPct(w: number): string {
  const signed = w * 100;
  const v = Math.abs(signed);
  const digits = v > 0 && v < 0.05 ? 3 : v > 0 && v < 1 ? 2 : 1;
  return `${signed >= 0 ? "+" : ""}${signed.toFixed(digits)}%`;
}

function fmtShares(n: number | null | undefined): string {
  if (n == null || Math.abs(n) < 0.0001) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}${currency} ${abs}`;
}

function fmtMoneyPlain(n: number | null | undefined, currency: string): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${currency} ${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function deltaToneClass(value: number): string {
  if (value > 0.001) return "text-green-400";
  if (value < -0.001) return "text-red-400";
  return "text-muted";
}

function actionBadgeClass(action: AllocationAction): string {
  if (action === "BUY") return signalToneBadgeClass("success");
  if (action === "SELL") return signalToneBadgeClass("danger");
  return signalToneBadgeClass("neutral");
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

function RebalanceRows({
  rows,
  tickerMetadata,
  currency,
  portfolioId,
  optimizeParams,
}: {
  rows: AllocationHoldingRow[];
  tickerMetadata: Record<string, TickerMetadata>;
  currency: string;
  portfolioId: string;
  optimizeParams: OptimizePortfolioRequest;
}) {
  return (
    <>
      {rows.map((row) => {
        const reasonHref = allocationReasonHref(row.ticker, portfolioId, optimizeParams);
        const badgeClass = `inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${actionBadgeClass(row.action)}`;
        const badgeInner = (
          <>
            {row.action}
            {row.action !== "HOLD" && (
              <span className="font-data">{fmtShares(Math.abs(row.share_delta))} sh</span>
            )}
          </>
        );
        return (
          <tr key={row.ticker} className="border-t border-border hover:bg-input/30">
            <td className="px-4 py-2.5 align-top">
              <TickerLabel
                ticker={row.ticker}
                metadata={tickerMetadata[row.ticker.toUpperCase()]}
              />
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-data text-fg-secondary whitespace-nowrap">
              <div>{fmtShares(row.current_shares)}</div>
              <div className="text-[10px] text-muted">{fmtMoneyPlain(row.current_value, currency)}</div>
              <div className="text-[10px] text-muted">{pct(row.current_weight)}</div>
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-data text-fg whitespace-nowrap">
              <div>{fmtShares(row.target_shares)}</div>
              <div className="text-[10px] text-muted">{fmtMoneyPlain(row.target_value, currency)}</div>
              <div className="text-[10px] text-muted">{pct(row.target_weight)}</div>
            </td>
            <td className="px-4 py-2.5 text-right text-xs font-data whitespace-nowrap">
              <div className={deltaToneClass(row.delta_weight)}>
                {Math.abs(row.delta_weight) < 0.0005 ? "—" : signedPct(row.delta_weight)}
              </div>
              <div className={`text-[10px] ${deltaToneClass(row.delta_value ?? 0)}`}>
                {row.delta_value == null || Math.abs(row.delta_value) < 0.5
                  ? "—"
                  : fmtMoney(row.delta_value, currency)}
              </div>
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              {row.action === "HOLD" ? (
                <span className={badgeClass}>{badgeInner}</span>
              ) : (
                <Link
                  href={reasonHref}
                  className={`${badgeClass} ${TOUCH_TARGET_INLINE_LINK_CLASS} hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500/40`}
                  title={`Why ${row.action} ${row.ticker}?`}
                  aria-label={`Why ${row.action} ${row.ticker}`}
                >
                  {badgeInner}
                </Link>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function AllocationPanel({
  portfolioId,
  hasHoldings,
  enabled,
  displayCurrency = "USD",
}: Props) {
  const qc = useQueryClient();
  const [objective, setObjective] = useState<AllocationObjective>("sharpe");
  const [minPos, setMinPos] = useState("0");
  const [maxPos, setMaxPos] = useState("0.4");
  const [useVerdictViews, setUseVerdictViews] = useState(false);
  const [maxConcentration, setMaxConcentration] = useState("0.1");
  const [openInfo, setOpenInfo] = useState<TooltipKey | null>(null);
  const [showLookthrough, setShowLookthrough] = useState(false);

  const params = {
    objective,
    min_pos: Number(minPos) || 0,
    max_pos: Number(maxPos) || 0.4,
    use_verdict_views: useVerdictViews && objective === "black_litterman",
    max_concentration: Number(maxConcentration) || 0,
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

  const lookthrough = result?.lookthrough;
  const concActive = !!result?.lookthrough_concentration;
  const hasLookthrough =
    !!lookthrough &&
    (lookthrough.etf_tickers.length > 0 ||
      lookthrough.constituents.length > 0 ||
      lookthrough.sectors.length > 0);

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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          <div>
            <FieldLabel
              htmlFor="alloc-conc"
              label="Max look-through"
              tipKey="maxConcentration"
              openInfo={openInfo}
              setOpenInfo={setOpenInfo}
            />
            <input
              id="alloc-conc"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={maxConcentration}
              onChange={(e) => setMaxConcentration(e.target.value)}
              className={FIELD_INPUT_SM_CLASS}
            />
            <p className="mt-1 text-[10px] text-muted">0 = off · default 0.10 (10%)</p>
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
        <div className="space-y-3">
          {concActive && result.note && (
            <div className={ALERT_BANNER_CLASS}>{result.note}</div>
          )}
          <p className="text-xs text-muted">
            Integer share targets from DiscreteAllocation against NAV{" "}
            <span className="font-data text-fg-secondary">
              {fmtMoneyPlain(result.nav, displayCurrency)}
            </span>
            {result.leftover_cash != null && Math.abs(result.leftover_cash) >= 0.5 && (
              <>
                {" "}
                · leftover cash{" "}
                <span className="font-data text-fg-secondary">
                  {fmtMoneyPlain(result.leftover_cash, displayCurrency)}
                </span>
              </>
            )}
            {concActive && result.max_concentration != null && (
              <>
                {" "}
                · max look-through{" "}
                <span className="font-data text-fg-secondary">
                  {(result.max_concentration * 100).toFixed(0)}%
                </span>
              </>
            )}
            . Research only — nothing is traded.
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
                  <th className="text-left px-4 py-3">Asset</th>
                  <th className="text-right px-4 py-3">
                    Current
                    <span className="block normal-case tracking-normal font-normal text-[10px] text-muted">
                      sh · value · wt
                    </span>
                  </th>
                  <th className="text-right px-4 py-3">
                    Target
                    <span className="block normal-case tracking-normal font-normal text-[10px] text-muted">
                      sh · value · wt
                    </span>
                  </th>
                  <th className="text-right px-4 py-3">
                    Δ
                    <span className="block normal-case tracking-normal font-normal text-[10px] text-muted">
                      wt · cash
                    </span>
                  </th>
                  <th className="text-left px-4 py-3">
                    Action
                    <span className="block normal-case tracking-normal font-normal text-[10px] text-muted">
                      tap BUY/SELL for why
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <RebalanceRows
                  rows={result.holdings}
                  tickerMetadata={tickerMetadata}
                  currency={displayCurrency}
                  portfolioId={portfolioId}
                  optimizeParams={params}
                />
              </tbody>
            </table>
          </div>

          {hasLookthrough && (
            <div className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => setShowLookthrough((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm text-fg hover:bg-input/30"
              >
                <span className="font-medium">
                  ETF look-through exposure
                  {lookthrough!.etf_tickers.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted">
                      {lookthrough!.etf_tickers.join(", ")}
                    </span>
                  )}
                </span>
                <span className="text-muted text-xs">{showLookthrough ? "▾" : "▸"}</span>
              </button>
              {showLookthrough && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <p className="text-xs text-muted">{lookthrough!.note}</p>

                  {lookthrough!.constituents.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-surface text-muted text-xs uppercase tracking-wider">
                          <tr>
                            <th className="text-left px-4 py-3">Underlying</th>
                            <th className="text-right px-4 py-3">Current</th>
                            <th className="text-right px-4 py-3">Target</th>
                            <th className="text-right px-4 py-3">Δ Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lookthrough!.constituents.map((c) => (
                            <tr
                              key={c.symbol}
                              className="border-t border-border hover:bg-input/30"
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-xs text-fg">{c.symbol}</span>
                                  {c.at_limit && (
                                    <span
                                      className={`rounded border px-1.5 py-0 text-[10px] ${signalToneBadgeClass("warning")}`}
                                    >
                                      at cap
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted truncate max-w-[14rem]">
                                  {c.name}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs font-data text-fg-secondary">
                                {pct(c.current_weight)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs font-data text-fg">
                                {pct(c.target_weight)}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right text-xs font-data ${deltaToneClass(c.delta_weight)}`}
                              >
                                {Math.abs(c.delta_weight) < 0.0005
                                  ? "—"
                                  : signedPct(c.delta_weight)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {lookthrough!.sectors.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-surface text-muted text-xs uppercase tracking-wider">
                          <tr>
                            <th className="text-left px-4 py-3">Sector</th>
                            <th className="text-right px-4 py-3">Current</th>
                            <th className="text-right px-4 py-3">Target</th>
                            <th className="text-right px-4 py-3">Δ Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lookthrough!.sectors.map((s) => (
                            <tr
                              key={s.sector}
                              className="border-t border-border hover:bg-input/30"
                            >
                              <td className="px-4 py-2.5 text-xs capitalize text-fg">
                                {s.sector.replace(/_/g, " ")}
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs font-data text-fg-secondary">
                                {pct(s.current_weight)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs font-data text-fg">
                                {pct(s.target_weight)}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right text-xs font-data ${deltaToneClass(s.delta_weight)}`}
                              >
                                {Math.abs(s.delta_weight) < 0.0005
                                  ? "—"
                                  : signedPct(s.delta_weight)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
