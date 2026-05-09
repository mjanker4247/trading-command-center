from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.base import Base  # noqa: F401 — re-exported so existing `from app.database import Base` still works
from app.config import settings

def _async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(_async_url(settings.database_url), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
