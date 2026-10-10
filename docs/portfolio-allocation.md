# Portfolio allocation (PyPortfolioOpt)

Research-only Markowitz / Black-Litterman target weights for your current holdings. Complements **AI Insights** (qualitative briefing) with a quantitative allocation view. AgentFloor never places orders.

## What it does

| Setting | Financial impact |
|---------|------------------|
| **Max Sharpe** | Seeks the highest expected return per unit of volatility from historical prices (risk-free rate = 0 in the library default). |
| **Min volatility** | Favors the least-turbulent mix of your holdings — useful when you want stability over upside. |
| **Black-Litterman** | Starts from an equal-weight market prior, then (optionally) tilts with soft views from your latest AI buy/sell verdicts (+5% / −5% absolute expected-return views). |
| **Min / max position** | Caps how concentrated any single name can be in the target. Defaults: min 0, max 40%. If max × holdings &lt; 1, the server relaxes max just enough so weights can still sum to 100%. |
| **Use AI verdict views** | Only for Black-Litterman. Turns recent run verdicts into BL views; leave off for equilibrium-only BL. |

Covariance uses Ledoit-Wolf shrinkage. Suggested share changes come from PyPortfolioOpt `DiscreteAllocation` against your current NAV.

## API

- `GET /portfolio/{id}/optimize` — cached / default-params result
- `POST /portfolio/{id}/optimize` — recompute with body params

Feature flag: `enable_portfolio_optimizer` (Strategy settings, admin write).

## UI

Portfolio → **Allocation** tab (hidden when the module is off).

## Dependency

Installed with the backend via `uv sync` (`pyportfolioopt`). No extra git submodule.

## Future (out of scope)

Walk-forward validation via [skfolio](https://github.com/skfolio/skfolio) if you need out-of-sample checks on the Allocation tab.
