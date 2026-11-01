from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.database import to_sync_psycopg2_url


@pytest.mark.unit
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "postgresql+asyncpg://agentfloor:agentfloor@db:5432/agentfloor",
            "postgresql+psycopg2://agentfloor:agentfloor@db:5432/agentfloor",
        ),
        (
            "postgresql://agentfloor:agentfloor@localhost:5433/agentfloor",
            "postgresql+psycopg2://agentfloor:agentfloor@localhost:5433/agentfloor",
        ),
        (
            "postgresql+psycopg2://agentfloor:agentfloor@db:5432/agentfloor",
            "postgresql+psycopg2://agentfloor:agentfloor@db:5432/agentfloor",
        ),
    ],
)
def test_to_sync_psycopg2_url_pins_psycopg2(raw: str, expected: str):
    assert to_sync_psycopg2_url(raw) == expected


@pytest.mark.unit
def test_published_watchlist_timezone_revisions_remain_resolvable():
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    script = ScriptDirectory.from_config(config)

    add_timezone = script.get_revision("h8i9j0k1l2m3")
    drop_timezone = script.get_revision("i9j0k1l2m3n4")

    assert add_timezone.down_revision == "g7h8i9j0k1l2"
    assert drop_timezone.down_revision == "h8i9j0k1l2m3"
    assert any(
        rev.revision == "i9j0k1l2m3n4"
        for head in script.get_heads()
        for rev in script.iterate_revisions(head, "base")
    )
