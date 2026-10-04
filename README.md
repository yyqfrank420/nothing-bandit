# Nothing Bandit™

A Nothing-themed marketing simulation that compares Thompson Sampling with a fixed weighted budget strategy across six channels.

Live app: [multi-armed-bandit.frankyang.studio](https://multi-armed-bandit.frankyang.studio). Hosted on Vercel.

## Simulation

The campaign runs for up to 183 days with a default daily budget of $5,000. The channels are Tech KOL, Design KOL, Generic KOL, Instagram Ads, TikTok Ads, and Google Search.

CTR, ROAS, and CAC each use a separate bandit. Both strategies start with the same weighted mix on day one. On subsequent days, the bandit samples a success rate for each channel and splits the budget in proportion to those samples. A channel receives a success update when its observed metric meets the objective's reward threshold. The forgetting setting discounts accumulated evidence.

The fixed strategy allocates 30% to Google Search, 25% to TikTok Ads, 20% to Instagram Ads, 15% to Tech KOL, 7% to Design KOL, and 3% to Generic KOL.

Channel rates, daily variation, shocks, and campaign outcomes are simulated. The app does not place ads or use live campaign data. Results depend on the objective, settings, noise, and shocks; either strategy can perform better.

## Dashboard

- **Read tutorial** opens the guide and dashboard tour. **+1 Day (skip tutorial)** runs one day and opens the dashboard.
- **+1 Day**, **+1 Week**, and **+1 Month** advance the campaign. **Auto** runs until paused or the campaign ends. Settings controls its speed.
- The timeline shows earlier results without running the simulation again.
- **Shock** adds one of ten preset market events. Events temporarily change selected channel rates and may overlap. Each preset can occur once until Reset.
- Settings controls the daily budget, noise, reward thresholds, and forgetting. Settings return to their defaults on page reload.

### Charts

**Budget allocation** shows each channel's share of bandit spend. Red lines mark the first affected day of a shock.

**Bandit vs static** compares running budget-weighted CTR, running ROAS, or running CAC for the selected objective. Higher CTR and ROAS are better; lower CAC is better. The CAC axis is inverted. The percentage label shows the bandit's relative improvement over static after at least five days.

**Business outcomes** shows revenue, conversions, running CAC, and running ROAS. Objective tabs select one strategy objective or the average across all three.

**Bandit confidence** shows Beta distributions for the probability of meeting a reward threshold. These curves describe threshold success, rather than the metric value itself.

**Shock impact** compares affected channels before and during an event. The channel legend identifies the chart colors and explains the simulation's baseline assumptions.

## Run locally

Use Python 3.11 or later and Node.js with npm. Start the backend and frontend in separate terminals.

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn api:app --reload --reload-dir . --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite proxies `/api` requests to the backend on port 8000.

## Storage and deployment

The backend selects PostgreSQL when one of these environment variables is set, in this order:

1. `POSTGRES_URL_NON_POOLING`
2. `POSTGRES_URL`
3. `DATABASE_URL`

Without a connection URL, it uses SQLite at `backend/bandit.db`. Campaign data is stored in the selected database. PostgreSQL access uses the `psycopg2-binary` dependency.

Vercel builds the React app into `frontend/dist`. Requests under `/api` reach the FastAPI application through `api/index.py`; other routes serve the frontend. The deployment configuration is in `vercel.json`.

## Source

- `backend/`: FastAPI endpoints, simulation, bandit updates, channel assumptions, shocks, and database operations.
- `frontend/src/`: React dashboard, onboarding, settings, and D3 charts.
- `api/index.py`: Vercel Python entry point.
