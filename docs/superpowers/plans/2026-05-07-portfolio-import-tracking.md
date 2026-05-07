# Portfolio Import & Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/portfolio` page where users upload broker CSV snapshots (Moomoo, Fidelity, Schwab, or generic), view holdings enriched with live Alpha Vantage prices and AI analysis verdicts, and export an enriched CSV.

**Architecture:** Three new backend tables (Portfolio → PortfolioSnapshot → PortfolioHolding) with a dedicated FastAPI router and a broker-detection CSV parser service. The frontend adds a `/portfolio` page with four new components wired through the existing TanStack Query + `fetchWithAuth` pattern.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, httpx, Python `csv` stdlib, Next.js 14 App Router, TanStack Query v5, TypeScript.

---

## File Map

### Create
- `backend/app/models/portfolio.py` — Portfolio, PortfolioSnapshot, PortfolioHolding models
- `backend/app/services/portfolio_parser.py` — HoldingRow dataclass + broker detection + 4 parsers
- `backend/app/routers/portfolio.py` — 8 endpoints + inline Pydantic schemas
- `backend/alembic/versions/a3b8c2d1e9f0_add_portfolio_tables.py` — migration
- `backend/tests/test_portfolio.py` — integration + parser unit tests
- `backend/tests/fixtures/moomoo_positions.csv` — Moomoo test fixture
- `backend/tests/fixtures/fidelity_positions.csv` — Fidelity test fixture
- `backend/tests/fixtures/schwab_positions.csv` — Schwab test fixture
- `backend/tests/fixtures/generic_positions.csv` — Generic test fixture
- `frontend/components/portfolio/PortfolioHeader.tsx`
- `frontend/components/portfolio/PortfolioSwitcher.tsx`
- `frontend/components/portfolio/UploadDrawer.tsx`
- `frontend/components/portfolio/HoldingsTable.tsx`
- `frontend/app/portfolio/page.tsx`

### Modify
- `backend/main.py` — mount portfolio router
- `backend/tests/conftest.py` — add new tables to TRUNCATE list
- `frontend/lib/types.ts` — add Portfolio* types
- `frontend/lib/api.ts` — add portfolio API functions
- `frontend/components/layout/TopNav.tsx` — add Portfolio nav item

---

## Task 1: SQLAlchemy Models

**Files:**
- Create: `backend/app/models/portfolio.py`

- [ ] **Write `backend/app/models/portfolio.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Portfolio(Base):
    __tablename__ = "portfolios"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    snapshots = relationship("PortfolioSnapshot", back_populates="portfolio", cascade="all, delete-orphan")


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("portfolios.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    broker: Mapped[str | None] = mapped_column(String, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer)

    portfolio = relationship("Portfolio", back_populates="snapshots")
    holdings = relationship("PortfolioHolding", back_populates="snapshot", cascade="all, delete-orphan")


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holdings"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("portfolio_snapshots.id"))
    ticker: Mapped[str] = mapped_column(String(16))
    shares: Mapped[float] = mapped_column(Float)
    avg_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="USD")

    snapshot = relationship("PortfolioSnapshot", back_populates="holdings")
```

- [ ] **Commit**

```bash
git add backend/app/models/portfolio.py
git commit -m "feat: add Portfolio, PortfolioSnapshot, PortfolioHolding models"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/a3b8c2d1e9f0_add_portfolio_tables.py`

- [ ] **Generate the migration** (requires running Postgres)

```bash
cd backend
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic revision --autogenerate -m "add_portfolio_tables"
```

Expected: a new file in `backend/alembic/versions/` with `add_portfolio_tables` in the name.

- [ ] **Verify the generated `upgrade()` contains all three tables** — open the file and confirm it creates `portfolios`, `portfolio_snapshots`, `portfolio_holdings`. If the autogenerate missed any, add manually:

```python
def upgrade() -> None:
    op.create_table(
        "portfolios",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("portfolio_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("broker", sa.String(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "portfolio_holdings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("snapshot_id", sa.UUID(), nullable=False),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("shares", sa.Float(), nullable=False),
        sa.Column("avg_cost", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.ForeignKeyConstraint(["snapshot_id"], ["portfolio_snapshots.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("portfolio_holdings")
    op.drop_table("portfolio_snapshots")
    op.drop_table("portfolios")
```

- [ ] **Apply the migration**

```bash
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic upgrade head
```

Expected: `Running upgrade ... -> <rev>, add_portfolio_tables`

- [ ] **Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: migration — add portfolio tables"
```

---

## Task 3: CSV Parser Service

**Files:**
- Create: `backend/app/services/portfolio_parser.py`
- Create: `backend/tests/fixtures/moomoo_positions.csv`
- Create: `backend/tests/fixtures/fidelity_positions.csv`
- Create: `backend/tests/fixtures/schwab_positions.csv`
- Create: `backend/tests/fixtures/generic_positions.csv`

- [ ] **Write test fixture CSVs**

`backend/tests/fixtures/moomoo_positions.csv`:
```
Symbol,Qty.,Cost,Avg Cost,Mkt. Value,Cur. Price,Change,% Chg,T. Cost,Unrealized P/L,%,Today's P/L,Today's %
AAPL,50,8120.00,162.40,9460.00,189.20,1.30,0.69%,8120.00,1340.00,16.50%,65.00,0.69%
NVDA,20,8200.00,410.00,17510.00,875.50,12.50,1.45%,8200.00,9310.00,113.54%,250.00,1.45%
$USD,0,0,0,5000.00,1.00,0,0%,0,0,0%,0,0%
```

`backend/tests/fixtures/fidelity_positions.csv`:
```
Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
AAPL,APPLE INC,50,$189.20,+$1.30,$9460.00,+$65.00,+0.69%,+$1340.00,+16.50%,30.00%,$8120.00,$162.40,Margin
MSFT,MICROSOFT CORP,30,$312.80,+$0.50,$9384.00,+$15.00,+0.16%,+$534.00,+6.04%,25.00%,$8850.00,$295.00,Cash
```

`backend/tests/fixtures/schwab_positions.csv`:
```
Symbol,Description,Quantity,Price,Price Change $,Price Change %,Market Value,Day Change $,Day Change %,Cost Basis,Gain/Loss $,Gain/Loss %,Ratings,Reinvest Dividends?,Capital Gains?,% Of Portfolio,Dividend Yield,Last Dividend,Ex-Dividend Date,P/E Ratio,52 Week Low,52 Week High,Volume,Intrinsic Value,In The Money,Security Type
AAPL,APPLE INC,50,$189.20,+$1.30,+0.69%,$9460.00,+$65.00,+0.69%,$8120.00,$1340.00,+16.50%,--,No,No,30.00%,0.50%,$0.25,2026-02-07,28.50,$124.17,$237.23,55000000,--,--,Stock
TSLA,TESLA INC,15,$195.40,-$2.10,-1.06%,$2931.00,-$31.50,-1.06%,$3300.00,-$369.00,-11.18%,--,No,No,10.00%,0.00%,$0.00,--,45.20,$138.80,$299.29,80000000,--,--,Stock
```

`backend/tests/fixtures/generic_positions.csv`:
```
ticker,shares,avg_cost
AAPL,50,162.40
NVDA,20,410.00
TSLA,15,220.00
```

- [ ] **Write `backend/app/services/portfolio_parser.py`**

```python
import csv
import io
from dataclasses import dataclass
from fastapi import HTTPException


@dataclass
class HoldingRow:
    ticker: str
    shares: float
    avg_cost: float | None
    currency: str = "USD"


def _normalize_headers(row: dict) -> dict[str, str]:
    return {k.lower().strip(): v for k, v in row.items()}


def _parse_float(value: str) -> float | None:
    if not value:
        return None
    cleaned = value.replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _detect_broker(headers: list[str]) -> str | None:
    h = {col.lower().strip() for col in headers}
    if "qty." in h and "avg cost" in h and "symbol" in h:
        return "moomoo"
    if "cost basis total" in h and "quantity" in h and "symbol" in h:
        return "fidelity"
    if "cost basis" in h and "quantity" in h and "symbol" in h:
        return "schwab"
    if ("ticker" in h or "symbol" in h) and ("shares" in h or "quantity" in h):
        return "generic"
    return None


def _parse_moomoo(reader: csv.DictReader) -> list[HoldingRow]:
    holdings: dict[str, HoldingRow] = {}
    for raw in reader:
        row = _normalize_headers(raw)
        ticker = row.get("symbol", "").strip().upper()
        if not ticker or ticker.startswith("$"):
            continue
        shares = _parse_float(row.get("qty.", ""))
        avg_cost = _parse_float(row.get("avg cost", ""))
        if shares is None:
            continue
        holdings[ticker] = HoldingRow(ticker=ticker, shares=shares, avg_cost=avg_cost)
    return list(holdings.values())


def _parse_fidelity(reader: csv.DictReader) -> list[HoldingRow]:
    holdings: dict[str, HoldingRow] = {}
    for raw in reader:
        row = _normalize_headers(raw)
        ticker = row.get("symbol", "").strip().upper()
        if not ticker or ticker.startswith("$") or ticker.startswith("--"):
            continue
        shares = _parse_float(row.get("quantity", ""))
        avg_cost = _parse_float(row.get("average cost basis", ""))
        if avg_cost is None:
            cost_total = _parse_float(row.get("cost basis total", ""))
            if cost_total is not None and shares:
                avg_cost = cost_total / shares
        if shares is None:
            continue
        holdings[ticker] = HoldingRow(ticker=ticker, shares=shares, avg_cost=avg_cost)
    return list(holdings.values())


def _parse_schwab(reader: csv.DictReader) -> list[HoldingRow]:
    holdings: dict[str, HoldingRow] = {}
    for raw in reader:
        row = _normalize_headers(raw)
        ticker = row.get("symbol", "").strip().upper()
        if not ticker or ticker.startswith("$") or ticker == "--":
            continue
        shares = _parse_float(row.get("quantity", ""))
        cost_total = _parse_float(row.get("cost basis", ""))
        avg_cost: float | None = None
        if cost_total is not None and shares:
            avg_cost = cost_total / shares
        if shares is None:
            continue
        holdings[ticker] = HoldingRow(ticker=ticker, shares=shares, avg_cost=avg_cost)
    return list(holdings.values())


def _parse_generic(reader: csv.DictReader) -> list[HoldingRow]:
    holdings: dict[str, HoldingRow] = {}
    for raw in reader:
        row = _normalize_headers(raw)
        ticker = (row.get("ticker") or row.get("symbol", "")).strip().upper()
        if not ticker or ticker.startswith("$"):
            continue
        shares_raw = row.get("shares") or row.get("quantity", "")
        shares = _parse_float(shares_raw)
        avg_cost_raw = row.get("avg_cost") or row.get("avg cost") or row.get("average cost", "")
        avg_cost = _parse_float(avg_cost_raw)
        if shares is None:
            continue
        holdings[ticker] = HoldingRow(ticker=ticker, shares=shares, avg_cost=avg_cost)
    return list(holdings.values())


_PARSERS = {
    "moomoo": _parse_moomoo,
    "fidelity": _parse_fidelity,
    "schwab": _parse_schwab,
    "generic": _parse_generic,
}


def parse_portfolio_csv(content: bytes) -> tuple[str, list[HoldingRow]]:
    """Detect broker and parse CSV bytes into HoldingRow list.

    Returns (broker_name, holdings). Raises HTTPException 422 on unknown format
    or 400 on empty file.
    """
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    broker = _detect_broker(list(headers))
    if broker is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not detect broker format. "
                "Expected columns: ticker (or symbol), shares (or quantity), and optionally avg_cost."
            ),
        )
    holdings = _PARSERS[broker](reader)
    if not holdings:
        raise HTTPException(status_code=400, detail="Uploaded file contains no holdings rows.")
    return broker, holdings
```

- [ ] **Commit**

```bash
git add backend/app/services/portfolio_parser.py backend/tests/fixtures/
git commit -m "feat: portfolio CSV parser with Moomoo, Fidelity, Schwab, and generic support"
```

---

## Task 4: Parser Unit Tests

**Files:**
- Modify: `backend/tests/test_portfolio.py` (create, parser section)

- [ ] **Write parser unit tests** in `backend/tests/test_portfolio.py`:

```python
import pytest
from pathlib import Path
from app.services.portfolio_parser import parse_portfolio_csv

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_moomoo_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("moomoo_positions.csv"))
    assert broker == "moomoo"
    assert len(holdings) == 2  # $USD row skipped
    aapl = next(h for h in holdings if h.ticker == "AAPL")
    assert aapl.shares == 50.0
    assert aapl.avg_cost == pytest.approx(162.40)


def test_moomoo_skips_cash_rows():
    broker, holdings = parse_portfolio_csv(_read("moomoo_positions.csv"))
    tickers = [h.ticker for h in holdings]
    assert "$USD" not in tickers


def test_fidelity_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("fidelity_positions.csv"))
    assert broker == "fidelity"
    assert len(holdings) == 2
    msft = next(h for h in holdings if h.ticker == "MSFT")
    assert msft.shares == 30.0
    assert msft.avg_cost == pytest.approx(295.00)


def test_schwab_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("schwab_positions.csv"))
    assert broker == "schwab"
    assert len(holdings) == 2
    tsla = next(h for h in holdings if h.ticker == "TSLA")
    assert tsla.shares == 15.0
    assert tsla.avg_cost == pytest.approx(3300.0 / 15.0)


def test_generic_detection_and_parse():
    broker, holdings = parse_portfolio_csv(_read("generic_positions.csv"))
    assert broker == "generic"
    assert len(holdings) == 3
    nvda = next(h for h in holdings if h.ticker == "NVDA")
    assert nvda.avg_cost == pytest.approx(410.0)


def test_duplicate_ticker_last_row_wins():
    csv_bytes = b"ticker,shares,avg_cost\nAAPL,50,162.40\nAAPL,75,155.00\n"
    _, holdings = parse_portfolio_csv(csv_bytes)
    assert len(holdings) == 1
    assert holdings[0].shares == 75.0


def test_unknown_format_raises_422():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"foo,bar\n1,2\n")
    assert exc.value.status_code == 422


def test_empty_file_raises_400():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        parse_portfolio_csv(b"ticker,shares,avg_cost\n")
    assert exc.value.status_code == 400
```

- [ ] **Run parser tests**

```bash
cd backend && python -m pytest tests/test_portfolio.py::test_moomoo_detection_and_parse tests/test_portfolio.py::test_fidelity_detection_and_parse tests/test_portfolio.py::test_schwab_detection_and_parse tests/test_portfolio.py::test_generic_detection_and_parse tests/test_portfolio.py::test_duplicate_ticker_last_row_wins tests/test_portfolio.py::test_unknown_format_raises_422 tests/test_portfolio.py::test_empty_file_raises_400 tests/test_portfolio.py::test_moomoo_skips_cash_rows -v
```

Expected: 8 tests PASSED.

- [ ] **Commit**

```bash
git add backend/tests/test_portfolio.py
git commit -m "test: parser unit tests for all broker formats"
```

---

## Task 5: Portfolio Router — CRUD + Upload + Export

**Files:**
- Create: `backend/app/routers/portfolio.py`

This task writes the full router. The in-process price cache and Alpha Vantage fetch live here too.

- [ ] **Write `backend/app/routers/portfolio.py`**

```python
import csv
import io
import time
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
import httpx

from app.database import get_db
from app.dependencies import get_current_user
from app.models.portfolio import Portfolio, PortfolioSnapshot, PortfolioHolding
from app.models.user import User
from app.models.run import Run, RunStatus
from app.models.api_key import ApiKey
from app.services.encryption import decrypt_key
from app.services.portfolio_parser import parse_portfolio_csv

router = APIRouter()

# In-process price cache: ticker → (price, expiry_unix_ts)
_price_cache: dict[str, tuple[Optional[float], float]] = {}
_CACHE_TTL = 3600  # 1 hour


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    name: str


class PortfolioSnapshotResponse(BaseModel):
    id: UUID
    portfolio_id: UUID
    uploaded_at: datetime
    broker: Optional[str]
    row_count: int
    model_config = ConfigDict(from_attributes=True)


class PortfolioListItem(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    last_snapshot_at: Optional[datetime]
    holding_count: int
    model_config = ConfigDict(from_attributes=True)


class LastRun(BaseModel):
    run_id: UUID
    verdict: str
    analysis_date: str


class HoldingResponse(BaseModel):
    ticker: str
    shares: float
    avg_cost: Optional[float]
    currency: str
    current_price: Optional[float]
    market_value: Optional[float]
    unrealized_pnl: Optional[float]
    unrealized_pnl_pct: Optional[float]
    last_run: Optional[LastRun]


class Totals(BaseModel):
    market_value: Optional[float]
    unrealized_pnl: Optional[float]
    unrealized_pnl_pct: Optional[float]


class CurrentResponse(BaseModel):
    snapshot: Optional[PortfolioSnapshotResponse]
    price_unavailable_reason: Optional[str]
    totals: Totals
    holdings: list[HoldingResponse]


# ── AV price helpers ──────────────────────────────────────────────────────────

async def _get_av_key(db: AsyncSession) -> Optional[str]:
    result = await db.execute(select(ApiKey).where(ApiKey.provider == "alpha_vantage"))
    key_row = result.scalar_one_or_none()
    if not key_row or not key_row.is_valid:
        return None
    return decrypt_key(key_row.encrypted_key)


async def _fetch_price(ticker: str, api_key: str) -> Optional[float]:
    now = time.time()
    if ticker in _price_cache:
        price, expiry = _price_cache[ticker]
        if now < expiry:
            return price
    url = (
        f"https://www.alphavantage.co/query"
        f"?function=GLOBAL_QUOTE&symbol={ticker}&apikey={api_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        price_str = data.get("Global Quote", {}).get("05. price")
        price = float(price_str) if price_str else None
    except Exception:
        price = None
    _price_cache[ticker] = (price, now + _CACHE_TTL)
    return price


# ── Portfolio CRUD ────────────────────────────────────────────────────────────

@router.get("/portfolio", response_model=list[PortfolioListItem])
async def list_portfolios(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Portfolio)
        .where(Portfolio.user_id == user.id)
        .options(selectinload(Portfolio.snapshots))
        .order_by(Portfolio.created_at)
    )
    portfolios = result.scalars().all()
    items = []
    for p in portfolios:
        latest = max(p.snapshots, key=lambda s: s.uploaded_at, default=None)
        items.append(PortfolioListItem(
            id=p.id,
            name=p.name,
            created_at=p.created_at,
            last_snapshot_at=latest.uploaded_at if latest else None,
            holding_count=latest.row_count if latest else 0,
        ))
    return items


@router.post("/portfolio", response_model=PortfolioListItem)
async def create_portfolio(
    body: PortfolioCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = Portfolio(user_id=user.id, name=body.name)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return PortfolioListItem(
        id=p.id, name=p.name, created_at=p.created_at,
        last_snapshot_at=None, holding_count=0,
    )


@router.delete("/portfolio/{portfolio_id}", status_code=204)
async def delete_portfolio(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    await db.delete(p)
    await db.commit()


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/portfolio/{portfolio_id}/upload", response_model=PortfolioSnapshotResponse)
async def upload_snapshot(
    portfolio_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    content = await file.read()
    broker, holdings = parse_portfolio_csv(content)

    snapshot = PortfolioSnapshot(
        portfolio_id=portfolio_id,
        broker=broker,
        row_count=len(holdings),
    )
    db.add(snapshot)
    await db.flush()

    for h in holdings:
        db.add(PortfolioHolding(
            snapshot_id=snapshot.id,
            ticker=h.ticker,
            shares=h.shares,
            avg_cost=h.avg_cost,
            currency=h.currency,
        ))

    await db.commit()
    await db.refresh(snapshot)
    return snapshot


# ── Current holdings (enriched) ───────────────────────────────────────────────

@router.get("/portfolio/{portfolio_id}/current", response_model=CurrentResponse)
async def get_current_holdings(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Portfolio not found")

    snap_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == portfolio_id)
        .options(selectinload(PortfolioSnapshot.holdings))
        .order_by(desc(PortfolioSnapshot.uploaded_at))
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()
    if not snapshot:
        return CurrentResponse(
            snapshot=None,
            price_unavailable_reason=None,
            totals=Totals(market_value=None, unrealized_pnl=None, unrealized_pnl_pct=None),
            holdings=[],
        )

    av_key = await _get_av_key(db)
    price_unavailable_reason: Optional[str] = None
    if not av_key:
        price_unavailable_reason = "no_av_key"

    # Fetch last run verdict per ticker (most recent completed run for this user)
    tickers = [h.ticker for h in snapshot.holdings]
    last_runs: dict[str, LastRun] = {}
    if tickers:
        for ticker in tickers:
            run_result = await db.execute(
                select(Run)
                .where(Run.created_by == user.id, Run.ticker == ticker, Run.status == RunStatus.completed, Run.verdict.isnot(None))
                .order_by(desc(Run.created_at))
                .limit(1)
            )
            run = run_result.scalar_one_or_none()
            if run:
                last_runs[ticker] = LastRun(
                    run_id=run.id,
                    verdict=run.verdict.value,
                    analysis_date=str(run.analysis_date),
                )

    enriched: list[HoldingResponse] = []
    total_market_value: float = 0.0
    total_cost: float = 0.0
    has_price = False

    for h in snapshot.holdings:
        price: Optional[float] = None
        if av_key:
            price = await _fetch_price(h.ticker, av_key)

        market_value: Optional[float] = h.shares * price if price is not None else None
        unrealized_pnl: Optional[float] = None
        unrealized_pnl_pct: Optional[float] = None
        if price is not None and h.avg_cost is not None:
            unrealized_pnl = (price - h.avg_cost) * h.shares
            unrealized_pnl_pct = (price / h.avg_cost - 1) * 100

        if market_value is not None:
            total_market_value += market_value
            has_price = True
        if h.avg_cost is not None:
            total_cost += h.avg_cost * h.shares

        enriched.append(HoldingResponse(
            ticker=h.ticker,
            shares=h.shares,
            avg_cost=h.avg_cost,
            currency=h.currency,
            current_price=price,
            market_value=market_value,
            unrealized_pnl=unrealized_pnl,
            unrealized_pnl_pct=unrealized_pnl_pct,
            last_run=last_runs.get(h.ticker),
        ))

    totals_pnl = (total_market_value - total_cost) if has_price and total_cost else None
    totals_pct = ((total_market_value / total_cost - 1) * 100) if has_price and total_cost else None
    totals = Totals(
        market_value=total_market_value if has_price else None,
        unrealized_pnl=totals_pnl,
        unrealized_pnl_pct=totals_pct,
    )

    return CurrentResponse(
        snapshot=snapshot,
        price_unavailable_reason=price_unavailable_reason,
        totals=totals,
        holdings=enriched,
    )


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/portfolio/{portfolio_id}/export")
async def export_portfolio(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    port_result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
    portfolio = port_result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    snap_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == portfolio_id)
        .options(selectinload(PortfolioSnapshot.holdings))
        .order_by(desc(PortfolioSnapshot.uploaded_at))
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(status_code=404, detail="No snapshots found for this portfolio")

    av_key = await _get_av_key(db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Ticker", "Shares", "Avg Cost", "Current Price", "Market Value",
                     "Unrealized P&L ($)", "Unrealized P&L (%)", "Last Analysis Verdict", "Last Analysis Date"])

    for h in snapshot.holdings:
        price: Optional[float] = None
        if av_key:
            price = await _fetch_price(h.ticker, av_key)
        market_value = round(h.shares * price, 2) if price is not None else ""
        pnl = round((price - h.avg_cost) * h.shares, 2) if price is not None and h.avg_cost is not None else ""
        pnl_pct = round((price / h.avg_cost - 1) * 100, 2) if price is not None and h.avg_cost is not None else ""

        run_result = await db.execute(
            select(Run)
            .where(Run.created_by == user.id, Run.ticker == h.ticker, Run.status == RunStatus.completed)
            .order_by(desc(Run.created_at))
            .limit(1)
        )
        run = run_result.scalar_one_or_none()

        writer.writerow([
            h.ticker,
            h.shares,
            h.avg_cost if h.avg_cost is not None else "",
            round(price, 2) if price is not None else "",
            market_value,
            pnl,
            pnl_pct,
            run.verdict.value if run else "",
            str(run.analysis_date) if run else "",
        ])

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    safe_name = portfolio.name.replace(" ", "_")
    filename = f"portfolio-{safe_name}-{date_str}.csv"
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Snapshot management ───────────────────────────────────────────────────────

@router.get("/portfolio/{portfolio_id}/snapshots", response_model=list[PortfolioSnapshotResponse])
async def list_snapshots(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    port_result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
    if not port_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Portfolio not found")
    result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.portfolio_id == portfolio_id)
        .order_by(desc(PortfolioSnapshot.uploaded_at))
    )
    return result.scalars().all()


@router.delete("/portfolio/{portfolio_id}/snapshots/{snapshot_id}", status_code=204)
async def delete_snapshot(
    portfolio_id: UUID,
    snapshot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    port_result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id))
    if not port_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Portfolio not found")
    snap_result = await db.execute(
        select(PortfolioSnapshot).where(PortfolioSnapshot.id == snapshot_id, PortfolioSnapshot.portfolio_id == portfolio_id)
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    await db.delete(snap)
    await db.commit()
```

- [ ] **Commit**

```bash
git add backend/app/routers/portfolio.py
git commit -m "feat: portfolio router — CRUD, upload, current holdings, export, snapshot management"
```

---

## Task 6: Mount Router + Update Conftest

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Mount the portfolio router in `backend/main.py`**

The portfolio router defines all paths starting with `/portfolio/...` internally (same pattern as the watchlist router which defines `/watchlist/...` internally and is mounted with no prefix).

Change the import on line 9 from:
```python
from app.routers import auth, runs, api_keys, users, llm_providers, watchlist
```
to:
```python
from app.routers import auth, runs, api_keys, users, llm_providers, watchlist, portfolio
```

Add after line 42 (`app.include_router(watchlist.router, tags=["watchlist"])`):
```python
app.include_router(portfolio.router, tags=["portfolio"])
```

- [ ] **Update `backend/tests/conftest.py`** to truncate the new tables:

```python
import pytest
from sqlalchemy import text
from app.database import engine


@pytest.fixture(autouse=True)
async def clean_db():
    """Truncate all tables before each test so each test starts with a clean slate."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "TRUNCATE users, runs, agent_events, reports, api_keys, run_outcomes, "
            "watchlists, watchlist_items, portfolios, portfolio_snapshots, portfolio_holdings "
            "RESTART IDENTITY CASCADE"
        ))
    yield
```

- [ ] **Commit**

```bash
git add backend/main.py backend/tests/conftest.py
git commit -m "feat: mount portfolio router; add portfolio tables to test truncate list"
```

---

## Task 7: Backend Integration Tests

**Files:**
- Modify: `backend/tests/test_portfolio.py` (add integration tests section)

- [ ] **Add integration tests** to `backend/tests/test_portfolio.py` (append after the parser tests):

```python
import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from main import app

FIXTURES = Path(__file__).parent / "fixtures"


async def _register_and_token(client: AsyncClient, email: str = "user@example.com") -> str:
    r = await client.post("/auth/register", json={"email": email, "password": "pass123", "name": "Test"})
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_and_list_portfolio():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        r = await client.post("/portfolio", json={"name": "Moomoo Taxable"}, headers=_auth(token))
        assert r.status_code == 200
        pid = r.json()["id"]

        r2 = await client.get("/portfolio", headers=_auth(token))
        assert r2.status_code == 200
        names = [p["name"] for p in r2.json()]
        assert "Moomoo Taxable" in names
        assert r2.json()[0]["holding_count"] == 0


@pytest.mark.asyncio
async def test_upload_creates_snapshot():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Test"}, headers=_auth(token))).json()["id"]

        csv_bytes = (FIXTURES / "generic_positions.csv").read_bytes()
        r = await client.post(
            f"/portfolio/{pid}/upload",
            files={"file": ("generic_positions.csv", csv_bytes, "text/csv")},
            headers=_auth(token),
        )
        assert r.status_code == 200
        snap = r.json()
        assert snap["broker"] == "generic"
        assert snap["row_count"] == 3


@pytest.mark.asyncio
async def test_two_uploads_produce_two_snapshots():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Test"}, headers=_auth(token))).json()["id"]
        csv_bytes = (FIXTURES / "generic_positions.csv").read_bytes()

        for _ in range(2):
            await client.post(
                f"/portfolio/{pid}/upload",
                files={"file": ("p.csv", csv_bytes, "text/csv")},
                headers=_auth(token),
            )

        r = await client.get(f"/portfolio/{pid}/snapshots", headers=_auth(token))
        assert len(r.json()) == 2


@pytest.mark.asyncio
async def test_current_holdings_no_snapshot():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Empty"}, headers=_auth(token))).json()["id"]
        r = await client.get(f"/portfolio/{pid}/current", headers=_auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["snapshot"] is None
        assert body["holdings"] == []


@pytest.mark.asyncio
async def test_current_holdings_with_mock_prices():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Test"}, headers=_auth(token))).json()["id"]
        csv_bytes = b"ticker,shares,avg_cost\nAAPL,10,150.00\n"
        await client.post(
            f"/portfolio/{pid}/upload",
            files={"file": ("p.csv", csv_bytes, "text/csv")},
            headers=_auth(token),
        )

        with patch("app.routers.portfolio._fetch_price", new_callable=AsyncMock, return_value=200.0), \
             patch("app.routers.portfolio._get_av_key", new_callable=AsyncMock, return_value="fake-key"):
            r = await client.get(f"/portfolio/{pid}/current", headers=_auth(token))

        assert r.status_code == 200
        h = r.json()["holdings"][0]
        assert h["ticker"] == "AAPL"
        assert h["current_price"] == 200.0
        assert h["unrealized_pnl"] == pytest.approx(500.0)
        assert h["unrealized_pnl_pct"] == pytest.approx(33.33, rel=0.01)


@pytest.mark.asyncio
async def test_current_holdings_no_av_key():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Test"}, headers=_auth(token))).json()["id"]
        csv_bytes = b"ticker,shares,avg_cost\nAAPL,10,150.00\n"
        await client.post(
            f"/portfolio/{pid}/upload",
            files={"file": ("p.csv", csv_bytes, "text/csv")},
            headers=_auth(token),
        )
        r = await client.get(f"/portfolio/{pid}/current", headers=_auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["price_unavailable_reason"] == "no_av_key"
        assert body["holdings"][0]["current_price"] is None


@pytest.mark.asyncio
async def test_delete_snapshot_rolls_back():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Test"}, headers=_auth(token))).json()["id"]
        csv_bytes = b"ticker,shares,avg_cost\nAAPL,10,150.00\n"
        snap1 = (await client.post(
            f"/portfolio/{pid}/upload",
            files={"file": ("p.csv", csv_bytes, "text/csv")},
            headers=_auth(token),
        )).json()["id"]
        csv2 = b"ticker,shares,avg_cost\nMSFT,5,300.00\n"
        await client.post(
            f"/portfolio/{pid}/upload",
            files={"file": ("p2.csv", csv2, "text/csv")},
            headers=_auth(token),
        )
        # Delete latest; snap1 becomes current again
        snaps = (await client.get(f"/portfolio/{pid}/snapshots", headers=_auth(token))).json()
        latest_id = snaps[0]["id"]
        await client.delete(f"/portfolio/{pid}/snapshots/{latest_id}", headers=_auth(token))

        r = await client.get(f"/portfolio/{pid}/current", headers=_auth(token))
        tickers = [h["ticker"] for h in r.json()["holdings"]]
        assert "AAPL" in tickers


@pytest.mark.asyncio
async def test_user_cannot_access_other_user_portfolio():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token_a = await _register_and_token(client, "a@example.com")
        token_b = await _register_and_token(client, "b@example.com")
        pid = (await client.post("/portfolio", json={"name": "Private"}, headers=_auth(token_a))).json()["id"]
        r = await client.get(f"/portfolio/{pid}/current", headers=_auth(token_b))
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_export_csv_returns_file():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _register_and_token(client)
        pid = (await client.post("/portfolio", json={"name": "Export Test"}, headers=_auth(token))).json()["id"]
        csv_bytes = b"ticker,shares,avg_cost\nAAPL,10,150.00\n"
        await client.post(
            f"/portfolio/{pid}/upload",
            files={"file": ("p.csv", csv_bytes, "text/csv")},
            headers=_auth(token),
        )
        r = await client.get(f"/portfolio/{pid}/export", headers=_auth(token))
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        lines = r.text.strip().split("\n")
        assert lines[0].startswith("Ticker")
        assert "AAPL" in lines[1]
```

- [ ] **Run all portfolio tests**

```bash
cd backend && python -m pytest tests/test_portfolio.py -v
```

Expected: All tests PASSED (no failures).

- [ ] **Commit**

```bash
git add backend/tests/test_portfolio.py
git commit -m "test: portfolio integration tests — CRUD, upload, current, export, auth isolation"
```

---

## Task 8: Frontend Types + API Client

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Add portfolio types to `frontend/lib/types.ts`** (append at end of file):

```typescript
export interface PortfolioListItem {
  id: string;
  name: string;
  created_at: string;
  last_snapshot_at: string | null;
  holding_count: number;
}

export interface PortfolioSnapshot {
  id: string;
  portfolio_id: string;
  uploaded_at: string;
  broker: string | null;
  row_count: number;
}

export interface LastRun {
  run_id: string;
  verdict: "buy" | "sell" | "hold";
  analysis_date: string;
}

export interface PortfolioHoldingResponse {
  ticker: string;
  shares: number;
  avg_cost: number | null;
  currency: string;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  last_run: LastRun | null;
}

export interface PortfolioTotals {
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
}

export interface PortfolioCurrentResponse {
  snapshot: PortfolioSnapshot | null;
  price_unavailable_reason: string | null;
  totals: PortfolioTotals;
  holdings: PortfolioHoldingResponse[];
}
```

- [ ] **Add portfolio API functions to `frontend/lib/api.ts`** (append at end of file):

```typescript
export async function listPortfolios(): Promise<PortfolioListItem[]> {
  const r = await fetchWithAuth("/portfolio");
  if (!r.ok) throw new Error("Failed to fetch portfolios");
  return r.json();
}

export async function createPortfolio(name: string): Promise<PortfolioListItem> {
  const r = await fetchWithAuth("/portfolio", { method: "POST", body: JSON.stringify({ name }) });
  if (!r.ok) throw new Error("Failed to create portfolio");
  return r.json();
}

export async function deletePortfolio(id: string): Promise<void> {
  await fetchWithAuth(`/portfolio/${id}`, { method: "DELETE" });
}

export async function uploadPortfolioSnapshot(portfolioId: string, file: File): Promise<PortfolioSnapshot> {
  const session = await getSession();
  const token = (session as { accessToken?: string })?.accessToken;
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`${BASE}/portfolio/${portfolioId}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.detail ?? "Upload failed");
  }
  return r.json();
}

export async function getPortfolioCurrent(portfolioId: string): Promise<PortfolioCurrentResponse> {
  const r = await fetchWithAuth(`/portfolio/${portfolioId}/current`);
  if (!r.ok) throw new Error("Failed to fetch portfolio holdings");
  return r.json();
}

export async function listPortfolioSnapshots(portfolioId: string): Promise<PortfolioSnapshot[]> {
  const r = await fetchWithAuth(`/portfolio/${portfolioId}/snapshots`);
  if (!r.ok) throw new Error("Failed to fetch snapshots");
  return r.json();
}

export async function deletePortfolioSnapshot(portfolioId: string, snapshotId: string): Promise<void> {
  await fetchWithAuth(`/portfolio/${portfolioId}/snapshots/${snapshotId}`, { method: "DELETE" });
}

export async function exportPortfolio(portfolioId: string, portfolioName: string): Promise<void> {
  const session = await getSession();
  const token = (session as { accessToken?: string })?.accessToken;
  const r = await fetch(`${BASE}/portfolio/${portfolioId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error("Export failed");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portfolio-${portfolioName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Also add the new types to the import at the top of `api.ts`. The current import line (line 2) is:
```typescript
import type { Run, AgentEventPayload, CreateRunRequest, ApiKeyStatus, User, Report, RunStats, CompareResult, RunOutcome, PerformanceStats, Watchlist, WatchlistItem, AddWatchlistItemRequest } from "./types";
```

Replace it with:
```typescript
import type { Run, AgentEventPayload, CreateRunRequest, ApiKeyStatus, User, Report, RunStats, CompareResult, RunOutcome, PerformanceStats, Watchlist, WatchlistItem, AddWatchlistItemRequest, PortfolioListItem, PortfolioSnapshot, PortfolioCurrentResponse } from "./types";
```

- [ ] **Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat: portfolio types and API client functions"
```

---

## Task 9: TopNav Update

**Files:**
- Modify: `frontend/components/layout/TopNav.tsx`

- [ ] **Add Portfolio to the NAV array in `frontend/components/layout/TopNav.tsx`**

Current NAV array (lines 6-12):
```typescript
const NAV = [
  { href: "/runs/new", label: "New Run" },
  { href: "/runs", label: "History" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/runs/performance", label: "Performance" },
  { href: "/settings", label: "Settings" },
];
```

Replace with:
```typescript
const NAV = [
  { href: "/runs/new", label: "New Run" },
  { href: "/runs", label: "History" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/runs/performance", label: "Performance" },
  { href: "/settings", label: "Settings" },
];
```

- [ ] **Commit**

```bash
git add frontend/components/layout/TopNav.tsx
git commit -m "feat: add Portfolio to top nav"
```

---

## Task 10: PortfolioHeader Component

**Files:**
- Create: `frontend/components/portfolio/PortfolioHeader.tsx`

- [ ] **Write `frontend/components/portfolio/PortfolioHeader.tsx`**

```typescript
"use client";
import type { PortfolioListItem, PortfolioTotals } from "@/lib/types";

interface Props {
  portfolio: PortfolioListItem;
  totals: PortfolioTotals;
  onUploadClick: () => void;
  onExportClick: () => void;
  exporting: boolean;
  switcher: React.ReactNode;
}

function fmt(n: number | null, prefix = "$"): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${prefix}${abs}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "";
  return `(${n >= 0 ? "+" : ""}${n.toFixed(2)}%)`;
}

export function PortfolioHeader({ portfolio, totals, onUploadClick, onExportClick, exporting, switcher }: Props) {
  const pnlPositive = totals.unrealized_pnl !== null && totals.unrealized_pnl >= 0;
  const pnlColor = totals.unrealized_pnl === null ? "text-slate-400" : pnlPositive ? "text-green-400" : "text-red-400";

  return (
    <div className="flex items-center gap-4 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 mb-4">
      {switcher}
      <div className="h-4 w-px bg-slate-700" />
      <div className="flex flex-col">
        <span className="text-slate-200 font-semibold text-base">{fmt(totals.market_value)}</span>
        <span className={`text-xs ${pnlColor}`}>
          {fmt(totals.unrealized_pnl)} {fmtPct(totals.unrealized_pnl_pct)}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onUploadClick}
          className="text-xs text-blue-400 hover:text-blue-300 border border-slate-700 rounded px-2 py-1"
        >
          ↑ Upload snapshot
        </button>
        <button
          onClick={onExportClick}
          disabled={exporting}
          className="text-xs text-slate-400 hover:text-slate-300 border border-slate-700 rounded px-2 py-1 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "⬇ Export CSV"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/components/portfolio/PortfolioHeader.tsx
git commit -m "feat: PortfolioHeader component"
```

---

## Task 11: PortfolioSwitcher Component

**Files:**
- Create: `frontend/components/portfolio/PortfolioSwitcher.tsx`

- [ ] **Write `frontend/components/portfolio/PortfolioSwitcher.tsx`**

```typescript
"use client";
import { useState } from "react";
import type { PortfolioListItem } from "@/lib/types";

interface Props {
  portfolios: PortfolioListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  creating: boolean;
}

export function PortfolioSwitcher({ portfolios, activeId, onSelect, onCreate, onDelete, creating }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const active = portfolios.find((p) => p.id === activeId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-purple-400 font-semibold text-sm hover:text-purple-300"
      >
        {active?.name ?? "Select portfolio"}
        <span className="text-slate-500 text-xs ml-1">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-50 min-w-48">
          {portfolios.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-800">
              <button
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className={`text-sm flex-1 text-left ${p.id === activeId ? "text-purple-400" : "text-slate-300"}`}
              >
                {p.name}
                <span className="text-slate-600 text-xs ml-2">{p.holding_count} holdings</span>
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${p.name}"? This cannot be undone.`)) onDelete(p.id); }}
                className="text-slate-600 hover:text-red-400 text-xs ml-2"
              >
                ✕
              </button>
            </div>
          ))}

          <div className="border-t border-slate-700 px-3 py-2 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  onCreate(newName.trim());
                  setNewName("");
                  setOpen(false);
                }
              }}
              placeholder="New portfolio name…"
              className="bg-slate-800 text-slate-300 text-xs rounded px-2 py-1 flex-1 border border-slate-700 outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                if (newName.trim()) { onCreate(newName.trim()); setNewName(""); setOpen(false); }
              }}
              disabled={creating || !newName.trim()}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {creating ? "…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/components/portfolio/PortfolioSwitcher.tsx
git commit -m "feat: PortfolioSwitcher component"
```

---

## Task 12: UploadDrawer Component

**Files:**
- Create: `frontend/components/portfolio/UploadDrawer.tsx`

- [ ] **Write `frontend/components/portfolio/UploadDrawer.tsx`**

```typescript
"use client";
import { useRef, useState } from "react";

const BROKER_BADGES: Record<string, string> = {
  moomoo: "text-purple-400",
  fidelity: "text-blue-400",
  schwab: "text-green-400",
  generic: "text-pink-400",
};

interface Props {
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
  error: string | null;
}

export function UploadDrawer({ onUpload, uploading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (file: File) => setSelectedFile(file);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    await onUpload(selectedFile);
    setSelectedFile(null);
  };

  return (
    <div className="mb-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors
          ${dragging ? "border-blue-500 bg-blue-950/20" : "border-slate-700 hover:border-slate-500"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
        {selectedFile ? (
          <p className="text-slate-300 text-sm">{selectedFile.name}</p>
        ) : (
          <>
            <p className="text-slate-400 text-sm mb-2">
              Drag & drop your broker CSV here, or <span className="text-blue-400">browse</span>
            </p>
            <p className="text-slate-600 text-xs mb-3">Supports: Moomoo · Fidelity · Schwab · Generic CSV</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {Object.entries(BROKER_BADGES).map(([broker, color]) => (
                <span key={broker} className={`bg-slate-800 rounded px-2 py-0.5 text-xs capitalize ${color}`}>
                  {broker}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {selectedFile && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-3 py-1.5"
          >
            {uploading ? "Uploading…" : "Upload snapshot"}
          </button>
          <button onClick={() => setSelectedFile(null)} className="text-xs text-slate-500 hover:text-slate-300">
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/components/portfolio/UploadDrawer.tsx
git commit -m "feat: UploadDrawer component"
```

---

## Task 13: HoldingsTable Component

**Files:**
- Create: `frontend/components/portfolio/HoldingsTable.tsx`

- [ ] **Write `frontend/components/portfolio/HoldingsTable.tsx`**

```typescript
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PortfolioHoldingResponse } from "@/lib/types";

interface Props {
  holdings: PortfolioHoldingResponse[];
  priceUnavailableReason: string | null;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPnl(n: number | null, pct: number | null): React.ReactNode {
  if (n === null) return <span className="text-slate-600">—</span>;
  const color = n >= 0 ? "text-green-400" : "text-red-400";
  const sign = n >= 0 ? "+" : "";
  return (
    <span className={color}>
      {sign}${fmt(Math.abs(n))}
      {pct !== null && <span className="text-xs ml-1">({sign}{fmt(pct, 1)}%)</span>}
    </span>
  );
}

const VERDICT_STYLES: Record<string, string> = {
  buy: "bg-green-900 text-green-300",
  sell: "bg-red-900 text-red-300",
  hold: "bg-orange-900 text-orange-300",
};

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return diff === 0 ? "today" : `${diff}d ago`;
}

export function HoldingsTable({ holdings, priceUnavailableReason }: Props) {
  const router = useRouter();

  if (holdings.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-8">No holdings in this snapshot.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {priceUnavailableReason === "no_av_key" && (
        <p className="text-slate-500 text-xs mb-3">
          Live prices unavailable — add your Alpha Vantage key in{" "}
          <Link href="/settings" className="text-blue-400 hover:underline">Settings</Link>.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs uppercase text-left border-b border-slate-800">
            <th className="pb-2 pr-4">Ticker</th>
            <th className="pb-2 pr-4">Shares</th>
            <th className="pb-2 pr-4">Avg Cost</th>
            <th className="pb-2 pr-4">Price</th>
            <th className="pb-2 pr-4">Mkt Value</th>
            <th className="pb-2 pr-4">Unrealized P&L</th>
            <th className="pb-2 pr-4">Last Analysis</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.ticker} className="border-b border-slate-800/50 hover:bg-slate-800/30">
              <td className="py-3 pr-4">
                {h.last_run ? (
                  <Link
                    href={`/runs/${h.last_run.run_id}`}
                    className="text-purple-400 font-mono font-semibold hover:text-purple-300"
                  >
                    {h.ticker}
                  </Link>
                ) : (
                  <span className="text-purple-400 font-mono font-semibold">{h.ticker}</span>
                )}
              </td>
              <td className="py-3 pr-4 text-slate-300">{h.shares}</td>
              <td className="py-3 pr-4 text-slate-500">{h.avg_cost !== null ? `$${fmt(h.avg_cost)}` : "—"}</td>
              <td className="py-3 pr-4 text-slate-300">{h.current_price !== null ? `$${fmt(h.current_price)}` : "—"}</td>
              <td className="py-3 pr-4 text-slate-300">{h.market_value !== null ? `$${fmt(h.market_value)}` : "—"}</td>
              <td className="py-3 pr-4">{fmtPnl(h.unrealized_pnl, h.unrealized_pnl_pct)}</td>
              <td className="py-3 pr-4">
                {h.last_run ? (
                  <span className="flex items-center gap-1.5">
                    <span className={`text-xs rounded px-1.5 py-0.5 uppercase font-bold ${VERDICT_STYLES[h.last_run.verdict] ?? ""}`}>
                      {h.last_run.verdict}
                    </span>
                    <Link href={`/runs/${h.last_run.run_id}`} className="text-slate-500 text-xs hover:text-slate-300">
                      {daysAgo(h.last_run.analysis_date)} →
                    </Link>
                  </span>
                ) : (
                  <span className="text-slate-600 text-xs italic">Not analyzed</span>
                )}
              </td>
              <td className="py-3">
                <button
                  onClick={() => router.push(`/runs/new?ticker=${h.ticker}`)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Analyze
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/components/portfolio/HoldingsTable.tsx
git commit -m "feat: HoldingsTable component"
```

---

## Task 14: Portfolio Page

**Files:**
- Create: `frontend/app/portfolio/page.tsx`

- [ ] **Write `frontend/app/portfolio/page.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopNav } from "@/components/layout/TopNav";
import { PortfolioHeader } from "@/components/portfolio/PortfolioHeader";
import { PortfolioSwitcher } from "@/components/portfolio/PortfolioSwitcher";
import { UploadDrawer } from "@/components/portfolio/UploadDrawer";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import {
  listPortfolios,
  createPortfolio,
  deletePortfolio,
  uploadPortfolioSnapshot,
  getPortfolioCurrent,
  exportPortfolio,
} from "@/lib/api";

export default function PortfolioPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios"],
    queryFn: listPortfolios,
  });

  // Auto-select first portfolio once loaded — useEffect avoids side effects during render
  useEffect(() => {
    if (portfolios.length > 0 && activeId === null) {
      setActiveId(portfolios[0].id);
    }
  }, [portfolios, activeId]);

  const { data: current, isLoading: loadingHoldings } = useQuery({
    queryKey: ["portfolio-current", activeId],
    queryFn: () => getPortfolioCurrent(activeId!),
    enabled: !!activeId,
  });

  const createMut = useMutation({
    mutationFn: createPortfolio,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      setActiveId(p.id);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deletePortfolio,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      setActiveId(null);
    },
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadPortfolioSnapshot(activeId!, file),
    onSuccess: () => {
      setShowUpload(false);
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      qc.invalidateQueries({ queryKey: ["portfolio-current", activeId] });
    },
    onError: (e: Error) => setUploadError(e.message),
  });

  const activePortfolio = portfolios.find((p) => p.id === activeId) ?? null;

  const handleExport = async () => {
    if (!activeId || !activePortfolio) return;
    setExporting(true);
    try {
      await exportPortfolio(activeId, activePortfolio.name);
    } finally {
      setExporting(false);
    }
  };

  const switcher = (
    <PortfolioSwitcher
      portfolios={portfolios}
      activeId={activeId}
      onSelect={setActiveId}
      onCreate={(name) => createMut.mutate(name)}
      onDelete={(id) => deleteMut.mutate(id)}
      creating={createMut.isPending}
    />
  );

  return (
    <>
      <TopNav />
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-slate-200 text-lg font-semibold mb-4">Portfolio</h1>

        {portfolios.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-sm mb-4">No portfolios yet. Create one to get started.</p>
            <button
              onClick={() => createMut.mutate("My Portfolio")}
              className="text-sm text-blue-400 border border-slate-700 rounded px-4 py-2 hover:border-blue-500"
            >
              + Create portfolio
            </button>
          </div>
        )}

        {activePortfolio && (
          <>
            <PortfolioHeader
              portfolio={activePortfolio}
              totals={current?.totals ?? { market_value: null, unrealized_pnl: null, unrealized_pnl_pct: null }}
              onUploadClick={() => setShowUpload((v) => !v)}
              onExportClick={handleExport}
              exporting={exporting}
              switcher={switcher}
            />

            {showUpload && (
              <UploadDrawer
                onUpload={(file) => uploadMut.mutateAsync(file)}
                uploading={uploadMut.isPending}
                error={uploadError}
              />
            )}

            {!current?.snapshot && !loadingHoldings && !showUpload && (
              <div className="text-center py-12">
                <p className="text-slate-500 text-sm mb-3">No snapshots yet. Upload your first broker CSV.</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="text-sm text-blue-400 border border-slate-700 rounded px-4 py-2 hover:border-blue-500"
                >
                  ↑ Upload snapshot
                </button>
              </div>
            )}

            {loadingHoldings && (
              <p className="text-slate-500 text-sm text-center py-8">Loading holdings…</p>
            )}

            {current && current.snapshot && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-500 text-xs">
                    {current.snapshot.row_count} holdings · uploaded{" "}
                    {new Date(current.snapshot.uploaded_at).toLocaleDateString()}{" "}
                    {current.snapshot.broker && (
                      <span className="capitalize text-slate-600">via {current.snapshot.broker}</span>
                    )}
                  </p>
                </div>
                <HoldingsTable
                  holdings={current.holdings}
                  priceUnavailableReason={current.price_unavailable_reason}
                />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/app/portfolio/page.tsx
git commit -m "feat: portfolio page — full wired-up UI with switcher, upload, holdings table, export"
```

---

## Task 15: Manual End-to-End Smoke Test

- [ ] **Start the full stack**

```bash
# Terminal 1
cd backend && python -m uvicorn main:app --reload

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Open http://localhost:3000/portfolio** — verify the Portfolio nav item appears and the page loads with the "No portfolios yet" empty state.

- [ ] **Create a portfolio** — click "+ Create portfolio". Verify the switcher shows "My Portfolio".

- [ ] **Upload the generic fixture** — click "Upload snapshot", select `backend/tests/fixtures/generic_positions.csv`. Verify the snapshot uploads (broker: generic, row_count: 3) and the holdings table shows AAPL, NVDA, TSLA.

- [ ] **Verify AV key banner** — if no Alpha Vantage key is set in Settings, the table shows "—" for Price/Market Value/P&L and a hint linking to Settings. Set the key in Settings and reload — prices should populate.

- [ ] **Click Analyze on an unanalyzed holding** — verify navigation to `/runs/new?ticker=AAPL` with the ticker field pre-filled.

- [ ] **Click a verdict badge** on an analyzed holding — verify navigation to the correct run detail page.

- [ ] **Export CSV** — click "⬇ Export CSV". Verify a `.csv` file downloads with correct headers and the ticker rows.

- [ ] **Upload a second snapshot** — upload a second CSV. Verify the snapshot count in `/portfolio/{id}/snapshots` is 2.

- [ ] **Run full backend test suite** to confirm no regressions

```bash
cd backend && python -m pytest -v
```

Expected: All tests PASSED.

- [ ] **Run frontend type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Commit any fixes found during smoke test, then final commit**

```bash
git add -A
git commit -m "chore: smoke test fixes"
```
