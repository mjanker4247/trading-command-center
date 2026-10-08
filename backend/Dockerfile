FROM python:3.12-slim

# Copy uv into the image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Build context is the monorepo root so vendor/TradingAgents (submodule) is available.
# Layout mirrors local: /build/backend + /build/vendor/TradingAgents
WORKDIR /build/backend

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/build/backend/.venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency metadata + vendored TradingAgents first for better layer caching
COPY backend/pyproject.toml backend/uv.lock ./
COPY vendor/TradingAgents /build/vendor/TradingAgents

# Install dependencies (not the project) into .venv — cached layer
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --frozen --no-install-project

COPY backend/ .

# Install the project itself
RUN uv sync --no-dev --frozen

RUN chmod +x start.sh
CMD ["./start.sh"]
