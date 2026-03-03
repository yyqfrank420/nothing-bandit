"""
File: simulator.py
Language: Python
Purpose: Day-by-day simulation runner for both the bandit and static allocators.
Connects to: bandit.py    (sample_allocations — reads bandit state)
             channels.py  (CHANNELS, STATIC_WEIGHTS, DAILY_BUDGET, NOISE_SIGMA)
             database.py  (insert_daily_results_batch, batch_set_bandit_states,
                           get_active_shocks, decrement_shock_durations, get_current_day)
Inputs:  n_days (int), objective string
Outputs: Inserts rows + updates bandit state; returns new row dicts

Latency optimisations:
  - active shocks read ONCE per call (not per day)
  - bandit states for all 3 objectives loaded in ONE query (get_bandit_states_all)
  - all result rows batch-inserted in ONE connection
  - bandit states written ONCE as absolute values (batch_set_bandit_states)
  - shock aging done in ONE query (decrement_shock_durations_by(n))
  - net: simulate(n) opens 6 DB connections flat, regardless of n

Bayesian forgetting:
  - Alpha/beta are multiplied by DECAY_FACTOR each day before the next sample.
  - This gives accumulated evidence a ~14-day half-life, so shock-era failures
    fade after the shock window ends and the bandit recovers toward optimal
    channels. Without decay, Beta posteriors accumulate β forever — post-shock
    under-allocation persists indefinitely (the "diseconomies of scale" problem).
  - Because decay modifies the base state per day, we cannot reconstruct final
    values from incremental deltas. We write absolute α/β at the end instead.
"""

import numpy as np

from bandit import sample_allocations
from channels import CHANNELS, DAILY_BUDGET, NOISE_SIGMA, REWARD_THRESHOLDS, STATIC_WEIGHTS
from database import (
    batch_set_bandit_states,
    decrement_shock_durations_by,
    get_active_shocks,
    get_bandit_states_all,
    get_current_day,
    insert_daily_results_batch,
)

# Bayesian forgetting: multiply accumulated α and β by this factor each day.
# γ=0.95 → half-life ≈ 14 days. Post-shock, bad β counts fade in ~2-3 weeks
# and the bandit re-allocates toward good channels.
# Long-run equilibrium: α_∞ = win_rate / (1 - γ), β_∞ → DECAY_FLOOR.
DEFAULT_DECAY_FACTOR = 0.95

# Floor prevents α or β from decaying to zero (Beta(0, x) is undefined).
# At floor=1.0, a fully-forgotten channel reverts to Beta(1,1) = uniform = max uncertainty.
DECAY_FLOOR = 1.0


def _build_shock_multipliers(active_shocks: list, day_offset: int = 0) -> dict:
    """
    Convert active shock dicts into a nested multiplier map:
    {channel_id: {metric: combined_factor}}.

    day_offset: how many days into the current batch run this is (0-indexed).
    A shock with days_remaining=5 applies only for day_offsets 0..4, then
    expires. This ensures multi-day batch runs (+7 Days, +1 Month) don't
    apply shocks beyond their actual duration window.

    Multiple shocks on the same channel compound multiplicatively.
    """
    result: dict = {}
    for shock in active_shocks:
        # Skip shocks that would have already expired by this day in the run.
        if shock["days_remaining"] <= day_offset:
            continue
        for channel_id in shock["affected_channel_ids"]:
            if channel_id not in result:
                result[channel_id] = {}
            for metric, factor in shock["multipliers"].items():
                result[channel_id][metric] = result[channel_id].get(metric, 1.0) * factor
    return result


def _draw_rates(channel: dict, shock_multipliers: dict, noise_sigma: float) -> tuple:
    """
    Draw one set of noisy rate observations (CTR, ROAS, CAC) for a channel.
    Budget-independent — rates represent market conditions for this day only.

    Called ONCE per channel per day. Both allocators share the same draw so
    the bandit vs static comparison reflects only allocation strategy, not
    noise sampling variance. Without this, independent draws compound with
    allocation variance and produce large spurious day-1 gaps.
    """
    ch_id = channel["id"]
    mults = shock_multipliers.get(ch_id, {})

    true_ctr  = channel["true_ctr"]  * mults.get("ctr",  1.0)
    true_roas = channel["true_roas"] * mults.get("roas", 1.0)
    true_cac  = channel["true_cac"]  * mults.get("cac",  1.0)

    observed_ctr = float(np.clip(
        np.random.normal(true_ctr,  true_ctr  * noise_sigma), 0.0,  1.0
    ))
    observed_roas = float(np.clip(
        np.random.normal(true_roas, true_roas * noise_sigma), 0.01, np.inf
    ))
    observed_cac = float(np.clip(
        np.random.normal(true_cac,  true_cac  * noise_sigma), 1.0,  np.inf
    ))

    return observed_ctr, observed_roas, observed_cac


def _scale_to_budget(budget: float, ctr: float, roas: float, cac: float) -> dict:
    """
    Compute volume metrics (revenue, conversions, impressions, clicks)
    from rate observations and a specific budget. Rates are fixed; volumes
    scale linearly with budget. Used by both allocators from the same rates.
    """
    impressions = round(budget * 200)
    clicks      = round(impressions * ctr)
    revenue     = budget * roas
    conversions = max(1, round(budget / cac))

    return {
        "observed_ctr":  ctr,
        "observed_roas": roas,
        "observed_cac":  cac,
        "impressions":   impressions,
        "clicks":        clicks,
        "revenue":       revenue,
        "conversions":   conversions,
    }


def _reward(objective: str, observed_ctr: float, observed_roas: float, observed_cac: float,
            reward_thresholds: dict) -> float:
    """
    Binarise observed metric against threshold.
    Returns 1.0 (success) or 0.0 (failure) — mirrors bandit.update_from_results logic
    without the DB call so we can batch the update separately.
    Uses caller-supplied thresholds so settings overrides apply per-session.
    """
    if objective == "ctr":
        return 1.0 if observed_ctr  >= reward_thresholds["ctr"]  else 0.0
    if objective == "roas":
        return 1.0 if observed_roas >= reward_thresholds["roas"] else 0.0
    if objective == "cac":
        return 1.0 if observed_cac  <= reward_thresholds["cac"]  else 0.0
    raise ValueError(f"Unknown objective '{objective}'")


def simulate_day(
    day: int,
    objective: str,
    channels: list,
    total_budget: float,
    shock_multipliers: dict,
    noise_sigma: float,
    reward_thresholds: dict,
    states: dict | None = None,
    force_static: bool = False,
) -> tuple:
    """
    Simulate one day for both bandit and static allocators.

    force_static: when True the bandit uses static weights instead of Thompson
    Sampling.  Used only on absolute day 1 so both allocators begin from an
    identical baseline — the chart then shows a clean zero-gap start that
    diverges as the bandit accumulates learning.  Rewards are still recorded
    so day 1 feeds into the day-2 prior.

    Returns:
        (rows, bandit_updates)
        rows:           list of row dicts ready for insert_daily_results_batch
        bandit_updates: list of (channel_id, objective, alpha_delta, beta_delta)
                        — applied in-memory by run_full_simulation; not written to DB directly
    """
    channel_ids = [ch["id"] for ch in channels]

    rows: list = []
    bandit_updates: list = []

    # Draw market conditions once per channel — both allocators see the same
    # CTR / ROAS / CAC for each channel this day. Only budget allocation differs.
    channel_rates = {
        ch["id"]: _draw_rates(ch, shock_multipliers, noise_sigma)
        for ch in channels
    }

    # ------------------------------------------------------------------
    # 1. Bandit allocator
    # ------------------------------------------------------------------
    if force_static:
        # Day 1 of a fresh simulation: mirror static weights exactly so the
        # comparison chart starts at zero gap.  Thompson Sampling kicks in
        # from day 2 once the bandit has at least one day of signal.
        bandit_budgets = {ch_id: STATIC_WEIGHTS[ch_id] * total_budget for ch_id in channel_ids}
    else:
        bandit_budgets = sample_allocations(objective, channel_ids, total_budget, states)

    for ch_id, budget in bandit_budgets.items():
        ctr, roas, cac = channel_rates[ch_id]
        metrics = _scale_to_budget(budget, ctr, roas, cac)
        rows.append({
            "day": day, "channel_id": ch_id, "objective": objective,
            "allocator": "bandit", "budget_allocated": budget, **metrics,
        })

        r = _reward(objective, ctr, roas, cac, reward_thresholds)
        bandit_updates.append((ch_id, objective, r, 1.0 - r))

    # ------------------------------------------------------------------
    # 2. Static allocator — fixed weights, no feedback
    # ------------------------------------------------------------------
    for ch_id, weight in STATIC_WEIGHTS.items():
        budget = weight * total_budget
        ctr, roas, cac = channel_rates[ch_id]
        metrics = _scale_to_budget(budget, ctr, roas, cac)
        rows.append({
            "day": day, "channel_id": ch_id, "objective": objective,
            "allocator": "static", "budget_allocated": budget, **metrics,
        })

    return rows, bandit_updates


def run_full_simulation(
    n_days: int,
    daily_budget: float | None = None,
    noise_sigma: float | None = None,
    reward_thresholds: dict | None = None,
    decay_factor: float | None = None,
) -> dict:
    """
    Run all three objectives (CTR, ROAS, CAC) for n_days.

    Optional overrides let the frontend settings panel tune params per-session
    without restarting the server. Falls back to module defaults if omitted.

    Optimised DB access:
      - active_shocks read ONCE upfront (not once per day per objective)
      - bandit states written ONCE as absolute values (batch_set_bandit_states)
      - all result rows batch-inserted ONCE per call

    Bayesian forgetting (decay_factor):
      - After each day's reward update, α and β are multiplied by decay_factor.
      - Default 0.95 → ~14-day half-life. Shock-era β fades post-shock,
        allowing the bandit to re-converge to the best channel.
      - Final state is written as absolute values because decay changes the
        base — incremental deltas would produce incorrect results.

    Returns a dict with:
      rows          — list of new row dicts (same as previous return value)
      current_day   — final simulated day number (computed in-memory, no extra DB call)
      bandit_states — list of {channel_id, objective, alpha, beta} dicts for the frontend
    """
    budget     = daily_budget     if daily_budget     is not None else DAILY_BUDGET
    sigma      = noise_sigma      if noise_sigma      is not None else NOISE_SIGMA
    thresholds = reward_thresholds if reward_thresholds is not None else REWARD_THRESHOLDS
    decay      = decay_factor     if decay_factor     is not None else DEFAULT_DECAY_FACTOR

    start_day = get_current_day() + 1

    # Read shocks once — avoids one DB round-trip per day.
    # Per-day multipliers are rebuilt from this list using day_offset so shocks
    # expire correctly mid-run (e.g. a 5-day shock on a 30-day batch run only
    # applies to the first 5 days, not all 30).
    active_shocks = get_active_shocks()

    # Load bandit states for ALL objectives in ONE DB round-trip.
    # Within the day loop we apply reward + decay in-memory so each day's
    # allocation reflects what the bandit learned from prior days in this batch.
    live_states = get_bandit_states_all()

    all_rows: list = []

    for objective in ("ctr", "roas", "cac"):
        for day_offset in range(n_days):
            day = start_day + day_offset
            shock_multipliers = _build_shock_multipliers(active_shocks, day_offset)
            # On the very first day of a fresh simulation both allocators must
            # use the same weights so the comparison chart starts at zero gap.
            is_day_one = (start_day == 1 and day_offset == 0)
            rows, updates = simulate_day(
                day, objective, CHANNELS, budget,
                shock_multipliers, sigma, thresholds,
                states=live_states[objective],
                force_static=is_day_one,
            )
            all_rows.extend(rows)

            # Propagate this day's reward signal into the in-memory state.
            for ch_id, obj, alpha_d, beta_d in updates:
                live_states[obj][ch_id]["alpha"] += alpha_d
                live_states[obj][ch_id]["beta"]  += beta_d

            # Bayesian forgetting: discount accumulated evidence so shock-era
            # β counts fade after the shock ends, enabling post-shock recovery.
            # Applied after reward so today's signal has full weight; only
            # older evidence fades. Floor prevents Beta(~0, x) which is undefined.
            for ch_id in live_states[objective]:
                live_states[objective][ch_id]["alpha"] = max(
                    DECAY_FLOOR, live_states[objective][ch_id]["alpha"] * decay
                )
                live_states[objective][ch_id]["beta"] = max(
                    DECAY_FLOOR, live_states[objective][ch_id]["beta"] * decay
                )

    # One insert transaction for all rows across all objectives.
    insert_daily_results_batch(all_rows)

    # Write final absolute α/β for all channels + objectives.
    # Must use SET (not incremental ADD) because decay modifies the base state
    # each day — summing raw deltas onto the initial DB values would ignore decay.
    batch_set_bandit_states(live_states)

    # Age shocks — one DB write for the whole batch instead of n_days writes.
    decrement_shock_durations_by(n_days)

    # Flatten live_states to a list so the simulate endpoint can return it
    # without an extra get_all_bandit_states() DB call.
    bandit_states_list = [
        {"channel_id": ch_id, "objective": obj, "alpha": data["alpha"], "beta": data["beta"]}
        for obj, channels in live_states.items()
        for ch_id, data in channels.items()
    ]

    return {
        "rows":          all_rows,
        "current_day":   start_day + n_days - 1,
        "bandit_states": bandit_states_list,
    }
