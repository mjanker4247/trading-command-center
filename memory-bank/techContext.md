# Tech Context

- Python ≥3.12 backend (`uv`)
- TradingAgents path-dep: `[tool.uv.sources] tradingagents = { path = "../vendor/TradingAgents", editable = true }`
- Current pin: **v0.7.1**
- AgentFloor maps 5-tier Tauric ratings → buy/sell/hold via `tauric_run_adapter`
- Providers: OpenAI / Anthropic / Google / Groq / Ollama / vLLM / LiteLLM / IONOS (IONOS → `openai_compatible` on upstream)
- Outcomes: AgentFloor Finnhub calendar horizons; Tauric memory uses first-close-after settlement (0.7.x)
