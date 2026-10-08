"use client";
import type { RunOutcome } from "@/lib/types";
import { fmtMoney } from "@/lib/currency";

function pct(base: number | null, target: number | null): string {
  if (!base || !target) return "—";
  const p = ((target - base) / base) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
}

function pctColor(base: number | null, target: number | null, verdict: string): string {
  if (!base || !target) return "text-muted";
  const up = target > base;
  const correct = (verdict === "buy" && up) || (verdict === "sell" && !up);
  return correct ? "text-green-400" : "text-red-400";
}

const CHECKPOINTS: Array<{ label: string; key: keyof RunOutcome }> = [
  { label: "Day 0", key: "price_at_analysis" },
  { label: "+7d", key: "price_7d" },
  { label: "+14d", key: "price_14d" },
  { label: "+30d", key: "price_30d" },
  { label: "+90d", key: "price_90d" },
];

export function OutcomeCard({ outcome }: { outcome: RunOutcome }) {
  const base = outcome.price_at_analysis;
  const currency = outcome.price_currency ?? "USD";

  return (
    <div className="bg-elevated border border-input-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-fg-secondary uppercase tracking-wide mb-4">
        Trade Outcome ({currency})
      </h2>
      {/* auto-fill: sidebar (~20rem) wraps to 2–3 cols so $1,088.00 fits; wide layouts still densify */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">
        {CHECKPOINTS.map(({ label, key }) => {
          const price = outcome[key] as number | null;
          const formatted = price != null ? fmtMoney(price, currency) : "—";
          return (
            <div
              key={label}
              className="min-w-0 flex flex-col items-center bg-page rounded-lg px-2 py-2.5 gap-0.5"
            >
              <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
              <span
                className="w-full min-w-0 truncate text-center font-mono text-xs tabular-nums font-semibold text-fg"
                title={formatted}
              >
                {formatted}
              </span>
              {key !== "price_at_analysis" && (
                <span className={`text-[10px] font-medium tabular-nums ${pctColor(base, price, outcome.verdict)}`}>
                  {pct(base, price)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-3">
        Verdict was{" "}
        <span className="font-semibold text-muted">{outcome.verdict.toUpperCase()}</span>.
        Prices are in {currency}. Future dates show &ldquo;—&rdquo; until available.
      </p>
    </div>
  );
}
