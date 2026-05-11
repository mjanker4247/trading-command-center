# AgentFloor GitHub Growth & Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the approved growth strategy to reach 500+ GitHub stars and 20–50 real self-hosting users within 3 months.

**Architecture:** Four sequential phases — (1) repo polish: file changes executable via CLI and editor; (2) upstream leverage: small TradingAgents contribution + PR to get listed in their 73k-star README; (3) launch content: platform-specific post drafts saved to `docs/launch/`; (4) community seeding: good-first-issues and profile pinning. Phases 1 and 2 run in parallel; Phase 3 follows; Phase 4 overlaps with Phase 3.

**Tech Stack:** gh CLI, git, markdown, GitHub Discussions API, Reddit, Hacker News, Product Hunt, Twitter/X

---

## Phase 1 — Repo Polish

### Task 1: Add GitHub topics and enable Discussions

**Files:**
- No files — uses `gh api` CLI calls only

- [ ] **Step 1: Replace current topics with expanded set**

```bash
gh api --method PUT /repos/saketnayak/trading-command-center/topics \
  --input - <<'EOF'
{"names":["ai","docker","fastapi","langchain","llm","nextjs","openai","portfolio","stock-analysis","trading","portfolio-tracker","self-hosted","investment-research","multi-agent"]}
EOF
```

Expected output: `{"names":["ai","docker","fastapi","langchain","llm","nextjs","openai","portfolio","stock-analysis","trading","portfolio-tracker","self-hosted","investment-research","multi-agent"]}`

- [ ] **Step 2: Enable GitHub Discussions**

```bash
gh api --method PATCH /repos/saketnayak/trading-command-center \
  -f has_discussions=true \
  --jq '.has_discussions'
```

Expected output: `true`

- [ ] **Step 3: Commit note (no code change — verify via browser)**

Open https://github.com/saketnayak/trading-command-center and confirm the Topics section shows all 14 tags and the Discussions tab appears in the repo nav.

---

### Task 2: Create CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write CONTRIBUTING.md**

Create `/path/to/repo/CONTRIBUTING.md` with this exact content:

```markdown
# Contributing to AgentFloor

Thanks for your interest! Here's everything you need to get started.

## Local development setup

**Prerequisites:** Docker Desktop, Python 3.11+, Node.js 18+

### Backend

```bash
cd backend
pip install uv && uv pip install --system -e ".[dev]"
docker compose up db -d          # starts Postgres on port 5433
DATABASE_URL=postgresql://agentfloor:agentfloor@localhost:5433/agentfloor alembic upgrade head
python -m uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Running tests

```bash
cd backend
docker compose up db -d
python -m pytest
```

## Pull request guidelines

- One feature or fix per PR — keep them focused
- Match the existing code style; don't reformat surrounding code
- Add or update tests for any changed behavior
- If you change the architecture, update `CLAUDE.md`

## Good first issues

Look for issues tagged [`good first issue`](https://github.com/saketnayak/trading-command-center/issues?q=is%3Aopen+label%3A%22good+first+issue%22) — these are well-scoped tasks with clear acceptance criteria.

## Questions and ideas

Open a [GitHub Discussion](https://github.com/saketnayak/trading-command-center/discussions) — that's the right place for questions, feature ideas, and general conversation before opening a PR.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md with local dev setup and PR guidelines"
```

---

### Task 3: Update README — add visual sections and community link

**Files:**
- Modify: `README.md`

The goal is three targeted insertions:
1. A GIF hero placeholder immediately after the tagline (to be replaced in Task 4 once recorded)
2. A "See it in action" screenshots stub before the "Why AgentFloor?" section
3. A "Community" section at the bottom, before "Contributing"

- [ ] **Step 1: Insert GIF placeholder after tagline**

Find this exact block in README.md:

```
**Track your portfolio, get AI-powered research on every holding, and wake up every morning to an automated briefing — like having a hedge fund's research desk working for you, for free, on your own machine.**

> **Research and educational use only.**
```

Replace with:

```
**Track your portfolio, get AI-powered research on every holding, and wake up every morning to an automated briefing — like having a hedge fund's research desk working for you, for free, on your own machine.**

<!-- DEMO GIF: replace this comment with: ![AgentFloor demo](docs/demo.gif) after recording -->

> **Research and educational use only.**
```

- [ ] **Step 2: Insert "See it in action" section before "Why AgentFloor?"**

Find this exact block in README.md:

```
---

## Why AgentFloor?
```

Replace with:

```
---

## See it in action

<!-- SCREENSHOTS: add 3-4 stills here after recording. Suggested layout:
![Portfolio dashboard](docs/screenshots/portfolio.png)
![AI morning briefing](docs/screenshots/briefing.png)
![Live agent analysis](docs/screenshots/analysis.png)
-->

---

## Why AgentFloor?
```

- [ ] **Step 3: Insert "Community" section before "Contributing"**

Find this exact block in README.md:

```
## Contributing

Issues and pull requests are welcome.
```

Replace with:

```
## Community

Questions, ideas, or just want to share what you're analyzing? Join the conversation in [GitHub Discussions](https://github.com/saketnayak/trading-command-center/discussions).

Found a bug or want to request a feature? [Open an issue](https://github.com/saketnayak/trading-command-center/issues).

---

## Contributing

Issues and pull requests are welcome.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add demo GIF placeholder, screenshots section, and community links to README"
```

---

### Task 4: Record demo video and replace README placeholders

**Files:**
- Create: `docs/demo.gif` (recorded externally, then committed)
- Create: `docs/screenshots/portfolio.png`, `docs/screenshots/briefing.png`, `docs/screenshots/analysis.png`
- Modify: `README.md`

**This task requires human action for the recording step.**

- [ ] **Step 1: Start the full stack**

```bash
docker compose up -d
```

Open http://localhost in a browser and log in. Ensure you have a portfolio loaded with at least 5 holdings, a completed AI briefing, and one completed deep analysis run.

- [ ] **Step 2: Record the 90-second walkthrough**

Use any screen recorder (Kap on macOS, ScreenToGif on Windows, or OBS on any platform). Record at 1280×800 or 1440×900. Cover in order:
1. Portfolio Holdings tab — scroll through holdings showing live prices, P&L, color-coded rows (10 sec)
2. AI Insights tab — health score ring, action items list, risk alerts (15 sec)
3. Click "New Analysis" → configure → Start → watch the live agent feed stream (30 sec)
4. Final verdict card — BUY/SELL/HOLD with price target and stop-loss visible (10 sec)
5. Click Export → PDF downloading (5 sec)

- [ ] **Step 3: Export artifacts**

- Export a 30–45 second GIF at 15fps from the recording (trim to the most visually impressive moments). Save as `docs/demo.gif`. Target size: under 10MB.
- Take 3 PNG screenshots: portfolio holdings table, AI briefing dashboard, live analysis feed. Save to `docs/screenshots/`.

- [ ] **Step 4: Replace README placeholders**

In `README.md`, replace:

```
<!-- DEMO GIF: replace this comment with: ![AgentFloor demo](docs/demo.gif) after recording -->
```

With:

```
![AgentFloor demo](docs/demo.gif)
```

And replace the screenshots comment block with:

```
![Portfolio dashboard](docs/screenshots/portfolio.png)
![AI morning briefing](docs/screenshots/briefing.png)
![Live agent analysis](docs/screenshots/analysis.png)
```

- [ ] **Step 5: Commit**

```bash
git add docs/demo.gif docs/screenshots/ README.md
git commit -m "docs: add demo GIF and screenshots to README"
```

- [ ] **Step 6: Push to remote and verify**

```bash
git push origin main
```

Open https://github.com/saketnayak/trading-command-center and confirm the GIF renders in the README hero and the screenshots appear in the "See it in action" section.

---

## Phase 2 — Upstream Leverage

### Task 5: Make a small contribution to TradingAgents first

**Context:** TradingAgents has 73k stars and 353 open issues. Making one small contribution before asking to be listed warms the relationship. This task identifies and executes that contribution.

- [ ] **Step 1: Browse open issues for a quick win**

```bash
gh issue list --repo TauricResearch/TradingAgents --label "bug" --limit 20
gh issue list --repo TauricResearch/TradingAgents --label "documentation" --limit 20
```

Look for any issue that is: (a) a clear docs typo or small clarification, (b) a one-file code fix, or (c) an obvious missing README section. Pick the simplest one.

- [ ] **Step 2: Fork the repo**

```bash
gh repo fork TauricResearch/TradingAgents --clone=true
cd TradingAgents
```

- [ ] **Step 3: Make the fix and open a PR**

Make the targeted change. Then:

```bash
git checkout -b fix/your-fix-description
git add <changed file>
git commit -m "fix: <short description of change>"
gh pr create --title "fix: <short description>" --body "Closes #<issue number>. <One sentence explaining the fix.>"
```

- [ ] **Step 4: Note the PR URL for use in Task 6**

Save the PR URL — you'll reference it in the upstream listing PR to demonstrate engagement with the project.

---

### Task 6: Open upstream PR adding AgentFloor to TradingAgents README

**Context:** This is the single highest-leverage action in the entire plan. Getting listed in TradingAgents' README exposes AgentFloor to their 73k-star audience permanently.

- [ ] **Step 1: Verify demo GIF is committed and pushed**

Task 4 must be complete. Confirm:

```bash
ls docs/demo.gif
```

- [ ] **Step 2: Fork and create branch (if not already forked from Task 5)**

```bash
cd TradingAgents   # or the fork cloned in Task 5
git checkout -b feat/add-agentfloor-web-ui
```

- [ ] **Step 3: Find the right place in their README**

```bash
grep -n "Related\|Frontend\|Web\|UI\|Interface\|Project" README.md | head -20
```

If a "Related Projects," "Ecosystem," or "Community" section exists, add AgentFloor there. If none exists, add a new section after the "Features" or "Installation" section:

```markdown
## Web Interface

[**AgentFloor**](https://github.com/saketnayak/trading-command-center) — A self-hosted web UI for TradingAgents. One-command Docker install (Windows/macOS/Linux). Adds portfolio tracking, automated daily briefings, cron-based scheduling, outcome tracking, and multi-user support — no Python setup required for end users.

![AgentFloor demo](https://raw.githubusercontent.com/saketnayak/trading-command-center/main/docs/demo.gif)
```

- [ ] **Step 4: Commit and open PR**

```bash
git add README.md
git commit -m "docs: add AgentFloor web UI to README"
gh pr create \
  --repo TauricResearch/TradingAgents \
  --title "docs: add AgentFloor self-hosted web UI to README" \
  --body "$(cat <<'EOF'
Hi! I've built **AgentFloor**, a self-hosted web UI for TradingAgents, and wanted to propose adding it to the README so users who find TradingAgents can discover it.

**Repo:** https://github.com/saketnayak/trading-command-center

**What it adds on top of the Python framework:**
- Full web UI (Next.js 14 + FastAPI)
- One-command Docker install — Windows, macOS, Linux (only dependency: Docker Desktop)
- Portfolio tracker with live prices, AI morning briefings, earnings calendar, news feed
- Multi-user with invite-based registration; each user's API keys stored encrypted
- APScheduler-based watchlist scheduling — runs without the browser open
- Outcome tracking at +7/14/30/90 days
- Export to PDF, Markdown, JSON

Works with OpenAI, Anthropic, Gemini, Groq, DeepSeek, Ollama (fully local), vLLM, and more.

Happy to adjust the wording or placement — just let me know what works best for your README structure.
EOF
)"
```

- [ ] **Step 5: Check for a community Discord/Slack**

```bash
grep -i "discord\|slack\|community\|chat" TradingAgents/README.md | head -5
```

If found, join and introduce yourself with a brief note linking the PR.

---

## Phase 3 — Launch Content

All posts are saved to `docs/launch/` as markdown files. Post them in the order listed, spaced 2–3 days apart. Reply to every comment within 24 hours of posting.

### Task 7: Draft HN Show HN post

**Files:**
- Create: `docs/launch/hn-show-hn.md`

- [ ] **Step 1: Write post**

Create `docs/launch/hn-show-hn.md`:

```markdown
# HN Show HN — Draft

**Title:** Show HN: AgentFloor – Self-hosted web UI for multi-agent AI stock research

**Body:**

I built AgentFloor, a self-hosted web app that wraps TradingAgents (70k-star Python LLM framework) in a full-featured UI installable with one Docker command.

The core loop: upload your portfolio from a broker CSV, and every weekday morning a scheduler runs a multi-agent LLM analysis on all your holdings and generates a briefing — health score, action items per holding, risk alerts, sector exposure. For any ticker, you can trigger a deep analysis: five specialist AI agents (fundamentals, sentiment, news, technical) each produce a full report, a bull and bear researcher debate the findings, and a trader delivers a final verdict with entry price, stop-loss, and price target.

What I found interesting to build:

- **Streaming pipeline:** TradingAgents is sync, so I run it in asyncio.to_thread with a SyncQueue/AsyncQueue bridge that simultaneously persists AgentEvent rows to Postgres AND broadcasts over WebSocket in real time
- **Outcome tracking:** at +7/14/30/90 days after each analysis, a background job fetches closing prices from Finnhub and persists a RunOutcome row — so you can see the AI's actual track record over time
- **Live scheduler:** each watchlist item stores a cron expression; APScheduler reloads jobs after every mutation without restart

Tech: FastAPI + async SQLAlchemy 2 + PostgreSQL backend; Next.js 14 App Router + TanStack Query v5 frontend. Works with OpenAI, Anthropic, Gemini, Groq, Ollama (fully local), and more.

Repo: https://github.com/saketnayak/trading-command-center

**Post timing:** weekday, 9–10am ET
**Submission URL:** https://news.ycombinator.com/submit
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/hn-show-hn.md
git commit -m "docs: add HN Show HN post draft"
```

---

### Task 8: Draft r/LocalLLaMA post

**Files:**
- Create: `docs/launch/reddit-localllama.md`

- [ ] **Step 1: Write post**

Create `docs/launch/reddit-localllama.md`:

```markdown
# r/LocalLLaMA — Draft

**Subreddit:** r/LocalLLaMA
**Title:** I built a self-hosted web UI for AI stock research that runs fully offline with Ollama

**Body:**

I've been building AgentFloor — a self-hosted web app wrapping TradingAgents (multi-agent LLM framework) in a UI you install with one Docker command.

The Ollama angle: point it at your local Ollama server, add it as a provider, and run full multi-agent stock analyses entirely on your own hardware. Five agents collaborate — fundamentals analyst, sentiment analyst, news analyst, technical analyst, and a trader — using your local models. Nothing leaves your network.

Feature rundown:
- Portfolio tracker: upload broker CSV or add manually; live prices + P&L via Finnhub (free key, optional)
- Morning briefings: automated weekday analysis of all holdings, streamed to a health-score dashboard
- Deep analysis: multi-agent debate on any ticker; watch the agent feed live in the browser
- Watchlist scheduling: cron-based, runs whether or not the browser is open
- Outcome tracking: prices fetched at +7/14/30/90 days to track accuracy over time
- Export: PDF, Markdown, JSON

Works on Windows, macOS, Linux. One Docker command, no terminal required after install.

Also supports OpenAI, Anthropic, Gemini, Groq, DeepSeek, vLLM, and OpenRouter if you'd rather use a hosted model.

Repo + demo: https://github.com/saketnayak/trading-command-center

Happy to answer questions about the Ollama integration or the multi-agent architecture.

**Post timing:** 2–3 days after HN post
**Submission URL:** https://www.reddit.com/r/LocalLLaMA/submit
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/reddit-localllama.md
git commit -m "docs: add r/LocalLLaMA post draft"
```

---

### Task 9: Draft r/SideProject post

**Files:**
- Create: `docs/launch/reddit-sideproject.md`

- [ ] **Step 1: Write post**

Create `docs/launch/reddit-sideproject.md`:

```markdown
# r/SideProject — Draft

**Subreddit:** r/SideProject
**Title:** I built a self-hosted AI research dashboard for your stock portfolio

**Body:**

Hey r/SideProject! I've been working on AgentFloor — a self-hosted web app that gives you an AI-powered research team for your stock portfolio.

What it does:
- Upload your portfolio from a broker CSV (or add holdings manually)
- Get a daily AI briefing every weekday morning: health score, action items per position, risk alerts, sector exposure
- Run a deep multi-agent analysis on any ticker in 5–20 minutes
- Set a watchlist on a cron schedule — agents run automatically without the browser open
- Track how AI verdicts aged: actual closing prices at +7d/+14d/+30d/+90d

[EMBED DEMO GIF HERE]

One-command Docker install on Windows, macOS, Linux. Works with OpenAI, Anthropic, Gemini, Groq, or fully locally via Ollama.

Repo: https://github.com/saketnayak/trading-command-center

The streaming pipeline and the APScheduler integration were the most interesting parts to build — happy to talk through the architecture if anyone's curious.

**Post timing:** 2–3 days after r/LocalLLaMA
**Submission URL:** https://www.reddit.com/r/SideProject/submit
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/reddit-sideproject.md
git commit -m "docs: add r/SideProject post draft"
```

---

### Task 10: Draft r/investing and r/stocks posts

**Files:**
- Create: `docs/launch/reddit-investing.md`

- [ ] **Step 1: Write post**

Create `docs/launch/reddit-investing.md`:

```markdown
# r/investing + r/stocks — Draft

Post to both subreddits on the same day (same copy is fine here).

**Subreddits:** r/investing, r/stocks
**Title:** I built a free, self-hosted AI research tool for retail investors — no subscription, your data stays on your machine

**Body:**

Hedge funds have entire research teams — fundamental analysts, technical analysts, sentiment researchers, risk managers — dedicated to monitoring portfolios. Individual investors have paid services that give you someone else's algorithm.

I spent the past few months building AgentFloor, a free, self-hosted web app that gives you the same kind of multi-agent research workflow on your own computer.

What it actually does:
- Upload your portfolio (any broker CSV works) — it shows live prices and unrealized P&L for every holding
- Every weekday morning, AI agents automatically analyze all holdings and generate a briefing: an overall health score, action items per position (BUY MORE / TRIM / EXIT / WATCH), risk alerts, and a sector exposure chart
- For any ticker, run a deeper analysis: multiple specialized AI agents produce independent reports, a bull and bear researcher debate the findings, and a final verdict with entry price, stop-loss, and price target comes out the other end
- Upcoming earnings calendar, fundamentals (P/E, beta, 52-week range, EPS, market cap) per holding
- Track how the AI's calls aged: actual closing prices at +7/14/30/90 days after each analysis

[EMBED DEMO GIF HERE]

Not financial advice, doesn't execute trades — purely a research tool. All AI inference runs through whichever provider you already have a key for (OpenAI, Anthropic, Gemini, etc.), or fully locally with Ollama so your data never leaves your machine.

One-command install on Windows, macOS, Linux. Free, MIT license, open source.

GitHub: https://github.com/saketnayak/trading-command-center

Happy to answer questions about how it works or what models work best for this kind of analysis.

**Post timing:** 2–3 days after r/SideProject
**Subreddit rules to check before posting:**
- r/investing: no spam; self-promotion requires disclosure ("I built this")
- r/stocks: check current rules on self-promotion; lead with the tool's utility not the star count
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/reddit-investing.md
git commit -m "docs: add r/investing and r/stocks post draft"
```

---

### Task 11: Draft Product Hunt launch copy

**Files:**
- Create: `docs/launch/product-hunt.md`

- [ ] **Step 1: Write launch copy**

Create `docs/launch/product-hunt.md`:

```markdown
# Product Hunt Launch — Draft

**Launch date:** Tuesday–Thursday (pick a day after r/investing post)
**Submission URL:** https://www.producthunt.com/posts/new

---

**Name:** AgentFloor

**Tagline:** Your personal AI hedge fund research desk, self-hosted and free

**Description:**

AgentFloor gives retail investors the same research infrastructure hedge funds use — powered by AI, running on your own computer, with your data never leaving your machine.

Upload your portfolio from any broker CSV. Add your preferred AI provider key (OpenAI, Anthropic, Gemini, Groq, or fully local Ollama). Then:

🏦 **Morning Portfolio Briefings** — Every weekday, AI agents automatically analyze all your holdings and deliver a dashboard with a health score (1–10), action items per position, risk alerts, and sector exposure.

🔍 **Deep Multi-Agent Analysis** — Trigger a full analysis on any stock or crypto ticker. Five specialist agents (fundamentals, sentiment, news, technical) produce independent reports. A bull and bear researcher debate both sides. A trader delivers a final verdict with entry price, stop-loss, and price target.

📅 **Watchlist Scheduling** — Add tickers with a cron schedule. Agents run automatically, whether or not the browser is open.

📊 **Outcome Tracking** — See how past AI verdicts actually held up. Prices are automatically fetched at +7/+14/+30/+90 days after each analysis.

Works with OpenAI, Anthropic (Claude), Google Gemini, Groq, DeepSeek, Ollama (fully local), and more. One-command Docker install on Windows, macOS, and Linux. Free. Open source. MIT license.

**Maker comment (post this immediately after launch goes live):**

Hey Product Hunt! 👋 I'm Saket, the maker of AgentFloor.

I built this because I was frustrated with the gap between what institutional investors have (teams of analysts, automated briefings, systematic outcome tracking) and what's available to the rest of us (paid subscriptions to black-box algorithms).

AgentFloor wraps TradingAgents — an open-source multi-agent LLM framework — in a web app anyone can install with one Docker command. Your API keys stay on your machine, your portfolio data stays on your machine, and the AI does the research work.

Happy to answer questions about the architecture, how the multi-agent pipeline works, or how to get started with a local Ollama setup.

**Media to upload:**
- Hero: demo GIF
- Screenshots: portfolio.png, briefing.png, analysis.png (from docs/screenshots/)
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/product-hunt.md
git commit -m "docs: add Product Hunt launch copy draft"
```

---

### Task 12: Draft Twitter/X thread

**Files:**
- Create: `docs/launch/twitter-thread.md`

- [ ] **Step 1: Write thread**

Create `docs/launch/twitter-thread.md`:

```markdown
# Twitter/X Launch Thread — Draft

Post same day as or day after Product Hunt. Tag @TauricResearch.
Use hashtags: #buildinpublic #AI #investing #OpenSource

---

**Tweet 1 (with demo GIF attached):**
I spent the past few months building AgentFloor — a self-hosted web UI that wraps @TauricResearch's TradingAgents in a full portfolio research dashboard.

One Docker command. Windows, macOS, Linux.

Here's what it looks like 👇 🧵

**Tweet 2:**
The idea: hedge funds have entire research teams. Why shouldn't you?

Upload your portfolio → get a multi-agent AI briefing every weekday morning → run deep analysis on any ticker → track how the AI's calls aged over 90 days.

**Tweet 3:**
The core analysis loop — 5 specialist AI agents work independently:

• Fundamentals analyst
• Sentiment analyst
• News analyst
• Technical analyst

Then a bull + bear researcher debate both sides. A trader agent delivers the final verdict with entry, stop-loss, and price target.

**Tweet 4:**
Stack:
• FastAPI + async SQLAlchemy 2 + PostgreSQL
• Next.js 14 App Router + TanStack Query v5
• APScheduler for cron watchlist jobs
• WebSocket real-time agent feed

Works with OpenAI, Anthropic, Gemini, Groq, Ollama (fully local), + more.

**Tweet 5:**
The part I found most interesting to build: the streaming pipeline.

TradingAgents is sync Python. I run it in asyncio.to_thread with a SyncQueue → AsyncQueue bridge that simultaneously:
• Persists AgentEvent rows to Postgres
• Broadcasts over WebSocket in real time

**Tweet 6:**
Free. MIT license. Open source.

GitHub: https://github.com/saketnayak/trading-command-center

If this is useful, a ⭐ helps others find it. Happy to answer questions 👇
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/twitter-thread.md
git commit -m "docs: add Twitter/X launch thread draft"
```

---

## Phase 4 — Community Seeding

### Task 13: Open good-first-issues on GitHub

**Context:** These signals that the project is active, welcoming to contributors, and have clear scope. Open them after the launch burst begins so arriving visitors see a live, engaged project.

- [ ] **Step 1: Open issue 1 — Fidelity CSV import support**

```bash
gh issue create \
  --title "feat: support Fidelity brokerage CSV format for portfolio import" \
  --label "good first issue,enhancement" \
  --body "$(cat <<'EOF'
## Context

The current CSV parser in `backend/app/portfolio.py` handles a generic column layout. Fidelity's export format uses different column headers (`Symbol`, `Quantity`, `Cost Basis Per Share`, etc.) and requires normalization before import.

## Acceptance criteria

- Uploading a Fidelity positions CSV correctly populates ticker, shares, and average cost
- Existing CSV formats continue to work (no regression)
- A test in `backend/tests/` covers the Fidelity column mapping

## How to find the relevant code

`backend/app/portfolio.py` — look for the CSV parsing logic near the `upload_snapshot` endpoint.

## Suggested approach

Detect the CSV format by checking for Fidelity-specific headers in the first row, then normalize column names before the existing parsing logic runs.
EOF
)"
```

- [ ] **Step 2: Open issue 2 — Show LLM model in run history table**

```bash
gh issue create \
  --title "feat: display LLM provider and model in run history table" \
  --label "good first issue,enhancement" \
  --body "$(cat <<'EOF'
## Context

The `Run` model stores `llm_provider` and `llm_model` fields, but the run history table at `/runs` doesn't currently display them. Users who experiment with different models can't easily compare results at a glance.

## Acceptance criteria

- The run history table (`/runs`) shows the provider + model used for each run (e.g., "openai / gpt-4o")
- Display is compact — should not break the existing table layout on smaller screens
- No backend changes needed; data is already returned by `GET /runs`

## How to find the relevant code

`frontend/components/runs/RunTable.tsx` — add a column using the existing `llm_provider` and `llm_model` fields already present in the API response shape defined in `frontend/lib/api.ts`.
EOF
)"
```

- [ ] **Step 3: Open issue 3 — Dark mode**

```bash
gh issue create \
  --title "feat: add dark mode toggle to Settings" \
  --label "good first issue,enhancement" \
  --body "$(cat <<'EOF'
## Context

AgentFloor uses Tailwind CSS but currently has no dark mode. Adding a toggle in Settings with `localStorage` persistence is a self-contained frontend task.

## Acceptance criteria

- A dark/light mode toggle appears in the Settings page
- Preference is persisted in `localStorage` and applied on page load
- All existing pages render legibly in dark mode (no white-on-white or black-on-black text)

## How to find the relevant code

- `frontend/app/providers.tsx` — add a ThemeProvider or use `next-themes` (already a common pattern with Tailwind)
- `frontend/app/settings/page.tsx` — add the toggle UI
- `tailwind.config.js` — verify `darkMode: 'class'` is set (add it if not)
EOF
)"
```

- [ ] **Step 4: Open issue 4 — Email notification on watchlist run completion**

```bash
gh issue create \
  --title "feat: send email notification when a scheduled watchlist run completes" \
  --label "good first issue,enhancement" \
  --body "$(cat <<'EOF'
## Context

The backend already has full SMTP config (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` in `backend/app/config.py`). Scheduled watchlist runs complete silently — there's no notification.

## Acceptance criteria

- When a scheduled watchlist run completes (status `completed` or `failed`), an email is sent to the run's owner
- Email includes the ticker, verdict (BUY/SELL/HOLD), and a link to the full report
- Email is only sent if SMTP is configured; if not configured, the run completes normally without error
- A per-user opt-out preference in Settings suppresses emails when disabled

## How to find the relevant code

- `backend/app/services/job_manager.py` — `execute_run()` is where run completion is handled
- `backend/app/config.py` — SMTP settings are already defined here
EOF
)"
```

- [ ] **Step 5: Open issue 5 — Integration tests for the watchlist scheduler**

```bash
gh issue create \
  --title "test: add integration tests for watchlist scheduler job lifecycle" \
  --label "good first issue,tests" \
  --body "$(cat <<'EOF'
## Context

The scheduler service (`backend/app/services/scheduler.py`) has no test coverage. It manages APScheduler jobs that fire watchlist runs automatically. This is a great area to add integration tests.

## Acceptance criteria

Tests in `backend/tests/test_scheduler.py` covering:
- Adding a watchlist item with a cron expression registers a job in the scheduler
- Disabling the item removes the job
- Deleting the item removes the job
- `reload_jobs()` called after mutation reflects the updated state

## How to find the relevant code

- `backend/app/services/scheduler.py` — the scheduler wrapper
- `backend/app/watchlist.py` — router that calls `reload_jobs()` after mutations
- `backend/tests/conftest.py` — shared fixtures including the test DB session
EOF
)"
```

- [ ] **Step 6: Verify issues were created**

```bash
gh issue list --label "good first issue"
```

Expected: 5 issues listed with "good first issue" label.

---

### Task 14: Pin repo and set profile README (human action — do this during Phase 1)

- [ ] **Step 1: Pin the repo on your GitHub profile**

1. Go to https://github.com/saketnayak
2. Click "Customize your pins"
3. Add `trading-command-center` to your pinned repos
4. Save

- [ ] **Step 2: (Optional) Add a note in your profile README**

If you have a `saketnayak/saketnayak` profile README repo, add AgentFloor to your "Projects" section with a one-liner and the star badge.

---

## Post-Launch Weekly Checklist

Run this every week after Phase 3 is complete:

- [ ] Ship one visible improvement and push to `main`
- [ ] Post a brief "what's new" update on Twitter/X
- [ ] Post the update in the most relevant subreddit for that week's change
- [ ] Respond to any new GitHub Discussions or issues opened since last week

## Monthly Checklist

- [ ] Write one technical or educational post (dev.to or a GitHub Discussion pinned post)
  - Suggested topics: "How the multi-agent bull/bear debate works," "Building outcome tracking with Finnhub," "Running AgentFloor with Ollama locally," "How I built the streaming pipeline"
- [ ] Review and close/respond to all open issues and discussions
- [ ] Check if TradingAgents upstream PR was merged; if not, follow up politely
