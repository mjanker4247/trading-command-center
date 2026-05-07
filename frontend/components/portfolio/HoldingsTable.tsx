"use client";
import Link from "next/link";
import type { PortfolioHolding } from "@/lib/types";

interface HoldingsTableProps {
  holdings: PortfolioHolding[];
  priceUnavailableReason: string | null;
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtPnl(pnl: number | null, pct: number | null): string {
  if (pnl == null) return "—";
  const sign = pnl >= 0 ? "+" : "";
  const pctStr = pct != null ? ` (${pnl >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : "";
  return `${sign}${fmtMoney(pnl)}${pctStr}`;
}

const verdictBadge: Record<string, string> = {
  buy: "bg-green-500/20 text-green-300 border border-green-500/30",
  sell: "bg-red-500/20 text-red-300 border border-red-500/30",
  hold: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
};

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function HoldingsTable({ holdings, priceUnavailableReason }: HoldingsTableProps) {
  return (
    <div className="space-y-3">
      {priceUnavailableReason === "no_av_key" && (
        <div className="text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded px-3 py-2">
          Live prices unavailable — add your Alpha Vantage API key in{" "}
          <Link href="/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>
          .
        </div>
      )}

      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-navy-700 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Ticker</th>
              <th className="text-right px-4 py-3">Shares</th>
              <th className="text-right px-4 py-3">Avg Cost</th>
              <th className="text-right px-4 py-3">Current Price</th>
              <th className="text-right px-4 py-3">Market Value</th>
              <th className="text-right px-4 py-3">Unrealized P&amp;L</th>
              <th className="text-left px-4 py-3">Last Analysis</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 px-4 py-8">
                  No holdings in this snapshot.
                </td>
              </tr>
            ) : (
              holdings.map((h) => {
                const pnl = h.unrealized_pnl;
                const pnlPositive = pnl != null && pnl >= 0;
                const pnlColor =
                  pnl == null ? "text-slate-500" : pnlPositive ? "text-green-400" : "text-red-400";

                const verdictKey = h.last_run?.verdict?.toLowerCase() ?? "";
                const badgeClass = verdictBadge[verdictKey] ?? "bg-slate-700 text-slate-300 border border-slate-600";

                return (
                  <tr
                    key={h.ticker}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    {/* Ticker */}
                    <td className="px-4 py-3">
                      {h.last_run ? (
                        <Link
                          href={`/runs/${h.last_run.run_id}`}
                          className="font-mono text-purple-400 hover:underline"
                        >
                          {h.ticker}
                        </Link>
                      ) : (
                        <span className="font-mono text-purple-400">{h.ticker}</span>
                      )}
                    </td>

                    {/* Shares */}
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {h.shares.toLocaleString("en-US")}
                    </td>

                    {/* Avg Cost */}
                    <td className="px-4 py-3 text-right text-slate-400 tabular-nums">
                      {fmtMoney(h.avg_cost)}
                    </td>

                    {/* Current Price */}
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {fmtMoney(h.current_price)}
                    </td>

                    {/* Market Value */}
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {fmtMoney(h.market_value)}
                    </td>

                    {/* Unrealized P&L */}
                    <td className={`px-4 py-3 text-right tabular-nums ${pnlColor}`}>
                      {fmtPnl(pnl, h.unrealized_pnl_pct)}
                    </td>

                    {/* Last Analysis */}
                    <td className="px-4 py-3">
                      {h.last_run ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                          >
                            {(h.last_run.verdict ?? "").toUpperCase()}
                          </span>
                          <Link
                            href={`/runs/${h.last_run.run_id}`}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            {daysAgo(h.last_run.analysis_date)}d ago →
                          </Link>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs">Not analyzed</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/runs/new?ticker=${encodeURIComponent(h.ticker)}`}
                        className="text-xs text-slate-400 hover:text-blue-400 transition-colors"
                      >
                        Analyze
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
