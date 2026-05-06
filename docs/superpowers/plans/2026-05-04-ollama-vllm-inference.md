# Ollama / vLLM Local Inference Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow AgentFloor users to run trading agent analysis against locally-hosted Ollama or vLLM servers, with admin-managed server URLs and dynamic model discovery.

**Architecture:** Store Ollama/vLLM base URLs in the existing `api_keys` table (providers `ollama` and `vllm`). At run time, look up the URL, construct a `ChatOpenAI(base_url=..., model=...)` object, and pass it to `TradingAgentsGraph`. A new `/llm-providers/{provider}/models` endpoint proxies model listing from each server. The frontend adds these two providers to the run form with a dynamic model dropdown, and the settings page gains a "Local Inference Servers" section.

**Tech Stack:** `langchain-openai>=0.2` (new dependency), existing FastAPI + SQLAlchemy + Next.js stack.

---

## File Structure

**Create:**
- `backend/app/routers/llm_providers.py` — model listing endpoint
- `backend/tests/test_llm_providers.py` — tests for llm_providers router
- `frontend/components/settings/ServerUrlRow.tsx` — URL input row for settings page

**Modify:**
- `backend/pyproject.toml` — add `langchain-openai>=0.2`
- `backend/app/routers/api_keys.py` — add ollama/vllm branches to `_validate_key`
- `backend/app/services/trading_agent_runner.py` — extract `_build_llm` helper, wire into `execute_run`
- `backend/main.py` — register `llm_providers` router
- `frontend/lib/api.ts` — add `getProviderModels`
- `frontend/components/runs/RunForm.tsx` — add ollama/vllm providers + dynamic model select
- `frontend/app/settings/page.tsx` — add "Local Inference Servers" section, filter ollama/vllm from "API Keys"

---

### Task 1: Add langchain-openai dependency

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add dependency to pyproject.toml**

Open `backend/pyproject.toml`. The `dependencies` list currently ends with `"langchain-core>=0.3",`. Add the new entry after it:

```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.29",
    "alembic>=1.13",
    "pydantic-settings>=2.3",
    "bcrypt>=4.1",
    "PyJWT>=2.8",
    "cryptography>=42.0",
    "httpx>=0.27",
    "python-multipart>=0.0.9",
    "aiosmtplib>=3.0",
    "email-validator>=2.0",
    "langchain-core>=0.3",
    "langchain-openai>=0.2",
]
```

- [ ] **Step 2: Install**

```bash
cd backend
uv pip install --system -e ".[dev]"
```

Expected: output ends with `+ langchain-openai==...`

- [ ] **Step 3: Verify import**

```bash
python -c "from langchain_openai import ChatOpenAI; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "feat: add langchain-openai dependency for local inference support"
```

---

### Task 2: Extend _validate_key for Ollama and vLLM

**Files:**
- Modify: `backend/app/routers/api_keys.py:62-77`
- Test: `backend/tests/test_api_keys.py` (create new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_api_keys.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from main import app


async def _admin_token(client):
    await client.post("/auth/register", json={"email": "keys@test.com", "password": "pw", "name": "Keys"})
    r = await client.post("/auth/login", json={"email": "keys@test.com", "password": "pw"})
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_upsert_ollama_url_marks_valid_when_server_responds(httpx_mock):
    httpx_mock.add_response(url="http://localhost:11434/api/tags", status_code=200, json={"models": []})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "ollama", "key": "http://localhost:11434"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is True


@pytest.mark.asyncio
async def test_upsert_ollama_url_marks_invalid_when_server_down(httpx_mock):
    httpx_mock.add_exception(Exception("connection refused"), url="http://localhost:11435/api/tags")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "ollama", "key": "http://localhost:11435"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_upsert_vllm_url_marks_valid_when_server_responds(httpx_mock):
    httpx_mock.add_response(url="http://localhost:8080/health", status_code=200)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _admin_token(client)
        r = await client.post(
            "/api-keys",
            json={"provider": "vllm", "key": "http://localhost:8080"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["is_valid"] is True
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend
python -m pytest tests/test_api_keys.py -v
```

Expected: 3 FAILs — `is_valid` will be `True` (fallthrough to `return True`) rather than the expected validated value, or the httpx mock won't intercept.

- [ ] **Step 3: Add ollama and vllm branches to `_validate_key`**

In `backend/app/routers/api_keys.py`, replace the `_validate_key` function (currently lines 62-77):

```python
async def _validate_key(provider: str, key: str) -> bool:
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            if provider == "openai":
                r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=5)
                return r.status_code == 200
            if provider == "alpha_vantage":
                r = await client.get(f"https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey={key}", timeout=5)
                return "Time Series" in r.text or "Meta Data" in r.text
            if provider == "ollama":
                r = await client.get(f"{key}/api/tags", timeout=5)
                return r.status_code == 200
            if provider == "vllm":
                r = await client.get(f"{key}/health", timeout=5)
                return r.status_code == 200
        return True
    except Exception:
        return False
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_api_keys.py -v
```

Expected: 3 PASSes.

- [ ] **Step 5: Run full suite to check no regressions**

```bash
python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/api_keys.py backend/tests/test_api_keys.py
git commit -m "feat: validate ollama and vllm server URLs on api key upsert"
```

---

### Task 3: Create llm_providers router

**Files:**
- Create: `backend/app/routers/llm_providers.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_llm_providers.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_llm_providers.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from main import app


async def _token(client, email="lp@test.com"):
    await client.post("/auth/register", json={"email": email, "password": "pw", "name": "LP"})
    r = await client.post("/auth/login", json={"email": email, "password": "pw"})
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_models_404_when_provider_not_configured():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client)
        r = await client.get("/llm-providers/ollama/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_models_400_for_unknown_provider():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp2@test.com")
        r = await client.get("/llm-providers/cohere/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_ollama_models_returns_list(httpx_mock):
    httpx_mock.add_response(
        url="http://localhost:11434/api/tags",
        status_code=200,
        json={"models": [{"name": "llama3:latest"}, {"name": "mistral:7b"}]},
    )
    httpx_mock.add_response(url="http://localhost:11434/api/tags", status_code=200, json={"models": []})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp3@test.com")
        # Store the Ollama URL first (validation ping is first httpx_mock response)
        await client.post(
            "/api-keys",
            json={"provider": "ollama", "key": "http://localhost:11434"},
            headers={"Authorization": f"Bearer {token}"},
        )
        r = await client.get("/llm-providers/ollama/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert "llama3:latest" in r.json()
        assert "mistral:7b" in r.json()


@pytest.mark.asyncio
async def test_vllm_models_returns_list(httpx_mock):
    httpx_mock.add_response(url="http://localhost:8080/health", status_code=200)
    httpx_mock.add_response(
        url="http://localhost:8080/v1/models",
        status_code=200,
        json={"data": [{"id": "mistralai/Mistral-7B-v0.1"}, {"id": "meta-llama/Llama-2-7b"}]},
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _token(client, "lp4@test.com")
        await client.post(
            "/api-keys",
            json={"provider": "vllm", "key": "http://localhost:8080"},
            headers={"Authorization": f"Bearer {token}"},
        )
        r = await client.get("/llm-providers/vllm/models", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert "mistralai/Mistral-7B-v0.1" in r.json()


@pytest.mark.asyncio
async def test_models_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/llm-providers/ollama/models")
        assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/test_llm_providers.py -v
```

Expected: all 5 FAILs with 404 on `/llm-providers/...` (route doesn't exist yet).

- [ ] **Step 3: Create `backend/app/routers/llm_providers.py`**

```python
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.services.encryption import decrypt_key
from app.dependencies import get_current_user

router = APIRouter()

_SUPPORTED = {"ollama", "vllm"}


@router.get("/{provider}/models", response_model=list[str])
async def list_models(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if provider not in _SUPPORTED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown provider '{provider}'. Supported: {sorted(_SUPPORTED)}")

    row = (await db.execute(select(ApiKey).where(ApiKey.provider == provider))).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No URL configured for provider '{provider}'")

    base_url = decrypt_key(row.encrypted_key).rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            if provider == "ollama":
                r = await client.get(f"{base_url}/api/tags")
                r.raise_for_status()
                return [m["name"] for m in r.json().get("models", [])]
            else:  # vllm
                r = await client.get(f"{base_url}/v1/models")
                r.raise_for_status()
                return [m["id"] for m in r.json().get("data", [])]
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not reach {provider} server: {exc}")
```

- [ ] **Step 4: Register router in `backend/main.py`**

Replace the contents of `backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, runs, api_keys, users, llm_providers

app = FastAPI(title="AgentFloor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(runs.router, tags=["runs"])
app.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(llm_providers.router, prefix="/llm-providers", tags=["llm-providers"])

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/test_llm_providers.py -v
```

Expected: 5 PASSes.

- [ ] **Step 6: Run full suite**

```bash
python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/llm_providers.py backend/main.py backend/tests/test_llm_providers.py
git commit -m "feat: add /llm-providers/{provider}/models endpoint for ollama and vllm"
```

---

### Task 4: Extract _build_llm helper and wire into execute_run

**Files:**
- Modify: `backend/app/services/trading_agent_runner.py`
- Test: `backend/tests/test_trading_agent_runner.py` (create new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_trading_agent_runner.py`:

```python
import pytest
from app.services.trading_agent_runner import _build_llm


@pytest.mark.asyncio
async def test_build_llm_returns_none_for_cloud_providers():
    assert await _build_llm("openai", "gpt-4o") is None
    assert await _build_llm("anthropic", "claude-3") is None
    assert await _build_llm("google", "gemini-pro") is None


@pytest.mark.asyncio
async def test_build_llm_returns_none_when_ollama_not_configured():
    result = await _build_llm("ollama", "llama3")
    assert result is None


@pytest.mark.asyncio
async def test_build_llm_returns_none_when_vllm_not_configured():
    result = await _build_llm("vllm", "mistral-7b")
    assert result is None
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/test_trading_agent_runner.py -v
```

Expected: 3 FAILs — `_build_llm` does not exist yet.

- [ ] **Step 3: Add `_build_llm` to `trading_agent_runner.py` and update `execute_run`**

Replace the full contents of `backend/app/services/trading_agent_runner.py`:

```python
import asyncio
from queue import Queue as SyncQueue
from datetime import datetime, timezone
from langchain_core.callbacks import BaseCallbackHandler

AGENT_NODES = {
    "fundamentals_analyst", "sentiment_analyst", "news_analyst",
    "technical_analyst", "bull_researcher", "bear_researcher",
    "trader", "risk_manager",
}


class _SyncEmitter(BaseCallbackHandler):
    def __init__(self, queue: SyncQueue):
        self._q = queue
        self._current: str | None = None

    def on_chain_start(self, serialized, inputs, **kwargs):
        name = (kwargs.get("name") or "").lower().replace(" ", "_")
        if name in AGENT_NODES:
            self._current = name
            self._q.put_nowait({"type": "started", "agent": name})

    def on_llm_new_token(self, token: str, **kwargs):
        if self._current:
            self._q.put_nowait({"type": "token", "agent": self._current, "token": token})

    def on_chain_end(self, outputs, **kwargs):
        if self._current:
            summary = str(outputs)[:500] if outputs else ""
            self._q.put_nowait({"type": "completed", "agent": self._current, "summary": summary})
            self._current = None

    def on_chain_error(self, error, **kwargs):
        agent = self._current or ""
        self._q.put_nowait({"type": "error", "agent": agent, "message": str(error)})
        self._current = None


async def _build_llm(provider: str, model: str):
    """Return a ChatOpenAI configured for local inference, or None for cloud providers."""
    if provider not in ("ollama", "vllm"):
        return None

    from app.database import AsyncSessionLocal
    from app.models.api_key import ApiKey
    from app.services.encryption import decrypt_key
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(ApiKey).where(ApiKey.provider == provider))).scalar_one_or_none()

    if not row:
        return None

    from langchain_openai import ChatOpenAI
    base_url = decrypt_key(row.encrypted_key).rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    return ChatOpenAI(
        base_url=base_url,
        model=model,
        api_key="ollama",
    )


async def execute_run(run_id: str, config: dict) -> None:
    from app.database import AsyncSessionLocal
    from app.models.run import Run, RunStatus, RunVerdict
    from app.models.agent_event import AgentEvent, EventType
    from app.models.report import Report
    from app.services.websocket_manager import ws_manager

    sync_q: SyncQueue = SyncQueue()
    async_q: asyncio.Queue = asyncio.Queue()
    sequence = [0]

    async def _drain():
        while True:
            await asyncio.sleep(0.05)
            while not sync_q.empty():
                await async_q.put(sync_q.get_nowait())

    async def _process():
        while True:
            event = await async_q.get()
            if event is None:
                break
            sequence[0] += 1
            event["sequence"] = sequence[0]
            async with AsyncSessionLocal() as db:
                db.add(AgentEvent(
                    run_id=run_id,
                    agent_name=event.get("agent", ""),
                    event_type=EventType(event["type"]),
                    payload=event,
                    sequence=sequence[0],
                ))
                await db.commit()
            await ws_manager.broadcast(run_id, event)

    async def _set_status(status: RunStatus, verdict: RunVerdict | None = None):
        async with AsyncSessionLocal() as db:
            run = await db.get(Run, run_id)
            run.status = status
            if verdict:
                run.verdict = verdict
            if status == RunStatus.running:
                run.started_at = datetime.now(timezone.utc)
            elif status in (RunStatus.completed, RunStatus.aborted, RunStatus.failed):
                run.completed_at = datetime.now(timezone.utc)
            await db.commit()

    await _set_status(RunStatus.running)
    emitter = _SyncEmitter(sync_q)
    drain_task = asyncio.create_task(_drain())
    process_task = asyncio.create_task(_process())

    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph
        from langchain_core.runnables import RunnableConfig

        llm = await _build_llm(config.get("llm_provider", ""), config.get("llm_model", ""))

        try:
            graph = TradingAgentsGraph(llm=llm) if llm else TradingAgentsGraph()
        except TypeError:
            # TradingAgentsGraph does not accept an llm arg — fall back to env-var patching
            import os
            if llm is not None:
                os.environ["OPENAI_BASE_URL"] = llm.openai_api_base or ""
                os.environ["OPENAI_API_KEY"] = "ollama"
            graph = TradingAgentsGraph()

        lc_config = RunnableConfig(callbacks=[emitter])
        result = await asyncio.to_thread(
            graph.propagate,
            config["ticker"],
            config["analysis_date"],
            config=lc_config,
        )
        await async_q.put(None)
        await process_task

        verdict = _parse_verdict(result)
        async with AsyncSessionLocal() as db:
            db.add(Report(
                run_id=run_id,
                trader_decision=str(result.get("trader_decision", "")),
                verdict=verdict,
                suggested_entry=result.get("suggested_entry"),
                suggested_stop=result.get("suggested_stop"),
                suggested_target=result.get("suggested_target"),
                risk_assessment=str(result.get("risk_assessment", "")),
                raw_report=result if isinstance(result, dict) else {},
            ))
            await db.commit()

        await _set_status(RunStatus.completed, verdict)
        await ws_manager.broadcast(run_id, {"type": "run_completed", "run_id": run_id})

    except asyncio.CancelledError:
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.aborted)
        await ws_manager.broadcast(run_id, {"type": "run_aborted", "run_id": run_id})

    except Exception as exc:
        drain_task.cancel()
        process_task.cancel()
        await _set_status(RunStatus.failed)
        await ws_manager.broadcast(run_id, {"type": "error", "message": str(exc)})

    finally:
        drain_task.cancel()


def _parse_verdict(result: dict) -> "RunVerdict":
    from app.models.run import RunVerdict
    raw = str(result.get("decision", result.get("action", "hold"))).lower()
    if "buy" in raw:
        return RunVerdict.buy
    if "sell" in raw:
        return RunVerdict.sell
    return RunVerdict.hold
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_trading_agent_runner.py -v
```

Expected: 3 PASSes.

- [ ] **Step 5: Run full suite**

```bash
python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/trading_agent_runner.py backend/tests/test_trading_agent_runner.py
git commit -m "feat: _build_llm helper constructs ChatOpenAI for ollama/vllm providers"
```

---

### Task 5: Frontend — add getProviderModels to api.ts

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `getProviderModels` to `frontend/lib/api.ts`**

Append at the end of the file:

```ts
export async function getProviderModels(provider: string): Promise<string[]> {
  const r = await fetchWithAuth(`/llm-providers/${provider}/models`);
  if (!r.ok) throw new Error(`Could not fetch models for ${provider}`);
  return r.json();
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add getProviderModels API function for ollama/vllm model discovery"
```

---

### Task 6: Frontend — ServerUrlRow component

**Files:**
- Create: `frontend/components/settings/ServerUrlRow.tsx`

- [ ] **Step 1: Create `frontend/components/settings/ServerUrlRow.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { upsertApiKey } from "@/lib/api";

interface ServerUrlRowProps {
  provider: "ollama" | "vllm";
  label: string;
  isValid: boolean;
  onSaved: () => void;
}

export function ServerUrlRow({ provider, label, isValid, onSaved }: ServerUrlRowProps) {
  const [value, setValue] = useState("");

  const mutation = useMutation({
    mutationFn: () => upsertApiKey(provider, value),
    onSuccess: () => {
      setValue("");
      onSaved();
    },
  });

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="text-slate-200 text-sm w-28">{label}</span>
      <span className={`text-xs w-28 ${isValid ? "text-green-400" : "text-slate-500"}`}>
        {isValid ? "Connected ✓" : "Not configured"}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={provider === "ollama" ? "http://localhost:11434" : "http://localhost:8080"}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-64 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !value}
        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 text-xs disabled:opacity-50"
      >
        {mutation.isPending ? "Saving…" : "Save"}
      </button>
      {mutation.isError && (
        <span className="text-red-400 text-xs">{(mutation.error as Error).message}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/settings/ServerUrlRow.tsx
git commit -m "feat: ServerUrlRow component for ollama/vllm URL configuration in settings"
```

---

### Task 7: Frontend — Update Settings page

**Files:**
- Modify: `frontend/app/settings/page.tsx`

- [ ] **Step 1: Update `frontend/app/settings/page.tsx`**

Replace the full file contents:

```tsx
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiKeys, getUsers, inviteUser } from "@/lib/api";
import { TopNav } from "@/components/layout/TopNav";
import { ApiKeyRow } from "@/components/settings/ApiKeyRow";
import { ServerUrlRow } from "@/components/settings/ServerUrlRow";
import { TeamMemberRow } from "@/components/settings/TeamMemberRow";

const LOCAL_PROVIDERS = ["ollama", "vllm"];
const LOCAL_LABELS: Record<string, string> = { ollama: "Ollama Server", vllm: "vLLM Server" };

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const currentUserId = (session?.user as { id?: string })?.id ?? "";
  const queryClient = useQueryClient();

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["apiKeys"],
    queryFn: getApiKeys,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: isAdmin,
  });

  const cloudKeys = apiKeys.filter((k) => !LOCAL_PROVIDERS.includes(k.provider));
  const localKey = (provider: string) => apiKeys.find((k) => k.provider === provider);
  const refetchKeys = () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");

  const inviteMutation = useMutation({
    mutationFn: () => inviteUser(inviteEmail),
    onSuccess: () => {
      setInviteEmail("");
      setInviteStatus("success");
    },
    onError: (err: Error) => {
      setInviteStatus("error");
      setInviteError(err.message);
    },
  });

  return (
    <>
      <TopNav />
      <main className="p-6 max-w-3xl mx-auto flex flex-col gap-8">
        <section>
          <h2 className="text-slate-200 text-sm font-semibold mb-3">API Keys</h2>
          <div className="bg-navy-700 border border-slate-800 rounded-lg divide-y divide-slate-800">
            {cloudKeys.map((k) => (
              <ApiKeyRow
                key={k.provider}
                provider={k.provider}
                isSet={k.is_valid}
                onSaved={refetchKeys}
              />
            ))}
            {cloudKeys.length === 0 && (
              <p className="text-slate-500 text-xs px-4 py-3">No API keys configured.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-slate-200 text-sm font-semibold mb-3">Local Inference Servers</h2>
          <div className="bg-navy-700 border border-slate-800 rounded-lg divide-y divide-slate-800">
            {LOCAL_PROVIDERS.map((provider) => (
              <ServerUrlRow
                key={provider}
                provider={provider as "ollama" | "vllm"}
                label={LOCAL_LABELS[provider]}
                isValid={localKey(provider)?.is_valid ?? false}
                onSaved={refetchKeys}
              />
            ))}
          </div>
        </section>

        {isAdmin && (
          <section>
            <h2 className="text-slate-200 text-sm font-semibold mb-3">Team</h2>
            <div className="bg-navy-700 border border-slate-800 rounded-lg divide-y divide-slate-800 mb-4">
              {users.map((u) => (
                <TeamMemberRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUserId}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
                />
              ))}
              {users.length === 0 && (
                <p className="text-slate-500 text-xs px-4 py-3">No team members found.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteStatus("idle");
                }}
                placeholder="member@example.com"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-64 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending || !inviteEmail}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 text-xs disabled:opacity-50"
              >
                {inviteMutation.isPending ? "Sending…" : "Invite Member"}
              </button>
              {inviteStatus === "success" && (
                <span className="text-green-400 text-xs">Invite sent.</span>
              )}
              {inviteStatus === "error" && (
                <span className="text-red-400 text-xs">{inviteError}</span>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/settings/page.tsx
git commit -m "feat: add Local Inference Servers section to settings page"
```

---

### Task 8: Frontend — Update RunForm with dynamic model discovery

**Files:**
- Modify: `frontend/components/runs/RunForm.tsx`

- [ ] **Step 1: Replace `frontend/components/runs/RunForm.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createRun, getProviderModels } from "@/lib/api";

const ANALYSTS = ["market", "social", "news", "fundamentals", "technical"];
const LOCAL_PROVIDERS = ["ollama", "vllm"];

const PLACEHOLDERS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-opus-4-5",
  google: "gemini-2.0-flash",
  ollama: "llama3",
  vllm: "mistralai/Mistral-7B-Instruct-v0.3",
};

interface Props {
  onSuccess: (runId: string) => void;
}

export function RunForm({ onSuccess }: Props) {
  const [ticker, setTicker] = useState("");
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().slice(0, 10));
  const [analysts, setAnalysts] = useState<string[]>(["market"]);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [quickResearch, setQuickResearch] = useState(false);

  const isLocal = LOCAL_PROVIDERS.includes(provider);

  const { data: models = [], isLoading: modelsLoading, isError: modelsError } = useQuery({
    queryKey: ["models", provider],
    queryFn: () => getProviderModels(provider),
    enabled: isLocal,
    retry: false,
  });

  useEffect(() => {
    setModel("");
  }, [provider]);

  useEffect(() => {
    if (isLocal && models.length > 0 && !model) {
      setModel(models[0]);
    }
  }, [models, isLocal]);

  const mutation = useMutation({
    mutationFn: createRun,
    onSuccess: (run) => onSuccess(run.id),
  });

  function toggleAnalyst(name: string) {
    setAnalysts((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (analysts.length === 0) return;
    mutation.mutate({
      ticker,
      analysis_date: analysisDate,
      analysts,
      llm_provider: provider,
      llm_model: model || PLACEHOLDERS[provider],
      depth: quickResearch ? "quick" : "standard",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-navy-700 border border-slate-800 rounded-lg p-6 max-w-lg">
      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">Ticker</label>
        <input
          required
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        />
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">Analysis Date</label>
        <input
          required
          type="date"
          value={analysisDate}
          onChange={(e) => setAnalysisDate(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        />
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">Analysts</label>
        <div className="flex flex-wrap gap-2">
          {ANALYSTS.map((a) => {
            const selected = analysts.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAnalyst(a)}
                className={`px-3 py-1 rounded border text-xs capitalize ${
                  selected
                    ? "bg-blue-700 text-white border-blue-600"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
        {analysts.length === 0 && (
          <p className="text-red-400 text-xs mt-1">Select at least one analyst.</p>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">LLM Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
        >
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="google">google</option>
          <option value="ollama">ollama (local)</option>
          <option value="vllm">vllm (local)</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-slate-400 text-xs mb-1">LLM Model</label>
        {isLocal ? (
          modelsLoading ? (
            <select disabled className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-500 text-sm">
              <option>Loading models…</option>
            </select>
          ) : modelsError || models.length === 0 ? (
            <>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={PLACEHOLDERS[provider]}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
              />
              <p className="text-amber-400 text-xs mt-1">Server unreachable — enter model name manually</p>
            </>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={PLACEHOLDERS[provider]}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-600"
          />
        )}
      </div>

      <div className="mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={quickResearch}
            onChange={(e) => setQuickResearch(e.target.checked)}
            className="accent-blue-600"
          />
          <span className="text-slate-400 text-xs">Quick research (faster, less thorough)</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || analysts.length === 0}
        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? "Launching…" : "Launch Run"}
      </button>

      {mutation.isError && (
        <p className="text-red-400 text-xs mt-2">Failed to launch run.</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/runs/RunForm.tsx
git commit -m "feat: add ollama/vllm providers with dynamic model dropdown to run form"
```

---

### Task 9: Push all changes

- [ ] **Step 1: Push branch**

```bash
git push
```

Expected: all 8 feature commits pushed to `implement/agentfloor`.
