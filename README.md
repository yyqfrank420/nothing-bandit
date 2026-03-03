# Nothing Bandit™

A marketing budget allocation system that uses **Thompson Sampling** — a type of multi-armed bandit algorithm — to figure out which ad channels to bet on, day by day. Built as a prototype for Nothing (consumer tech).

The core idea: instead of splitting budget equally across all channels (the dumb default), the bandit learns which channels are actually working and shifts spend toward them automatically.

---

## What it does

You start with 6 ad channels and a daily budget. The bandit runs 3 parallel experiments — one optimising for **CTR** (clicks), one for **ROAS** (revenue vs spend), one for **CAC** (cost to acquire a customer). Each day it:

1. Samples from its beliefs about each channel's performance (the Beta distribution)
2. Allocates more budget to channels it's more confident will perform well
3. Observes results and updates its beliefs accordingly

You can watch this happen day-by-day, trigger market shock events, and compare the bandit's performance against a static equal-split baseline.

---

## The 6 channels

| Channel | Strength | Weakness |
|---------|----------|----------|
| Google Search | Best ROAS (4.2×), cheapest CAC ($90) | Lowest raw click rate (1.5%) |
| Tech KOL | High clicks (4.5% CTR) | Moderate conversion, $120 CAC |
| Design KOL | Good ROAS (3.5×) | $145 CAC, niche audience |
| Instagram Ads | Balanced but unremarkable | $175 CAC |
| TikTok Ads | Highest clicks (5.5%) | Worst ROAS (1.5×), $200 CAC |
| Generic KOL | — | Worst across the board ($220 CAC) |

The bandit should converge on Google Search + Tech KOL + Design KOL over time.

---

## Stack

```
backend/     Python 3.11 + FastAPI + SQLite
frontend/    React 18 + D3 v7 + Vite
```

No cloud services, no paid APIs. Runs entirely on your laptop.

---

## How to run it

You need two terminal windows — one for the backend, one for the frontend.

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --reload-dir . --port 8000
```

You should see: `Uvicorn running on http://127.0.0.1:8000`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Using the dashboard

### Simulating time

- **+1 Day** — simulate one day. The day counter glows and charts update.
- **+1 Wk** — simulate 7 days with a slow replay (500ms per day) so you can see the bandit shifting allocation.
- **+1 Mo** — simulate 30 days fast (50ms per day). Good for seeing the long-run result quickly.
- **▶ Auto** — continuous simulation at a configurable speed. The dot in the header pulses while running.

The **timeline slider** at the top lets you rewind and replay history without re-simulating. A **REPLAY** badge appears when you're viewing an earlier point.

### Reading the charts

**Budget Allocation** (top section, per objective): stacked area showing how the bandit re-weights channels over time. The static baseline splits evenly.

**Bandit vs Static** (middle section): cumulative revenue (or running ROAS/CAC) for the bandit vs the static allocator. The gap fills green when the bandit is winning. The Δ label in the corner shows the final percentage advantage.

**Business Outcomes** (full width): KPI cards for revenue, ROAS, and CAC with animated numbers. The toggle switches between CTR / ROAS / CAC objective views. Hover any chart for a crosshair tooltip.

**Bandit Confidence** (bottom): Beta distribution curves per channel per objective. A tall, narrow peak = the bandit is confident. A wide, flat curve = still exploring. Winning channels converge to sharp peaks near 1; losers flatten near 0.

**Channel legend**: hover any channel dot to see a plain-English description of that channel's parameters and what role it plays.

### Shock events

Click **⚡ Shock** to trigger a random market shock (a realistic SEA event like a platform algorithm change, a public holiday, or a viral moment). The shock:

- Applies multipliers to affected channels (e.g. TikTok algorithm update → CTR ×1.4, CAC ×1.3)
- Lasts a fixed number of days
- Shows a notification banner with the affected channels and duration

After a shock, an **Impact Analysis** strip appears between the channel legend and the charts. Each card shows:
- The shock name, active day range, and current status (ACTIVE / EXPIRED)
- The metric multipliers applied
- A D3 bar chart comparing avg daily revenue per affected channel, before vs during the shock
- Budget delta for each channel

Multiple shocks can overlap — each gets its own card. Cards persist until you click **Reset**.

### Settings (⚙)

The settings panel adjusts session-scoped hyperparameters — they reset when you reload the page.

- **Daily Budget** — total ad spend per day across all channels (default: $10,000)
- **Noise σ** — how much random noise to add to observed performance (higher = noisier signals)
- **Reward Thresholds** — what counts as a "win" for the bandit's binary reward signal. These directly shape the Beta posteriors visible in the confidence charts. Raising a threshold makes the bandit harder to impress → flatter curves → more exploration.

---

## Project structure

```
nothing-bandit/
├── backend/
│   ├── api.py          FastAPI app — HTTP endpoints
│   ├── bandit.py       Thompson Sampling (sample + update)
│   ├── channels.py     Channel definitions and true parameters
│   ├── database.py     SQLite — results, bandit states, active shocks
│   ├── simulator.py    Day-by-day simulation loop
│   ├── shocks.py       6 SEA market shock event definitions
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  Root shell, state, layout
│   │   ├── api/client.js            Fetch wrappers for all endpoints
│   │   ├── hooks.js                 useContainerWidth, useAnimatedNumber
│   │   └── components/
│   │       ├── BudgetAllocationChart.jsx
│   │       ├── BanditVsStaticChart.jsx
│   │       ├── BanditConfidenceChart.jsx
│   │       ├── BusinessMetricsChart.jsx
│   │       ├── ShockImpactPanel.jsx
│   │       └── SettingsPanel.jsx
│   ├── index.html
│   └── vite.config.js   Proxies /api → localhost:8000
├── api/
│   └── index.py        Vercel serverless entrypoint
└── vercel.json         Deployment config (SPA rewrites + cache headers)
```

---

## How Thompson Sampling works (plain English)

Imagine you have 6 slot machines. You don't know the payout rate of any of them. You want to find the best one as fast as possible, but you also need to keep pulling to make money.

Thompson Sampling solves this by maintaining a **belief** about each machine — specifically, a Beta(α, β) probability distribution. α counts wins, β counts losses. Each day:

1. **Sample**: randomly draw one value from each machine's belief distribution
2. **Act**: allocate budget proportional to the sampled values (higher sample → more budget)
3. **Observe**: did each channel meet the reward threshold? Increment α (win) or β (loss)
4. **Update**: the distributions narrow around the true value over time

This naturally balances exploration (uncertain channels get sampled high sometimes) and exploitation (clearly good channels consistently win the sample lottery).

The result: the bandit figures out that Google Search is the efficiency winner and shifts most budget there, while keeping a small exploratory allocation to other channels — without anyone telling it the true parameters.

---

## Potential deployment (not currently set up)

The app is wired for Vercel. See `api/index.py` for the pre-deployment checklist — the main blocker is that SQLite doesn't work on serverless (ephemeral filesystem). You'd need to swap in Turso, Supabase, or Vercel Postgres before deploying.
