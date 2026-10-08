# LLM models and tool calling

Market and news analysts in AgentFloor call data tools (prices, indicators, Yahoo news, macros, etc.) through the TradingAgents graph. That only works when the model returns **structured** `message.tool_calls` — not JSON pasted into the assistant text.

Social sentiment is different: it **pre-fetches** Yahoo / StockTwits / Reddit into the prompt, so it does not depend on tool calling.

The model picker in the UI shows the same guidance via the circular **(i)** next to **LLM Model**.

## Usually reliable

| Provider | Models / notes |
|---|---|
| **OpenAI** | `gpt-4.1`, `gpt-4o`, `gpt-5.x` — native tools |
| **Anthropic** | Claude Sonnet / Opus / Haiku |
| **Google** | Gemini 2.5 / 3.x Flash & Pro |
| **Groq** | Often fine with Llama tool APIs (better than generic OpenAI-compatible relays) |

## IONOS

IONOS documents tool calling for several models (including Llama 3.3 70B), but in practice Llama often writes function JSON into `content` instead of structured `tool_calls`. News reports then look empty (tool stubs, blank table cells).

| Prefer | Avoid for tool-heavy runs |
|---|---|
| `openai/gpt-oss-120b` (AgentFloor’s IONOS default) | `meta-llama/Llama-3.3-70B-Instruct`, Llama 405B |

AgentFloor includes a recovery patch that parses textual tool stubs back into real tool calls when possible. Prefer a reliable model anyway; recovery is a safety net, not a guarantee.

## Uneven / avoid for news + market

- **IONOS Llama** — flaky structured tools (see above)
- **Ollama / vLLM / LM Studio** — depends on the model and chat template
- **DeepSeek reasoner / MiniMax M2 thinking** — tools can work, but `tool_choice` quirks; TradingAgents special-cases these

## Practical picks

- Best overall for news + market: **OpenAI** or **Anthropic**
- On IONOS: use **`openai/gpt-oss-120b`**, not Llama
- Social-only or insight generation: weaker tool support matters less

## Symptom checklist

| Symptom | Likely cause |
|---|---|
| News tab shows `get_news` / `get_global_news` JSON fences and empty table values | Model did not emit structured `tool_calls` |
| Social tab has a sentiment summary | Expected — social prefetches data |
| Market numbers look invented / inconsistent | Same tool-call failure mode as news |
