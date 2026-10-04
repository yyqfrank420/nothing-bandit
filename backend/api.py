"""FastAPI simulation controls, results, and shock history.

Local development: uvicorn api:app --port 8000.
"""

import random
import sys
import os

# Add the backend/ directory to sys.path so that imports like `from bandit import ...`
# resolve correctly regardless of which directory uvicorn is launched from.
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from channels import CHANNELS
from database import (
    clear_shocks,
    get_shocks,
    get_all_bandit_states,
    get_all_results,
    get_current_day,
    get_triggered_shock_names,
    insert_shock,
    reset_simulation,
    setup_database,
)
from shocks import SHOCK_EVENTS
from simulator import run_full_simulation

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------

app = FastAPI(title="Nothing Bandit API", version="1.0.0")

# Allow requests from local Vite dev server and any Vercel deployment.
# ["*"] is intentional here; this is a public demo prototype with no auth.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")  # noqa: deprecated in FastAPI 0.93+, still works fine for prototypes
def startup() -> None:
    """Initialise DB schema and seed channels on every server start."""
    setup_database(CHANNELS)


@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    """
    Set Cache-Control on all API responses.

    Strategy:
      GET /health       → public, max-age=30  (stable liveness probe, safe to cache at CDN)
      All other routes  → no-store            (simulation data mutates on every POST /simulate)

    On Vercel the CDN will respect 'Vercel-CDN-Cache-Control' over the standard header,
    but 'Cache-Control: no-store' on dynamic routes is always the safe default.
    """
    response = await call_next(request)
    if request.url.path == "/health" and request.method == "GET":
        response.headers["Cache-Control"] = "public, max-age=30"
    else:
        response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------

class SimulateSettings(BaseModel):
    """Optional per-session overrides for simulation hyperparameters.
    All fields fall back to channels.py / simulator.py defaults if omitted."""
    daily_budget:  Optional[float] = None
    noise_sigma:   Optional[float] = None
    reward_ctr:    Optional[float] = None
    reward_roas:   Optional[float] = None
    reward_cac:    Optional[float] = None
    decay_factor:  Optional[float] = None   # Bayesian forgetting rate (0-1); default 0.95

class SimulateRequest(BaseModel):
    n_days:   int
    settings: Optional[SimulateSettings] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Liveness check; returns immediately without touching the DB."""
    return {"status": "ok"}


@app.post("/simulate")
def simulate(body: SimulateRequest):
    """
    Run n_days of simulation for all 3 objectives in one call.

    Returns the new rows AND updated bandit states directly, so the frontend
    can merge them into existing state without making a separate GET /results
    round-trip. This halves the per-click latency.
    """
    if body.n_days < 1 or body.n_days > 365:
        raise HTTPException(status_code=400, detail="n_days must be between 1 and 365")

    # Build reward_thresholds dict only if any threshold was overridden.
    s = body.settings
    reward_thresholds_override = None
    if s and any(v is not None for v in [s.reward_ctr, s.reward_roas, s.reward_cac]):
        from channels import REWARD_THRESHOLDS
        reward_thresholds_override = {
            "ctr":  s.reward_ctr  if s.reward_ctr  is not None else REWARD_THRESHOLDS["ctr"],
            "roas": s.reward_roas if s.reward_roas is not None else REWARD_THRESHOLDS["roas"],
            "cac":  s.reward_cac  if s.reward_cac  is not None else REWARD_THRESHOLDS["cac"],
        }

    result = run_full_simulation(
        body.n_days,
        daily_budget      = s.daily_budget  if s else None,
        noise_sigma       = s.noise_sigma   if s else None,
        reward_thresholds = reward_thresholds_override,
        decay_factor      = s.decay_factor  if s else None,
    )

    # current_day and bandit_states come from run_full_simulation's in-memory
    # state; no extra DB round-trips needed after the simulation completes.
    return {
        "status":        "ok",
        "days_run":      body.n_days,
        "current_day":   result["current_day"],
        "new_rows":      result["rows"],
        "bandit_states": result["bandit_states"],
    }


@app.get("/results")
def results():
    """
    Return all daily_results rows. The frontend uses these to render every chart.
    Ordered by (day, objective, allocator, channel_id) for predictable parsing.
    """
    return get_all_results()


@app.get("/bandit-states")
def bandit_states():
    """Return all bandit_state rows (alpha + beta per channel per objective)."""
    return get_all_bandit_states()


def _enrich_shock(shock: dict, current_day: int) -> dict:
    channel_names = {channel["id"]: channel["name"] for channel in CHANNELS}
    # Refresh catalog copy only when it still describes the stored parameters.
    description = next(
        (
            event["description"] for event in SHOCK_EVENTS
            if event["name"] == shock["name"]
            and set(event["affected_channel_ids"]) == set(shock["affected_channel_ids"])
            and event["multipliers"] == shock["multipliers"]
        ),
        shock["description"],
    )
    return {
        **shock,
        "description": description,
        "affected_channel_names": [
            channel_names.get(channel_id, str(channel_id))
            for channel_id in shock["affected_channel_ids"]
        ],
        "start_day": shock["triggered_on_day"] + 1,
        # Aging includes expired rows, so this reconstructs the original inclusive end.
        "end_day": current_day + shock["days_remaining"],
    }


@app.post("/shock")
def shock():
    """
    Randomly select one untriggered shock event and persist it to active_shocks.

    No-repeat rule: each named event can only fire once per session. Already-triggered
    events (including expired ones) are excluded from the pool. This prevents the same
    shock from appearing twice within the session.

    Returns 409 when all events have been used; the frontend should disable the button.
    """
    triggered = get_triggered_shock_names()  # names of every shock ever fired this session
    available = [e for e in SHOCK_EVENTS if e["name"] not in triggered]

    if not available:
        raise HTTPException(
            status_code=409,
            detail={
                "code":    "SHOCKS_EXHAUSTED",
                "message": f"All {len(SHOCK_EVENTS)} shock events have been triggered this session. Reset to replay.",
            },
        )

    event = random.choice(available)
    min_days, max_days = event["duration_range"]
    duration = random.randint(min_days, max_days)
    current_day = get_current_day()

    shock_id = insert_shock(
        name=event["name"],
        description=event["description"],
        affected_channel_ids=event["affected_channel_ids"],
        multipliers=event["multipliers"],
        duration=duration,
        triggered_on_day=current_day,
    )

    enriched = _enrich_shock({
        "name": event["name"],
        "description": event["description"],
        "affected_channel_ids": event["affected_channel_ids"],
        "multipliers": event["multipliers"],
        "triggered_on_day": current_day,
        "days_remaining": duration,
    }, current_day)

    return {
        "id":                  shock_id,
        "name":                event["name"],
        "description":         event["description"],
        "affected_channels":   enriched["affected_channel_names"],
        "multipliers":         event["multipliers"],
        "duration_days":       duration,
        "triggered_on_day":    current_day,
        "start_day":           enriched["start_day"],
        "end_day":             enriched["end_day"],
    }


@app.get("/active-shocks")
def active_shocks():
    """
    Return all currently active shock rows.
    Used on page reload to restore shock banner state.
    """
    current_day = get_current_day()
    return [_enrich_shock(shock, current_day) for shock in get_shocks()]


@app.get("/state")
def state():
    """Return results, bandit states, and complete shock history for initial load."""
    current_day = get_current_day()
    shocks = [_enrich_shock(shock, current_day) for shock in get_shocks(active_only=False)]
    return {
        "results":       get_all_results(),
        "bandit_states": get_all_bandit_states(),
        "shock_events":  shocks,
        "active_shocks": [shock for shock in shocks if shock["days_remaining"] > 0],
        "current_day":   current_day,
    }


@app.post("/reset")
def reset():
    """
    Wipe all simulation data and reset bandit state to Beta(1,1) priors.
    Also clears all active shock events.
    """
    reset_simulation(CHANNELS)
    clear_shocks()
    return {"status": "ok", "message": "Simulation reset to day 0"}
