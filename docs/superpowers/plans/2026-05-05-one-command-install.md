# One-Command Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single `curl | bash` (Mac/Linux) and `irm | iex` (Windows) installer that pulls pre-built Docker images from GHCR and starts AgentFloor with auto-generated secrets in under 60 seconds.

**Architecture:** GitHub Actions builds `ghcr.io/saketnayak/agentfloor-backend` and `ghcr.io/saketnayak/agentfloor-frontend` images on every merge to `main`. The installer downloads `docker-compose.prod.yml`, generates secrets, writes `.env` to `~/.agentfloor/`, and runs `docker compose up -d`. A shell alias (`agentfloor`) wraps common lifecycle commands.

**Tech Stack:** GitHub Actions, GHCR, Docker Compose, bash, PowerShell 5+

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/Dockerfile` | Modify | Run `alembic upgrade head` before uvicorn |
| `frontend/Dockerfile` | Modify | Bake `NEXT_PUBLIC_API_URL=/api` at build time |
| `frontend/lib/websocket.ts` | Modify | Derive WS host from `window.location` (works on any hostname) |
| `docker-compose.prod.yml` | Create | Production compose referencing GHCR images |
| `.github/workflows/publish.yml` | Create | Build + push both images to GHCR on merge/tag |
| `install.sh` | Create | Bash installer for Mac + Linux |
| `install.ps1` | Create | PowerShell installer for Windows |

**Files NOT changed:** `backend/main.py` (already has `GET /health`), `frontend/next.config.mjs` (rewrite unused in nginx setup), `nginx.conf` (unchanged).

---

## Task 1: Backend Dockerfile — run migrations on start

**Files:**
- Modify: `backend/Dockerfile`

**Why:** `alembic upgrade head` in the entrypoint means every `agentfloor update` automatically applies new migrations before traffic resumes. The backend already `depends_on: db: condition: service_healthy` so Postgres is ready when this runs.

- [ ] **Step 1: Edit `backend/Dockerfile`**

Replace the final `CMD` line. Full file after change:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN pip install uv
COPY pyproject.toml .
RUN uv pip install --system -e ".[dev]"

COPY . .

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Step 2: Verify the change builds locally**

```bash
cd backend
docker build -t agentfloor-backend-test .
```

Expected: image builds successfully (no errors). Migrations won't run during build — only on container start.

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: run alembic migrations automatically on backend container start"
```

---

## Task 2: Frontend — portable image that works on any hostname

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `frontend/lib/websocket.ts`

**Why:** `NEXT_PUBLIC_*` variables are baked at build time in Next.js. The pre-built GHCR image must work for any install (localhost, LAN IP, custom domain). Solution: bake `NEXT_PUBLIC_API_URL=/api` — all API calls become relative and nginx routes `/api/*` → backend. WebSocket needs `window.location` because `new WebSocket('/api/...')` is invalid (must be absolute `ws://`).

- [ ] **Step 1: Edit `frontend/Dockerfile`**

Add `ARG` and `ENV` before the builder's `RUN npm run build`. Full file after change:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Edit `frontend/lib/websocket.ts`**

Replace the `WS_BASE` line (line 5). The function body and imports are unchanged:

```typescript
"use client";
import { useEffect, useRef, useCallback } from "react";
import type { AgentEventPayload } from "./types";

const WS_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : (process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") ?? "ws://localhost:8000");

export function useAgentStream(runId: string, onEvent: (e: AgentEventPayload) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/runs/${runId}`);
    wsRef.current = ws;
    ws.onmessage = (msg) => {
      try {
        onEventRef.current(JSON.parse(msg.data) as AgentEventPayload);
      } catch {}
    };
    ws.onclose = (e) => {
      if (e.code !== 1000) setTimeout(connect, 2000);
    };
  }, [runId]);

  useEffect(() => {
    connect();
    const ping = setInterval(() => wsRef.current?.send("ping"), 30000);
    return () => {
      clearInterval(ping);
      wsRef.current?.close(1000);
    };
  }, [connect]);
}
```

- [ ] **Step 3: Type-check the frontend**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify the frontend image builds**

```bash
cd frontend
docker build -t agentfloor-frontend-test .
```

Expected: image builds successfully.

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile frontend/lib/websocket.ts
git commit -m "feat: bake relative API base URL and derive WebSocket host from window.location for portable Docker image"
```

---

## Task 3: `docker-compose.prod.yml` — production compose

**Files:**
- Create: `docker-compose.prod.yml`

**Why:** End users download this file (not the dev `docker-compose.yml`). It references GHCR images instead of `build:` directives so no source code or build toolchain is required.

- [ ] **Step 1: Create `docker-compose.prod.yml` at repo root**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: agentfloor
      POSTGRES_PASSWORD: agentfloor
      POSTGRES_DB: agentfloor
    volumes:
      - agentfloor_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agentfloor"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    image: ghcr.io/saketnayak/agentfloor-backend:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+asyncpg://agentfloor:agentfloor@db:5432/agentfloor
      JWT_SECRET: "${JWT_SECRET}"
      ENCRYPTION_KEY: "${ENCRYPTION_KEY}"
      NEXTAUTH_URL: "${NEXTAUTH_URL:-http://localhost}"
      OPENAI_API_KEY: "${OPENAI_API_KEY:-}"
      ALPHA_VANTAGE_KEY: "${ALPHA_VANTAGE_KEY:-}"
      SMTP_HOST: "${SMTP_HOST:-}"
      SMTP_PORT: "${SMTP_PORT:-587}"
      SMTP_USER: "${SMTP_USER:-}"
      SMTP_PASSWORD: "${SMTP_PASSWORD:-}"
      SMTP_FROM: "${SMTP_FROM:-noreply@agentfloor.local}"
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-}"
      GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET:-}"
      FRONTEND_URL: "${NEXTAUTH_URL:-http://localhost}"

  frontend:
    image: ghcr.io/saketnayak/agentfloor-frontend:latest
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      NEXTAUTH_URL: "${NEXTAUTH_URL:-http://localhost}"
      NEXTAUTH_SECRET: "${NEXTAUTH_SECRET}"

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    depends_on:
      - frontend
      - backend
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro

volumes:
  agentfloor_pgdata:
```

- [ ] **Step 2: Verify the compose file is valid**

```bash
docker compose -f docker-compose.prod.yml config --quiet
```

Expected: exits 0 with no errors (env vars will show warnings for unset vars — that is expected before `.env` exists).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat: add production docker-compose.prod.yml using GHCR images"
```

---

## Task 4: GitHub Actions — build and push images to GHCR

**Files:**
- Create: `.github/workflows/publish.yml`

**Why:** Automates building and publishing versioned images on every merge to `main` and on `v*` git tags. Uses the built-in `GITHUB_TOKEN` — no secrets to configure.

- [ ] **Step 1: Create `.github/workflows/publish.yml`**

```yaml
name: Publish Docker images

on:
  push:
    branches: [main]
    tags: ["v*"]

env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ghcr.io/saketnayak/agentfloor-backend
  FRONTEND_IMAGE: ghcr.io/saketnayak/agentfloor-frontend

jobs:
  build-backend:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.BACKEND_IMAGE }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern={{version}}

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  build-frontend:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.FRONTEND_IMAGE }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern={{version}}

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            NEXT_PUBLIC_API_URL=/api
```

- [ ] **Step 2: Commit and push to trigger the workflow**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: publish backend and frontend Docker images to GHCR on merge to main"
git push
```

- [ ] **Step 3: Verify the workflow runs successfully**

Open `https://github.com/saketnayak/trading-command-center/actions` in a browser.

Expected: both `build-backend` and `build-frontend` jobs show green checkmarks. Images visible at `https://github.com/saketnayak?tab=packages`.

- [ ] **Step 4: Make packages public (one-time)**

In GitHub: go to each package → Package settings → Change visibility → Public.

This allows `docker pull` without authentication, which is required for the installer to work without a GitHub login.

---

## Task 5: `install.sh` — bash installer for Mac and Linux

**Files:**
- Create: `install.sh`

- [ ] **Step 1: Create `install.sh` at repo root**

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/.agentfloor"
REPO_RAW="https://raw.githubusercontent.com/saketnayak/trading-command-center/main"
VERSION="${AGENTFLOOR_VERSION:-latest}"

# ── colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[agentfloor]${RESET} $*"; }
success() { echo -e "${GREEN}[agentfloor]${RESET} $*"; }
fatal()   { echo -e "${RED}[agentfloor] ERROR:${RESET} $*" >&2; exit 1; }

# ── 1/7  check docker ──────────────────────────────────────────────────────
info "[1/7] Checking Docker..."
command -v docker >/dev/null 2>&1 || fatal "Docker not found. Install it from https://docker.com then re-run this script."
docker compose version >/dev/null 2>&1 || fatal "Docker Compose plugin not found. Install Docker Desktop or 'docker compose' plugin."
DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null | cut -d. -f1)
[ "${DOCKER_VERSION:-0}" -ge 24 ] 2>/dev/null || fatal "Docker >= 24 required (found ${DOCKER_VERSION:-unknown}). Please upgrade."
success "Docker OK"

# ── 2/7  install directory ─────────────────────────────────────────────────
info "[2/7] Creating install directory at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

# ── 3/7  download files ────────────────────────────────────────────────────
info "[3/7] Downloading configuration files..."
curl -fsSL "$REPO_RAW/docker-compose.prod.yml" -o "$INSTALL_DIR/docker-compose.yml"
curl -fsSL "$REPO_RAW/nginx.conf"              -o "$INSTALL_DIR/nginx.conf"

# pin version if requested
if [ "$VERSION" != "latest" ]; then
  sed -i.bak "s|:latest|:${VERSION}|g" "$INSTALL_DIR/docker-compose.yml" && rm -f "$INSTALL_DIR/docker-compose.yml.bak"
  info "Pinned to version $VERSION"
fi

# ── 4/7  generate secrets ──────────────────────────────────────────────────
info "[4/7] Generating secrets..."
if [ -f "$INSTALL_DIR/.env" ]; then
  info ".env already exists — keeping existing secrets."
  # shellcheck disable=SC1090
  set -a; source "$INSTALL_DIR/.env"; set +a
else
  JWT_SECRET=$(openssl rand -hex 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  NEXTAUTH_SECRET=$(openssl rand -hex 32)
  GENERATE_ENV=1
fi

# ── 5/7  prompt for optional values ───────────────────────────────────────
if [ "${GENERATE_ENV:-0}" = "1" ]; then
  echo ""
  read -rp "Enter your OpenAI API key       (press Enter to skip): " OPENAI_API_KEY
  read -rp "Enter your Alpha Vantage key    (press Enter to skip): " ALPHA_VANTAGE_KEY
  read -rp "Public URL of this install      (default: http://localhost): " NEXTAUTH_URL
  NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost}"
  echo ""

# ── 6/7  write .env ───────────────────────────────────────────────────────
  info "[6/7] Writing $INSTALL_DIR/.env..."
  cat > "$INSTALL_DIR/.env" <<EOF
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${NEXTAUTH_URL}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ALPHA_VANTAGE_KEY=${ALPHA_VANTAGE_KEY:-}
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@agentfloor.local
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
  chmod 600 "$INSTALL_DIR/.env"
else
  info "[6/7] Using existing .env."
fi

# ── 7/7  start the stack ───────────────────────────────────────────────────
info "[7/7] Starting AgentFloor..."
docker compose --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/docker-compose.yml" up -d

info "Waiting for AgentFloor to be ready (up to 90s)..."
TIMEOUT=90; ELAPSED=0
until curl -sf http://localhost/api/health >/dev/null 2>&1; do
  sleep 2; ELAPSED=$((ELAPSED + 2))
  [ "$ELAPSED" -ge "$TIMEOUT" ] && fatal "Timed out. Check logs with: agentfloor logs"
done

# ── install the agentfloor alias ───────────────────────────────────────────
ALIAS_BLOCK='
# AgentFloor management alias — added by installer
agentfloor() {
  case "$1" in
    update)  docker compose --env-file "$HOME/.agentfloor/.env" -f "$HOME/.agentfloor/docker-compose.yml" pull \
               && docker compose --env-file "$HOME/.agentfloor/.env" -f "$HOME/.agentfloor/docker-compose.yml" up -d ;;
    logs)    docker compose --env-file "$HOME/.agentfloor/.env" -f "$HOME/.agentfloor/docker-compose.yml" logs -f ;;
    *)       docker compose --env-file "$HOME/.agentfloor/.env" -f "$HOME/.agentfloor/docker-compose.yml" "$@" ;;
  esac
}'

for RC in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$RC" ] && ! grep -q "AgentFloor management alias" "$RC"; then
    echo "$ALIAS_BLOCK" >> "$RC"
  fi
done

# ── success banner ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  AgentFloor is running!${RESET}"
echo -e "  Open ${CYAN}http://localhost${RESET} and register your admin account."
echo ""
echo -e "  ${BOLD}Useful commands (restart your shell first):${RESET}"
echo -e "    agentfloor update    pull the latest version"
echo -e "    agentfloor logs      stream logs"
echo -e "    agentfloor stop      shut down"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x install.sh
```

- [ ] **Step 3: Smoke-test the script syntax**

```bash
bash -n install.sh
```

Expected: exits 0 with no output (syntax check only — does not run the script).

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "feat: add bash installer for Mac and Linux"
```

---

## Task 6: `install.ps1` — PowerShell installer for Windows

**Files:**
- Create: `install.ps1`

- [ ] **Step 1: Create `install.ps1` at repo root**

```powershell
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:USERPROFILE ".agentfloor"
$RepoRaw    = "https://raw.githubusercontent.com/saketnayak/trading-command-center/main"
$Version    = if ($env:AGENTFLOOR_VERSION) { $env:AGENTFLOOR_VERSION } else { "latest" }

function Write-Info    { param($m) Write-Host "[agentfloor] $m" -ForegroundColor Cyan }
function Write-Success { param($m) Write-Host "[agentfloor] $m" -ForegroundColor Green }
function Write-Fatal   { param($m) Write-Host "[agentfloor] ERROR: $m" -ForegroundColor Red; exit 1 }

# ── 1/7  check docker ──────────────────────────────────────────────────────
Write-Info "[1/7] Checking Docker..."
try { $null = docker version 2>&1 } catch { Write-Fatal "Docker not found. Install Docker Desktop from https://docker.com then re-run." }
try { $null = docker compose version 2>&1 } catch { Write-Fatal "Docker Compose plugin not found. Install Docker Desktop." }
Write-Success "Docker OK"

# ── 2/7  install directory ─────────────────────────────────────────────────
Write-Info "[2/7] Creating install directory at $InstallDir..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# ── 3/7  download files ────────────────────────────────────────────────────
Write-Info "[3/7] Downloading configuration files..."
Invoke-WebRequest "$RepoRaw/docker-compose.prod.yml" -OutFile "$InstallDir\docker-compose.yml" -UseBasicParsing
Invoke-WebRequest "$RepoRaw/nginx.conf"              -OutFile "$InstallDir\nginx.conf"         -UseBasicParsing

if ($Version -ne "latest") {
    $content = Get-Content "$InstallDir\docker-compose.yml" -Raw
    $content -replace ":latest", ":$Version" | Set-Content "$InstallDir\docker-compose.yml"
    Write-Info "Pinned to version $Version"
}

# ── helper: generate 32 random bytes as lowercase hex ─────────────────────
function New-HexSecret {
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    return ([System.BitConverter]::ToString($bytes) -replace "-", "").ToLower()
}

# ── 4/7  generate or reuse secrets ────────────────────────────────────────
Write-Info "[4/7] Generating secrets..."
$EnvFile = "$InstallDir\.env"
$GenerateEnv = $false

if (Test-Path $EnvFile) {
    Write-Info ".env already exists — keeping existing secrets."
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") { [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2]) }
    }
} else {
    $JwtSecret      = New-HexSecret
    $EncryptionKey  = New-HexSecret
    $NextAuthSecret = New-HexSecret
    $GenerateEnv    = $true
}

# ── 5/7  prompt for optional values ───────────────────────────────────────
if ($GenerateEnv) {
    $OpenAiKey       = Read-Host "Enter your OpenAI API key    (press Enter to skip)"
    $AlphaVantageKey = Read-Host "Enter your Alpha Vantage key (press Enter to skip)"
    $NextAuthUrl     = Read-Host "Public URL of this install   (default: http://localhost)"
    if (-not $NextAuthUrl) { $NextAuthUrl = "http://localhost" }

# ── 6/7  write .env ───────────────────────────────────────────────────────
    Write-Info "[6/7] Writing $EnvFile..."
    @"
JWT_SECRET=$JwtSecret
ENCRYPTION_KEY=$EncryptionKey
NEXTAUTH_SECRET=$NextAuthSecret
NEXTAUTH_URL=$NextAuthUrl
OPENAI_API_KEY=$OpenAiKey
ALPHA_VANTAGE_KEY=$AlphaVantageKey
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@agentfloor.local
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
"@ | Set-Content $EnvFile -Encoding UTF8

    # Restrict .env to current user only
    $acl = Get-Acl $EnvFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $env:USERNAME, "ReadWrite", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl $EnvFile $acl
} else {
    Write-Info "[6/7] Using existing .env."
}

# ── 7/7  start the stack ───────────────────────────────────────────────────
Write-Info "[7/7] Starting AgentFloor..."
docker compose --env-file $EnvFile -f "$InstallDir\docker-compose.yml" up -d

Write-Info "Waiting for AgentFloor to be ready (up to 90s)..."
$Timeout = 90; $Elapsed = 0
while ($true) {
    try {
        $r = Invoke-WebRequest "http://localhost/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) { break }
    } catch {}
    Start-Sleep 2; $Elapsed += 2
    if ($Elapsed -ge $Timeout) { Write-Fatal "Timed out. Check logs with: agentfloor logs" }
}

# ── install agentfloor function into PowerShell profile ───────────────────
$ProfileDir = Split-Path $PROFILE
if (-not (Test-Path $ProfileDir)) { New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null }
if (-not (Test-Path $PROFILE))    { New-Item -ItemType File      -Force -Path $PROFILE    | Out-Null }

$AliasBlock = @'

# AgentFloor management function — added by installer
function agentfloor {
    param([string]$Command)
    $ef = "$env:USERPROFILE\.agentfloor\.env"
    $dc = "$env:USERPROFILE\.agentfloor\docker-compose.yml"
    switch ($Command) {
        "update" {
            docker compose --env-file $ef -f $dc pull
            docker compose --env-file $ef -f $dc up -d
        }
        "logs"   { docker compose --env-file $ef -f $dc logs -f }
        default  { docker compose --env-file $ef -f $dc $args }
    }
}
'@

if (-not (Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue | Select-String "AgentFloor management function")) {
    Add-Content $PROFILE $AliasBlock
}

# ── success banner ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  AgentFloor is running!" -ForegroundColor White
Write-Host "  Open http://localhost and register your admin account." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Useful commands (restart PowerShell first):" -ForegroundColor White
Write-Host "    agentfloor update    pull the latest version"
Write-Host "    agentfloor logs      stream logs"
Write-Host "    agentfloor stop      shut down"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
```

- [ ] **Step 2: Commit**

```bash
git add install.ps1
git commit -m "feat: add PowerShell installer for Windows"
```

---

## Task 7: End-to-end verification

**Goal:** Confirm the full install flow works before announcing the feature.

- [ ] **Step 1: Confirm GHCR images are public**

```bash
docker pull ghcr.io/saketnayak/agentfloor-backend:latest
docker pull ghcr.io/saketnayak/agentfloor-frontend:latest
```

Expected: both pull successfully without a `docker login`.

- [ ] **Step 2: Run a clean install test locally**

```bash
# Remove any prior install to simulate first-time user
rm -rf ~/.agentfloor
docker compose -f ~/.agentfloor/docker-compose.yml down -v 2>/dev/null || true

# Run the installer exactly as a user would
bash install.sh
```

Expected: completes within 90 seconds, prints success banner, `http://localhost` loads the AgentFloor UI.

- [ ] **Step 3: Verify the /register flow**

Open `http://localhost` in a browser. Navigate to `/register`. Create an account.

Expected: account created, redirected to `/runs`, user has `admin` role (visible in Settings).

- [ ] **Step 4: Test `agentfloor update`**

Open a new terminal (so the alias is loaded from `.zshrc`/`.bashrc`), then:

```bash
agentfloor update
```

Expected: pulls latest images, restarts stack, migrations run without error, UI is back up within 30 seconds.

- [ ] **Step 5: Test `agentfloor stop` and `agentfloor start`**

```bash
agentfloor stop
agentfloor start
```

Expected: stack stops cleanly, starts again, `http://localhost` loads.

- [ ] **Step 6: Verify data persists across stop/start**

After step 5, log back in with the account created in step 3.

Expected: account still exists (Postgres volume `agentfloor_pgdata` preserved).

- [ ] **Step 7: Push all remaining commits and open PR**

```bash
git push origin implement/agentfloor
```

Then open a PR from `implement/agentfloor` → `main`.

---

## Self-Review Checklist

- [x] **Spec coverage:** Backend migrations ✓ | GHCR images ✓ | `install.sh` all 7 steps ✓ | `install.ps1` ✓ | Management alias ✓ | Pinned version install ✓ | Reinstall safety (existing `.env` skipped) ✓ | Data persistence (named volume) ✓ | `/health` endpoint (already exists in `main.py:37`) ✓
- [x] **Placeholders:** None — all code is complete and executable.
- [x] **Type consistency:** `WS_BASE` and `BASE` variable names consistent between Tasks 2 and 7 verification steps.
- [x] **`NEXT_PUBLIC_API_URL` bake path:** Set as build arg in `frontend/Dockerfile` (Task 2) and passed explicitly in GitHub Actions `build-args` (Task 4). Both bake `/api`. ✓
- [x] **Health check URL:** Installer polls `http://localhost/health`. nginx routes `/*` → frontend, but `/health` hits nginx → frontend → Next.js. The backend's `GET /health` is reachable at `http://localhost/api/health` via nginx. **Fix:** The health poll should use `http://localhost/api/health` (nginx `/api/*` → backend), not `http://localhost/health` which goes to Next.js. Updated below.

**Fix applied to Task 5 and Task 6:** Change health poll from `http://localhost/health` to `http://localhost/api/health` in both installers.

> In `install.sh`, Task 5 Step 1: change the `until` line to:
> ```bash
> until curl -sf http://localhost/api/health >/dev/null 2>&1; do
> ```

> In `install.ps1`, Task 6 Step 1: change the `Invoke-WebRequest` line to:
> ```powershell
>         $r = Invoke-WebRequest "http://localhost/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
> ```
