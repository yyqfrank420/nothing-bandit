"""Thompson Sampling allocation and binary reward updates.

Each channel has a Beta posterior over its binary reward probability.
Allocation is proportional to one posterior sample per channel.
Threshold success increments alpha; failure increments beta.
"""

import numpy as np

from channels import REWARD_THRESHOLDS
from database import get_bandit_states, update_bandit_state


def sample_allocations(
    objective: str,
    channel_ids: list,
    total_budget: float,
    states: dict | None = None,
) -> dict:
    """
    Thompson Sampling allocation step.

    For each channel, draw θ_i ~ Beta(α_i, β_i). Allocate budget proportional
    to these samples.

    Args:
        objective:    'ctr' | 'roas' | 'cac'
        channel_ids:  list of integer channel IDs
        total_budget: total USD to allocate across all channels
        states:       optional pre-loaded {channel_id: {alpha, beta}} dict.
                      If None, states are read from DB (single-day path).
                      Pass in-memory states for multi-day batch runs so the
                      bandit's learning accumulates across days without a DB
                      round-trip per day.

    Returns:
        {channel_id: budget_allocated_float}
    """
    if states is None:
        states = get_bandit_states(objective)

    # Draw one sample per channel from its Beta posterior.
    # np.random.beta(a, b) samples from Beta(a, b); values in [0, 1].
    thetas = {
        cid: float(np.random.beta(states[cid]["alpha"], states[cid]["beta"]))
        for cid in channel_ids
    }

    total_theta = sum(thetas.values())

    # Avoid dividing by a near-zero sum of samples.
    if total_theta < 1e-9:
        equal_share = total_budget / len(channel_ids)
        return {cid: equal_share for cid in channel_ids}

    # Proportional allocation: theta share × total budget.
    return {
        cid: (theta / total_theta) * total_budget
        for cid, theta in thetas.items()
    }


def update_from_results(
    channel_id: int,
    objective: str,
    observed_ctr: float,
    observed_roas: float,
    observed_cac: float,
) -> None:
    """
    Reward step: convert today's observed metric to a binary 0/1 signal,
    then increment Alpha (success) or Beta (failure) in the DB.

    Binary reward binarises a continuous metric against a fixed threshold:
      CTR  reward = 1 if observed_ctr  >= threshold
      ROAS reward = 1 if observed_roas >= threshold
      CAC  reward = 1 if observed_cac  <= threshold  (inverted; lower is better)

    Args:
        channel_id:    integer channel ID
        objective:     'ctr' | 'roas' | 'cac'
        observed_*:    the three observed metrics from today's simulation
    """
    thresholds = REWARD_THRESHOLDS

    if objective == "ctr":
        reward = 1 if observed_ctr >= thresholds["ctr"] else 0
    elif objective == "roas":
        reward = 1 if observed_roas >= thresholds["roas"] else 0
    elif objective == "cac":
        # CAC is minimised; reward if below threshold, not above.
        reward = 1 if observed_cac <= thresholds["cac"] else 0
    else:
        raise ValueError(f"Unknown objective '{objective}'. Expected: ctr | roas | cac")

    # Alpha += 1 on success; Beta += 1 on failure.
    update_bandit_state(
        channel_id,
        objective,
        alpha_delta=float(reward),
        beta_delta=float(1 - reward),
    )
