// Browser API client. Requests use the same-origin /api routes.

const BASE = "/api";

/** Throw a descriptive error if the response is not 2xx. */
async function checkResponse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Run days across all three objectives with optional per-request settings. */
export async function simulate(nDays, settings = null) {
  const body = { n_days: nDays };
  if (settings) {
    body.settings = {
      daily_budget: settings.dailyBudget  ?? null,
      noise_sigma:  settings.noiseSigma   ?? null,
      reward_ctr:   settings.rewardCtr    ?? null,
      reward_roas:  settings.rewardRoas   ?? null,
      reward_cac:   settings.rewardCac    ?? null,
      decay_factor: settings.decayFactor  ?? null,
    };
  }
  const res = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return checkResponse(res);
}

/**
 * Fetch all daily_results rows.
 * @returns {Promise<Array>}
 */
export async function getResults() {
  const res = await fetch(`${BASE}/results`);
  return checkResponse(res);
}

/**
 * Fetch all bandit_state rows (alpha + beta per channel × objective).
 * @returns {Promise<Array>}
 */
export async function getBanditStates() {
  const res = await fetch(`${BASE}/bandit-states`);
  return checkResponse(res);
}

/**
 * Fetch campaign results, posterior state, complete shock history, and active shocks.
 * Abort the request after 10 seconds.
 */
export async function getState() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}/state`, { signal: controller.signal });
    return checkResponse(res);
  } finally {
    clearTimeout(timeout);
  }
}

/** Trigger a market shock and return its authoritative inclusive day bounds. */
export async function triggerShock() {
  const res = await fetch(`${BASE}/shock`, { method: "POST" });
  return checkResponse(res);
}

/**
 * Fetch currently active shock events (for page reload restoration).
 * @returns {Promise<Array>}
 */
export async function getActiveShocks() {
  const res = await fetch(`${BASE}/active-shocks`);
  return checkResponse(res);
}

/**
 * Reset all simulation state to day 0.
 * @returns {Promise<{status, message}>}
 */
export async function reset() {
  const res = await fetch(`${BASE}/reset`, { method: "POST" });
  return checkResponse(res);
}

/**
 * Check whether the service responds.
 * @returns {Promise<{status: "ok"}>}
 */
export async function healthCheck() {
  const res = await fetch(`${BASE}/health`);
  return checkResponse(res);
}
