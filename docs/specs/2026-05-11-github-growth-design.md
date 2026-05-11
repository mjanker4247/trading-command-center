# AgentFloor GitHub Growth & Adoption Strategy

**Date:** 2026-05-11  
**Status:** Approved  
**Goal:** 500+ GitHub stars and 20–50 real self-hosting users within 3 months  
**Bandwidth:** A few hours per week  
**Target audience:** Both retail investors (non-technical) and developers/researchers equally

---

## Context

AgentFloor (trading-command-center) is a self-hosted web UI wrapping the TradingAgents multi-agent LLM framework. Key strengths:

- One-command Docker install (Windows PowerShell + macOS/Linux bash)
- No data leaves the user's machine; works with local Ollama/vLLM models
- Full-featured: portfolio tracker, live AI briefings, multi-agent stock analysis, watchlist scheduling, outcome tracking
- MIT license, strong README, polished feature set
- **Current state:** 7 days old, 0 stars, no demo media, no prior distribution

The strategy is **upstream leverage first, demo-driven launch second, community building ongoing.**

---

## Section 1 — Pre-launch repo polish

Must be complete before any distribution channel is used.

### Visual assets (highest priority)

Record one 90-second screen walkthrough covering the golden path:

1. Portfolio page — live holdings with prices, P&L, color-coded rows
2. AI morning briefing — health score ring, action items, risk alerts
3. Launch a deep analysis on a ticker — live agent feed streaming in real time
4. Final verdict card — BUY/SELL/HOLD with price target and stop-loss
5. Export → PDF downloading

Cut into:
- **Looping GIF** (30–45 sec, 15fps) for README hero — embed immediately after the tagline, before "Why AgentFloor?"
- **3–4 still screenshots** covering Portfolio, Analysis live feed, and AI Briefing — add to a "See it in action" section in the README
- **Raw video** (keep for YouTube Short and Twitter/X)

### README tweaks

- Insert GIF as the very first content element after the tagline
- Add "See it in action" section with 3–4 screenshots before the feature tables
- Add "Community / Support" section pointing to GitHub Discussions at the bottom

### Repo housekeeping

| Action | Where |
|---|---|
| Enable GitHub Discussions | Repo Settings → Features |
| Add `CONTRIBUTING.md` | Repo root — 3–4 paragraphs: local dev setup, PR guidelines, good first issues pointer |
| Add GitHub topics | `portfolio-tracker`, `self-hosted`, `investment-research`, `multi-agent` (supplement existing topics) |
| Pin repo on GitHub profile | github.com/saketnayak profile page |

---

## Section 2 — Upstream leverage strategy

TradingAgents (TauricResearch) is the primary upstream. AgentFloor is the only full-featured web UI for the framework — a natural "Related Projects / Web UIs" entry in their README. Their audience already wants this tool; they just don't know it exists.

### Step 1 — Contribute first

Before any ask, make one small useful contribution to TauricResearch/TradingAgents: fix a docs typo, close an open issue with a PR, or add a "Web UIs" section stub. This warms the relationship. If they have a community Discord/Slack, join and introduce yourself.

### Step 2 — PR proposing a "Web UIs & Frontends" section

Open a PR or issue on TradingAgents proposing to list AgentFloor. Frame it as user value: "TradingAgents requires Python setup; AgentFloor gives non-technical users a one-command Docker install." Include the demo GIF directly in the PR description.

### Step 3 — Cross-link

AgentFloor already badges TradingAgents. Once listed there, you get ongoing passive discovery from their existing audience.

### Fallback

If no response within 2 weeks: post in their GitHub Discussions and tag a maintainer directly.

### Timing

Run in parallel with demo recording in weeks 1–2. Have the GIF ready before opening the PR.

---

## Section 3 — Multi-channel launch sequence

Execute after Section 1 and 2 are complete. Space posts 2–3 days apart so each gets focused attention for replies.

### Launch order

| Order | Channel | Angle | Notes |
|---|---|---|---|
| 1 | **HN Show HN** | Architecture-focused: multi-agent streaming, WebSocket event feed, outcome tracking, TradingAgents integration | Post weekday 9–10am ET |
| 2 | **r/LocalLLaMA** | "Works with Ollama — no OpenAI key needed, fully local" | Privacy/local-first angle resonates strongly here |
| 3 | **r/SideProject** | Standard showcase: demo GIF, one-liner, link | Broad dev audience |
| 4 | **r/investing + r/stocks** | Non-technical: "free self-hosted AI research tool — no subscription, data stays on your machine" | Lead with GIF; avoid jargon |
| 5 | **Product Hunt** | Full launch: screenshots, feature bullets, maker comment | Respond to every early commenter within 1 hour of launch; launch Tue–Thu |
| 6 | **Twitter/X thread** | Screenshot walkthrough, tag @TauricResearch, use #buildinpublic #AI #investing | Publish same day as or day after Product Hunt |

### Per-post rules

- Never post the same copy twice — each channel gets a tailored writeup
- Reply to every comment in the first 24 hours; engagement signals boost algorithmic visibility
- Do not post r/investing and r/LocalLLaMA on the same day — split your reply energy

---

## Section 4 — Ongoing cadence

After launch week, sustain with a few hours per week:

### Weekly
- Ship one visible improvement (UI polish, new export format, bug fix)
- Post a brief update on Twitter/X and one relevant subreddit ("What's new in AgentFloor this week")

### Monthly
- Respond to all open GitHub Discussions and issues
- Write one technical or educational post (dev.to or GitHub Discussion): e.g., "how the multi-agent bull/bear debate works," "building outcome tracking with Finnhub," "running AgentFloor with Ollama on a Raspberry Pi"
- These drive SEO and earn organic backlinks

### Community
- After the launch burst, open 3–5 "good first issue" tickets
- These signal the project is active and welcoming, even if no one picks them up immediately

---

## Success metrics (3-month targets)

| Metric | Target |
|---|---|
| GitHub stars | 500+ |
| Real self-hosting users (issues/discussions filed) | 20–50 |
| Forks | 15+ |
| Mentioned in TradingAgents README or ecosystem | Yes |
| GitHub Discussions threads opened by non-owner | 5+ |

---

## Timeline

| Week | Focus |
|---|---|
| 1–2 | Demo recording, README visual polish, repo housekeeping, upstream contribution to TradingAgents |
| 3 | Open upstream PR; begin launch sequence (HN → r/LocalLLaMA → r/SideProject) |
| 4 | Continue launch sequence (r/investing → Product Hunt → Twitter/X); open good-first-issues |
| 5+ | Weekly update cadence; monthly technical post; respond to all community activity |
