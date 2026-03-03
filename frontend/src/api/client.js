/**
 * File: api/client.js
 * Language: JavaScript
 * Purpose: Thin fetch wrappers for all backend API endpoints.
 *          All calls go through /api/... which Vite proxies to localhost:8000.
 * Connects to: App.jsx (called from event handlers and useEffect hooks)
 * Inputs:  Function arguments (n_days for simulate)
 * Outputs: Parsed JSON response objects, or throws on non-2xx status
 */

const BASE = "/api";

/** Throw a descriptive error if the response is not 2xx. */
async function checkResponse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Run n_days of simulation across all 3 objectives.
 * Accepts optional settings overrides — these are session-scoped and fall back to
 * channels.py defaults on the backend when omitted.
 * @param {number} nDays
 * @param {object|null} settings — {dailyBudget, noiseSigma, rewardCtr, rewardRoas, rewardCac, decayFactor}
 * @returns {Promise<{status, days_run, current_day, new_rows, bandit_states}>}
 */
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
 * Combined initial-load fetch — returns results, bandit_states, active_shocks,
 * and current_day in one round-trip instead of three.
 * On serverless (Vercel), one call = one cold-start instead of three.
 *
 * 10-second AbortController timeout: if the backend port is open but unresponsive
 * (hung uvicorn process, stale connection), fetch would otherwise hang for ~30s.
 * 10s is generous enough to cover Vercel cold starts (typically 1–3s) while
 * failing fast locally when the backend is simply not running.
 *
 * @returns {Promise<{results, bandit_states, active_shocks, current_day}>}
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

/**
 * Trigger a random shock event and return its details.
 * @returns {Promise<{id, name, description, affected_channels, multipliers, duration_days}>}
 */
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
 * Health check — used to detect if backend is running.
 * @returns {Promise<{status: "ok"}>}
 */
export async function healthCheck() {
  const res = await fetch(`${BASE}/health`);
  return checkResponse(res);
}
