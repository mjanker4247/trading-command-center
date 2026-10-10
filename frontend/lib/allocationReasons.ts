import type {
  AllocationHoldingRow,
  AllocationObjective,
  AllocationResult,
  OptimizePortfolioRequest,
} from "@/lib/types";

const OBJECTIVE_LABEL: Record<AllocationObjective, string> = {
  sharpe: "Max Sharpe",
  volatility: "Min volatility",
  black_litterman: "Black-Litterman",
};

const OBJECTIVE_WHY: Record<AllocationObjective, string> = {
  sharpe:
    "Max Sharpe picks the mix with the highest expected return per unit of historical volatility across your holdings (risk-free rate = 0 in the library default).",
  volatility:
    "Min volatility favors the calmest mix of your holdings, even if that means less expected upside.",
  black_litterman:
    "Black-Litterman starts from an equal-weight market prior, then tilts toward or away from names based on optional AI verdict views.",
};

export type AllocationReasonBullet = {
  title: string;
  detail: string;
};

export type AllocationReasonSummary = {
  /** Short verdict line under the badge */
  headline: string;
  /** Clarifying lead: portfolio math, not a stock thesis */
  framing: string;
  bullets: AllocationReasonBullet[];
  /** Explicit non-claims */
  notThis: string[];
  /** How to read the badge for morning desk */
  practical: string;
  disclaimer: string;
};

/** Adaptive % so residual sleeves (e.g. 0.015%) are not shown as 0.0% / ~0%. */
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

function fmtShares(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function money(n: number | null | undefined, currency: string): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${currency} ${abs}`;
}

/** Tiny residual sleeve — e.g. CBK at ~0.1% of a large book */
function isResidualSleeve(row: AllocationHoldingRow): boolean {
  return row.current_weight > 0 && row.current_weight < 0.01;
}

function isExitToZero(row: AllocationHoldingRow): boolean {
  return row.action === "SELL" && row.target_weight < 0.0005 && row.current_shares > 0;
}

/** True only when there is no existing position — not merely a tiny weight in a large NAV. */
function isFullAdd(row: AllocationHoldingRow): boolean {
  return row.action === "BUY" && row.current_shares < 0.5;
}

/** Parse optimize params from a URL search string (shared by panel links + reason page). */
export function parseOptimizeSearchParams(
  search: URLSearchParams | { get(name: string): string | null },
): OptimizePortfolioRequest {
  const objectiveRaw = search.get("objective");
  const objective =
    objectiveRaw === "sharpe" ||
    objectiveRaw === "volatility" ||
    objectiveRaw === "black_litterman"
      ? objectiveRaw
      : "sharpe";
  const minRaw = search.get("min_pos");
  const maxRaw = search.get("max_pos");
  const viewsRaw = search.get("use_verdict_views");
  const concRaw = search.get("max_concentration");
  return {
    objective,
    min_pos: minRaw != null && minRaw !== "" ? Number(minRaw) : 0,
    max_pos: maxRaw != null && maxRaw !== "" ? Number(maxRaw) : 0.4,
    use_verdict_views: viewsRaw === "true" || viewsRaw === "1",
    max_concentration:
      concRaw != null && concRaw !== "" ? Number(concRaw) : 0.1,
  };
}

/** Build href for the per-ticker allocation reason page. */
export function allocationReasonHref(
  ticker: string,
  portfolioId: string,
  params: OptimizePortfolioRequest,
): string {
  const q = new URLSearchParams();
  q.set("portfolio", portfolioId);
  if (params.objective) q.set("objective", params.objective);
  if (params.min_pos != null) q.set("min_pos", String(params.min_pos));
  if (params.max_pos != null) q.set("max_pos", String(params.max_pos));
  if (params.use_verdict_views) q.set("use_verdict_views", "true");
  if (params.max_concentration != null) {
    q.set("max_concentration", String(params.max_concentration));
  }
  return `/portfolio/allocation/${encodeURIComponent(ticker.toUpperCase())}?${q.toString()}`;
}

/**
 * Turn optimize output into plain-language reasons for one ticker's BUY/SELL/HOLD.
 * Style: portfolio-construction math (not a fundamental stock thesis) — same voice as
 * the morning-desk CBK explanation.
 */
export function buildAllocationReasons(
  result: AllocationResult,
  row: AllocationHoldingRow,
  currency = "USD",
): AllocationReasonSummary {
  const objective = result.objective;
  const objLabel = OBJECTIVE_LABEL[objective];
  const action = row.action;
  const shareAbs = Math.abs(row.share_delta);
  const exitZero = isExitToZero(row);
  const residual = isResidualSleeve(row);
  const fullAdd = isFullAdd(row);
  const minAllowsZero = result.min_pos < 0.0005;
  const concOn = !!result.lookthrough_concentration && (result.max_concentration ?? 0) > 0;
  const concPct =
    result.max_concentration != null ? pct(result.max_concentration) : null;

  let headline: string;
  if (action === "HOLD") {
    headline = `${row.ticker} is already near its ${objLabel} target — no trade suggested.`;
  } else if (exitZero) {
    headline = `Suggested SELL all ${fmtShares(shareAbs)} shares of ${row.ticker}: continuous target weight is ${pct(row.target_weight)} (from ${pct(row.current_weight)} today).`;
  } else if (fullAdd) {
    headline = `Suggested BUY ${fmtShares(shareAbs)} shares of ${row.ticker}: raise weight from 0% → ${pct(row.target_weight)}.`;
  } else if (action === "SELL") {
    headline = `Suggested SELL ${fmtShares(shareAbs)} shares of ${row.ticker}: trim weight ${pct(row.current_weight)} → ${pct(row.target_weight)} (${fmtShares(row.current_shares)} → ${fmtShares(row.target_shares)} sh).`;
  } else {
    headline = `Suggested BUY ${fmtShares(shareAbs)} shares of ${row.ticker}: raise weight ${pct(row.current_weight)} → ${pct(row.target_weight)} (${fmtShares(row.current_shares)} → ${fmtShares(row.target_shares)} sh).`;
  }

  const framing = exitZero
    ? `This is not a fundamental “${row.ticker} is a bad stock” call. It is mean-variance portfolio math saying: for this book and these settings, the optimal continuous weight is ${pct(row.target_weight)}, so integer allocation targets ${fmtShares(row.target_shares)} shares, and the UI labels that gap as ${action}.${
        concOn
          ? ` Look-through concentration also caps each underlying at ${concPct} effective weight (direct + inside ETFs).`
          : ""
      }`
    : `This is portfolio-construction math on tradable holdings (stocks and whole ETFs) under ${objLabel} — not an analyst thesis on the company’s business.${
        concOn
          ? ` Cluster-risk constraint: no single underlying may exceed ${concPct} effective exposure via look-through.`
          : ""
      } AgentFloor never places orders.`;

  const bullets: AllocationReasonBullet[] = [
    {
      title: "What the run showed",
      detail: exitZero
        ? `Current ≈ ${pct(row.current_weight)} (${fmtShares(row.current_shares)} sh · ${money(row.current_value, currency)} of NAV ${money(result.nav, currency)}). Target = ${pct(row.target_weight)} (${fmtShares(row.target_shares)} sh). Share delta = ${fmtShares(row.share_delta)}. ${
            residual
              ? `So you are not “dumping a core holding” — ${row.ticker} is already a residual sleeve; the sell-all badge means go from tiny → zero.`
              : `The badge means move from that current sleeve to the target weight above.`
          }`
        : `You currently hold ${pct(row.current_weight)} (${fmtShares(row.current_shares)} sh · ${money(row.current_value, currency)}). The ${objLabel} target wants ${pct(row.target_weight)} (${fmtShares(row.target_shares)} sh · ${money(row.target_value, currency)}), a ${signedPct(row.delta_weight)} weight change${
            row.delta_value != null && Math.abs(row.delta_value) >= 0.5
              ? ` ≈ ${money(Math.abs(row.delta_value), currency)}`
              : ""
          }.`,
    },
    {
      title: "Why the optimizer picks this weight",
      detail: [
        OBJECTIVE_WHY[objective],
        minAllowsZero
          ? ` Min position is ${pct(result.min_pos)}, so a ${pct(0)} weight is allowed — nothing forces a floor in ${row.ticker}.`
          : ` Min position is ${pct(result.min_pos)}, which can force a non-zero floor.`,
        ` Max position is ${pct(result.max_pos)} per name.`,
        exitZero
          ? ` Mean-variance (historical returns + Ledoit-Wolf covariance across your tickers only) put capital into other names in this mix; ${row.ticker} cleaned to ~0% continuous weight. High-volatility names are especially likely to hit a corner under Min volatility; Max Sharpe still prefers better return-per-risk in the mix, not always the highest raw return.`
          : fullAdd
            ? ` Among your holdings’ recent histories, ${row.ticker} earned a higher target weight in the efficient frontier (subject to the position caps).`
            : action === "SELL"
              ? ` Relative to the rest of the book, the frontier wants a smaller sleeve in ${row.ticker} so the overall mix better matches the ${objLabel} objective.`
              : action === "BUY"
                ? ` Relative to the rest of the book, the frontier wants a larger sleeve in ${row.ticker} so the overall mix better matches the ${objLabel} objective.`
                : ` Your weight is already close enough that no trade clears the half-share threshold.`,
        row.target_weight >= result.max_pos - 0.001 && result.max_pos < 1
          ? ` ${row.ticker} sits at (or near) the max-position ceiling — the optimizer may have wanted more concentration but the cap stopped it.`
          : "",
      ].join(""),
    },
  ];

  if (concOn) {
    bullets.push({
      title: "Look-through concentration",
      detail: `Optimization still trades ${row.ticker} as a whole asset, but a mapping matrix from Yahoo ETF top holdings constrains effective weight of every underlying: direct stock + Σ (ETF weight × constituent %). Limit = ${concPct}. That prevents stacking the same company across overlapping dividend ETFs (cluster risk). Top-10 Yahoo books are incomplete — residual ETF names are not in the constraint.`,
    });
  }

  if (action !== "HOLD") {
    bullets.push({
      title: "How the BUY/SELL badge is derived",
      detail: `After continuous weights are chosen, DiscreteAllocation maps them to integer shares against NAV ${money(result.nav, currency)} (LP, then greedy fallback). Target shares for ${row.ticker} = ${fmtShares(row.target_shares)}; current = ${fmtShares(row.current_shares)}; delta = ${fmtShares(row.share_delta)}. A move of at least half a share becomes ${action}. Leftover cash after rounding: ${money(result.leftover_cash, currency)}.`,
    });
  } else {
    bullets.push({
      title: "Why no trade",
      detail: `Share delta is ${fmtShares(row.share_delta)} — below the half-share threshold treated as HOLD. Weight is already close enough to the continuous target.`,
    });
  }

  const tickerUpper = row.ticker.toUpperCase();
  const viewHit = result.views_applied.some((t) => t.toUpperCase() === tickerUpper);
  if (objective === "black_litterman") {
    if (result.use_verdict_views && viewHit) {
      bullets.push({
        title: "AI verdict view (extra tilt)",
        detail: `Black-Litterman also applied a soft expected-return view on ${row.ticker} from your latest AI buy/sell run (±5%). That is an optional tilt on top of the equilibrium prior — still not a full fundamental report.`,
      });
    } else if (result.use_verdict_views) {
      bullets.push({
        title: "AI verdict views",
        detail: `Verdict views are on, but ${row.ticker} had no buy/sell view — its weight comes from the equilibrium prior and covariance with other names${
          result.views_applied.length
            ? ` (views applied to ${result.views_applied.join(", ")})`
            : ""
        }.`,
      });
    } else {
      bullets.push({
        title: "Equilibrium prior only",
        detail:
          "AI verdict views were off for this run. Weights come from the Black-Litterman market prior and historical covariances — not from run verdicts.",
      });
    }
  }

  const lt = result.lookthrough;
  if (lt?.etf_tickers.some((t) => t.toUpperCase() === tickerUpper)) {
    const top = [...lt.constituents]
      .sort((a, b) => Math.abs(b.delta_weight) - Math.abs(a.delta_weight))
      .slice(0, 3)
      .filter((c) => Math.abs(c.delta_weight) >= 0.0005);
    bullets.push({
      title: concOn
        ? "ETF look-through (concentration constraint)"
        : "ETF look-through (reporting only)",
      detail:
        top.length > 0
          ? `Changing ${row.ticker}'s weight also shifts underlying exposure. Largest look-through moves: ${top
              .map((c) => `${c.symbol} ${signedPct(c.delta_weight)}`)
              .join(", ")}. Optimization still trades the ETF as one asset${
              concOn
                ? `; underlyings are capped at ${concPct} effective weight.`
                : "."
            }`
          : concOn
            ? `${row.ticker} is an ETF in the look-through map. Trades stay in whole ETF units; M @ w caps each underlying at ${concPct}.`
            : `${row.ticker} is an ETF in the look-through set. Optimization still treats it as one asset; underlying exposure is reporting only.`,
    });
  } else if (lt) {
    const underlying = lt.constituents.find((c) => c.symbol.toUpperCase() === tickerUpper);
    if (underlying && Math.abs(underlying.delta_weight) >= 0.0005) {
      const atCap =
        concOn &&
        underlying.at_limit &&
        concPct != null;
      bullets.push({
        title: atCap ? "At look-through concentration cap" : "Also appears via ETFs",
        detail: `Look-through net exposure to ${row.ticker} (direct + inside ETFs) moves ${signedPct(underlying.delta_weight)} (${pct(underlying.current_weight)} → ${pct(underlying.target_weight)}).${
          atCap
            ? ` Target sits at the ${concPct} effective-weight cap.`
            : " Useful if you care about overlapping names — not the reason for the badge by itself."
        }`,
      });
    }
  }

  bullets.push({
    title: "Target portfolio stats (in-sample)",
    detail: `If the full target mix were reached: expected return ${(result.expected_return * 100).toFixed(1)}%, volatility ${(result.volatility * 100).toFixed(1)}%, Sharpe ${result.sharpe.toFixed(2)}. These are historical / research-only figures and can look optimistic after in-sample mean-variance — treat as context, not a forecast.`,
  });

  const notThis = [
    `Not an analyst verdict on ${row.ticker}'s business, management, or fair value.`,
    "Not an order to trade stocks inside an ETF — execution stays in whole ETF/stock units you already hold.",
    concOn
      ? "Not a full ETF book constraint (Yahoo top ~10 names); names outside that list are unconstrained by look-through."
      : "Not look-through concentration unless max concentration is set above 0 on the Allocation tab.",
    exitZero || residual
      ? `Not “sell because the weight is small” as a blanket rule — other small names can get BUY. ${row.ticker} got ${pct(row.target_weight)} because the efficient frontier put it there under ${objLabel}.`
      : `Not a guarantee the trade improves future returns — weights are research suggestions from historical prices of this holdings list only.`,
  ];

  let practical: string;
  if (exitZero && residual) {
    practical = `For a large book, exiting a ~${pct(row.current_weight)} ${row.ticker} line is a portfolio-construction suggestion (drop a noisy residual sleeve), not a research thesis. If you want to keep it, raise Min position or ignore the badge — the numbers above are the whole “why.”`;
  } else if (exitZero) {
    practical = `Read this as “the ${objLabel} mix wants ${pct(0)} in ${row.ticker},” not as urgent liquidation advice. Align with your own thesis before acting; AgentFloor does not trade.`;
  } else if (action === "SELL") {
    practical = `Read the badge as “trim toward ${pct(row.target_weight)} under ${objLabel},” not as an order ticket.${
      concOn ? " Check the look-through panel for underlyings near the concentration cap." : ""
    }`;
  } else if (action === "BUY") {
    practical = `Read the badge as “add toward ${pct(row.target_weight)} under ${objLabel}.” Check the position cap${
      concOn ? " and look-through concentration limit" : ""
    } before acting.`;
  } else {
    practical = `No action needed for ${row.ticker} under the current ${objLabel} result.`;
  }

  return {
    headline,
    framing,
    bullets,
    notThis,
    practical,
    disclaimer:
      "Research only — AgentFloor never places orders. These reasons explain the optimizer’s math for this morning check; they are not financial advice.",
  };
}
