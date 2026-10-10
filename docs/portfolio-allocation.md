# Portfolio allocation (PyPortfolioOpt)

Research-only Markowitz / Black-Litterman target weights for your **tradable** holdings (direct stocks and whole ETFs). Complements **AI Insights** with a quantitative allocation view. AgentFloor never places orders.

## Look-through concentration (cluster risk)

| Layer | Behavior |
|-------|----------|
| **Optimization input** | Covariance Σ and expected returns are built from **tradable** tickers only (each ETF is one asset). |
| **Mapping matrix M** | Rows = unique underlyings; columns = portfolio assets. Direct stocks get identity (1.0); ETFs get Yahoo `FundsData` top-holding weights. |
| **Constraint** | `M @ w ≤ max_concentration` (CVXPY via PyPortfolioOpt `add_constraint`). Caps effective exposure: direct + Σ ETF×constituent. Default **10%**. Set to **0** to disable. |
| **Execution** | DiscreteAllocation still produces **ETF/stock share** targets — you never “buy” a fractional ETF constituent. |
| **Reporting** | Post-hoc look-through panel shows constituent/sector deltas; names near the cap are flagged. |

**Why not unpack into Σ?** Expanding ETFs into hundreds of stocks for the covariance matrix explodes dimension, double-counts overlaps, and breaks DiscreteAllocation back to tradeable units. Concentration constraints give the cluster-risk control while keeping tradable weights.

**Data source:** `yfinance` `FundsData` top holdings (~10 names). Full books need issuer/paid feeds — residual ETF weight is not in M.

## What it does

| Setting | Financial impact |
|---------|------------------|
| **Max Sharpe** | Highest expected return per unit of historical volatility (rf = 0). |
| **Min volatility** | Least-turbulent mix of holdings. |
| **Black-Litterman** | Equal-weight prior, optional AI buy/sell views (±5%). |
| **Min / max position** | Per **tradable** name. Defaults: min 0, max 40%. When look-through is on, max may be raised just enough so ETF sleeves can still sum to 100% after stocks are capped. |
| **Max look-through** | Per **underlying** effective weight after look-through (`M @ w ≤ limit`). Default 10%; 0 = off. |
| **Use AI verdict views** | Black-Litterman only. |

## Rebalancing output

- Per holding: current/target shares, value, weight; Δ; `BUY` / `SELL` / `HOLD`
- Leftover cash after integer allocation
- ETF look-through panel (underlying + sector deltas; optional “at cap” flags)

## API

- `GET /portfolio/{id}/optimize` — query params include `max_concentration`
- `POST /portfolio/{id}/optimize` — body includes `max_concentration`

Feature flag: `enable_portfolio_optimizer` (Strategy settings, admin write).

## UI

Portfolio → **Allocation** tab. Set **Max look-through**, run optimize, click BUY/SELL for the reason page.

## Dependency

`pyportfolioopt` (+ `cvxpy`). ETF data via existing `yfinance`.
