# Tasks

## Active Task

**ID:** update-dependencies  
**Title:** Update frontend and backend dependencies  
**Created:** 2026-11-10  
**Status:** BUILD complete → next `/reflect`  
**Complexity:** Level 2 (Enhancement)

Refresh AgentFloor **frontend (npm)** and **backend (uv)** locks to newest versions allowed by existing semver/constraint ranges. Defer intentional majors. Do not touch TradingAgents vendor pin.

---

## PLAN (Level 2) — 2026-11-10

### Locked decisions

| Topic | Decision |
|---|---|
| Bump policy | **Safe-only:** newest version that satisfies current `package.json` carets / `pyproject.toml` constraints |
| Majors | **Defer:** `plotly.js@4`, `react-plotly.js@4`, `react-pdf@11`, `react-dropzone@20`, `eslint@10`, `typescript@7`, `@types/node@26` |
| Frontend floors | **Raise** direct dep floors in `package.json` to the resolved Wanted versions, then regenerate `package-lock.json` |
| Backend | `uv lock --upgrade` within constraints; **do not** loosen `pyportfolioopt<2` or `apscheduler>=4.0.0a5` |
| Vendor TradingAgents | **Out of scope** |
| Creative mode | **Skip** |

## Last completed

| ID | Title | Archive |
|---|---|---|
| `news-data-unavailable` | Fix news DATA_UNAVAILABLE (yfinance 1.7.0) | `memory-bank/archive/archive-news-data-unavailable.md` |
