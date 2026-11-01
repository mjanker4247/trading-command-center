from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.base import Base  # noqa: F401 — re-exported so existing `from app.database import Base` still works
from app.config import settings

def _async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


def to_sync_psycopg2_url(url: str) -> str:
    """Map runtime/async URLs to a sync psycopg2 URL for Alembic.

    SQLAlchemy 2.1+ defaults bare postgresql:// to psycopg3; we ship psycopg2-binary.
    """
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "+psycopg2", 1)
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url.removeprefix("postgresql://")
    return url

engine = create_async_engine(_async_url(settings.database_url), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
