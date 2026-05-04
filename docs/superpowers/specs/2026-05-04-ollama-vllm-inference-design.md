# Ollama / vLLM Local Inference Support — Design Spec

## Goal

Allow users to run AgentFloor's trading agents against locally-hosted Ollama or vLLM inference servers instead of cloud providers (OpenAI, Anthropic, Google).

## Architecture

Both Ollama and vLLM expose an OpenAI-compatible REST API. The approach is to store their base URLs in the existing `api_keys` table, construct a LangChain `ChatOpenAI` object at run time with the stored URL, and pass it to `TradingAgentsGraph`. No new DB tables or migrations are needed.

**Tech stack additions:** `langchain-openai>=0.2` added to `pyproject.toml` — provides `ChatOpenAI` with `base_url` support. (It is often transitively present via `langchain-core` but must be declared explicitly.)

---

## Storage

Provider entries `ollama` and `vllm` are stored in the existing `api_keys` table. The `encrypted_key` column holds the base URL string (e.g. `http://localhost:11434`). The `is_valid` flag is set by a connectivity check at save time:

- Ollama: `GET {url}/api/tags` returns 200
- vLLM: `GET {url}/health` returns 200

No schema migration needed — the table already handles arbitrary provider strings.

---

## Backend

### `app/routers/api_keys.py` changes

`_validate_key` gains two new branches:

```python
if provider == "ollama":
    r = await client.get(f"{key}/api/tags", timeout=5)
    return r.status_code == 200
if provider == "vllm":
    r = await client.get(f"{key}/health", timeout=5)
    return r.status_code == 200
```

### New file: `app/routers/llm_providers.py`

Mounted at `/llm-providers`. Auth: any authenticated user (needed at run-launch time).

**`GET /llm-providers/{provider}/models`** — `provider` is `ollama` or `vllm`

1. Look up `api_keys` row for the provider; 404 if not configured.
2. Decrypt the stored URL.
3. For `ollama`: `GET {url}/api/tags` → extract `[tag["name"] for tag in data["models"]]`
4. For `vllm`: `GET {url}/v1/models` → extract `[m["id"] for m in data["data"]]`
5. Returns `string[]`. Returns 502 with a clear message if the server is unreachable.

### `app/services/trading_agent_runner.py` changes

`execute_run` receives `config["llm_provider"]` and `config["llm_model"]` (already stored on the `Run` row and passed through). Add LLM construction logic before calling `TradingAgentsGraph`:

```python
llm = None
if config.get("llm_provider") in ("ollama", "vllm"):
    from langchain_openai import ChatOpenAI
    from app.services.encryption import decrypt_key
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        from app.models.api_key import ApiKey
        row = await db.execute(
            select(ApiKey).where(ApiKey.provider == config["llm_provider"])
        )
        key_row = row.scalar_one_or_none()
    if key_row:
        base_url = decrypt_key(key_row.encrypted_key)
        # vLLM needs /v1 suffix; Ollama's OpenAI-compat endpoint is at /v1
        if not base_url.rstrip("/").endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"
        llm = ChatOpenAI(
            base_url=base_url,
            model=config["llm_model"],
            api_key="ollama",  # placeholder — neither server validates this
        )

graph = TradingAgentsGraph(llm=llm) if llm else TradingAgentsGraph()
```

**Fallback:** If `TradingAgentsGraph` does not accept an `llm` constructor argument (determined at implementation time by reading the TradingAgents source), the fallback is to patch `OPENAI_BASE_URL` and `OPENAI_API_KEY` inside the thread function passed to `asyncio.to_thread`. This is thread-safe because each `to_thread` call runs in its own OS thread with its own env snapshot (achieved via a wrapper that sets `os.environ` before calling `graph.propagate` and restores it after).

### `app/routers/runs.py` change

Pass `llm_provider` and `llm_model` into the `start_run` config dict (they are already stored on the `Run` row; confirm they are forwarded in the existing `start_run` call).

---

## Frontend

### `lib/api.ts`

Add:
```ts
export async function getProviderModels(provider: string): Promise<string[]>
// GET /llm-providers/{provider}/models
```

### `components/runs/RunForm.tsx` changes

1. Add `"ollama"` and `"vllm"` to the provider `<select>`.
2. Update `PLACEHOLDERS` to include `ollama: "llama3"` and `vllm: "mistralai/Mistral-7B-Instruct-v0.3"`.
3. When provider is `ollama` or `vllm`, replace the model text input with a dynamic `<select>`:
   - Populated via `useQuery(["models", provider], () => getProviderModels(provider))`.
   - Loading state: disabled `<select>` with single option "Loading models…".
   - Error/empty state: fall back to a text `<input>` with placeholder text and a warning `"Server unreachable — enter model name manually"` in amber-400.
4. When provider switches back to `openai`/`anthropic`/`google`, restore the text input.

### `app/settings/page.tsx` changes

Add a **"Local Inference Servers"** section below "API Keys". Renders one `<ServerUrlRow>` for `ollama` and one for `vllm`.

### New file: `components/settings/ServerUrlRow.tsx`

Same structure as `ApiKeyRow` with two differences:
- Input type is `text` (not `password`) — URLs don't need masking.
- Label shows "Ollama Server" or "vLLM Server".
- Connection status badge: "Connected ✓" in green-400 or "Not configured" in slate-500, driven by `is_valid` from the API response.

Props: `provider: "ollama" | "vllm"; label: string; isValid: boolean; onSaved: () => void`

---

## Error handling

| Scenario | Behavior |
|---|---|
| URL not configured, user launches run | Run transitions to `failed`; error event broadcast over WebSocket |
| Server unreachable at run time | Same — caught by `except Exception` in `execute_run` |
| Server reachable but model not found | TradingAgents surfaces the error; run transitions to `failed` |
| Model list fetch fails in UI | Falls back to free-text input |

---

## Out of scope

- Authentication against Ollama/vLLM servers (neither requires auth by default)
- Multiple Ollama/vLLM endpoints (one URL per provider)
- Azure OpenAI or other OpenAI-compatible services (same mechanism would work but not exposed in this spec)
