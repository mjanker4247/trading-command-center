# TASK ARCHIVE: TradingAgents v0.7.1 vendor bump + AgentFloor integration

## METADATA

| Field | Value |
|---|---|
| Task ID | `vendor-ta-0.7.1-integrate` |
| Complexity | Level 2 (Simple Enhancement) |
| Created | 2026-10-31 |
| Completed | 2026-10-31 |
| Workflow | VAN → PLAN → BUILD → REFLECT → ARCHIVE |

## SUMMARY

Pinned vendored TauricResearch TradingAgents from **v0.6.0** to **v0.7.1**, synced `backend/uv.lock`, verified AgentFloor adapter/runner compatibility (focused tests green), and documented operator-facing 0.7 deltas. No ChatGPT Settings UI, no Finnhub outcome rewrite, no personal-fork sync.

## REQUIREMENTS

1. Submodule on newest upstream release
2. Backend imports matching version; lock consistent
3. Existing AgentFloor providers keep working (incl. ionos fallback)
4. Focused tauric unit tests green
5. Docs state pin + known behavioral deltas
6. No ChatGPT subscription provider UI (YAGNI)

## IMPLEMENTATION

- Submodule checkout `v0.7.1` (`c454491`); commit `12900d1`
- Memory Bank commands/rules install `75e751f` (adjacent setup)
- BUILD phase: reconfirm pin/latest, `uv sync`, ionos map assert, pytest, CLAUDE known-deltas
- Docs + Memory Bank state commit `90b7c25` (pushed to `origin/main`)

### Key files modified

- `vendor/TradingAgents` (submodule pin)
- `backend/uv.lock`
- `backend/app/services/tauric_run_adapter.py` (0.7 comment refs)
- `CLAUDE.md`
- `docs/litellm-implementation-plan.md` (version ref)
- `.cursor/commands/*`, `.cursor/rules/isolation_rules/*` (Memory Bank install)
- `memory-bank/**` (task/reflection/archive)

## TESTING

- `uv run python` version + `map_provider("ionos") == "openai_compatible"`
- Focused pytest: **49 passed, 5 skipped**
  - `test_tauric_run_adapter.py`
  - `test_tauric_live_progress.py`
  - `test_tauric_tool_call_recovery.py`
  - `test_trading_agent_runner.py`
  - `test_tradingagents_analysts.py`
- Graph smoke: `create_run_state` OK; future/unpadded dates rejected
- Live LLM e2e: **not run** (optional follow-up)

## LESSONS LEARNED

- Keep AgentFloor integration thin; stable `TradingAgentsGraph` methods → often docs + lock only
- Probe upstream provider registry (`is_openai_compatible`) instead of assuming ionos/chatgpt wiring
- Do not conflate Tauric memory first-close settlement with AgentFloor Finnhub calendar outcomes
- Level 2 PLAN YAGNI locks prevent ChatGPT half-integration

## DEFERRED / OPTIONAL

- Live LLM smoke after deploy
- Rebase `TradingAgents-TauricResearch` fork onto 0.7.1

## REFERENCES

- Reflection: `memory-bank/reflection/reflection-vendor-ta-0.7.1-integrate.md`
- Commits: `12900d1`, `75e751f`, `90b7c25`
- Upstream: https://github.com/TauricResearch/TradingAgents/releases/tag/v0.7.1
