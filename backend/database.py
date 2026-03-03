"""
File: database.py
Language: Python
Purpose: All database schema, seeding, and query helpers.
         Supports two backends selected by environment variable:
           - SQLite    (local dev)  — no config needed, writes to bandit.db
           - PostgreSQL (Vercel)    — set DATABASE_URL env var, uses psycopg2

         Public function signatures are identical for both backends.
         Internal helpers abstract the three main API differences:
           1. Connection creation  (sqlite3 vs psycopg2)
           2. Placeholder style    (? vs %s)
           3. Upsert syntax        (INSERT OR REPLACE vs ON CONFLICT)

Connects to: api.py, bandit.py, simulator.py
Inputs:  Channel list (for seeding), row dicts (for inserts)
Outputs: Rows as plain Python dicts

--- How to switch backends ---
Local (SQLite, default):   no env var needed.
Vercel (Postgres):         set DATABASE_URL=postgresql://user:pass@host:5432/dbname
                           Add psycopg2-binary to requirements.txt.
                           On Vercel: Dashboard → Storage → Create Postgres →
                           the POSTGRES_URL env var is injected automatically.
                           Rename it to DATABASE_URL in your vercel.json env block,
                           or change the lookup below to POSTGRES_URL.
"""

import json
import os
import sqlite3

from channels import STATIC_WEIGHTS

# Strength of the informed prior (equivalent number of pseudo-observations).
# α_i = w_i × N_PRIOR, β_i = (1 - w_i) × N_PRIOR
# → E[θ_i] = w_i, so day-1 Thompson samples match static weights in expectation.
# N=10 washes out in ~20 days once real reward signals accumulate.
N_PRIOR = 10

# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------

# Set DATABASE_URL in your environment to switch to Postgres.
# On Vercel: Dashboard → your project → Settings → Environment Variables.
# Vercel Postgres injects POSTGRES_URL automatically; either rename it to
# DATABASE_URL or change the os.environ.get() key below to match.
DATABASE_URL = os.environ.get("DATABASE_URL")
USE_POSTGRES  = bool(DATABASE_URL)

# SQLite only — file path relative to this script.
DB_PATH = os.path.join(os.path.dirname(__file__), "bandit.db")

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def _connect():
    """
    Open a database connection for the active backend.

    SQLite:   returns sqlite3.Connection with Row factory (dict-style access).
    Postgres: returns psycopg2 connection with RealDictCursor (also dict-style).

    Both connections work with conn.commit() and conn.close().
    """
    if USE_POSTGRES:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DATABASE_URL)
        # RealDictCursor makes fetchall() / fetchone() return plain dicts —
        # same behaviour as sqlite3.Row after dict(row).
        conn.cursor_factory = psycopg2.extras.RealDictCursor
        return conn
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def _exec(conn, sql, params=()):
    """
    Execute one SQL statement and return the cursor.

    sqlite3 has conn.execute() shorthand; psycopg2 requires an explicit cursor.
    This wrapper gives a uniform interface so callers don't need to branch.
    """
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur
    else:
        return conn.execute(sql, params)


def _exec_many(conn, sql, params_list):
    """Execute one SQL statement for each item in params_list (batch write)."""
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.executemany(sql, params_list)
    else:
        conn.executemany(sql, params_list)


def _fetchall(cur) -> list:
    """
    Return all rows from a cursor as a list of plain dicts.
    psycopg2 RealDictCursor already returns dicts; sqlite3.Row needs dict() cast.
    """
    rows = cur.fetchall()
    if USE_POSTGRES:
        return [dict(r) for r in rows]
    return [dict(r) for r in rows]


def _fetchone(cur):
    """Return one row as a plain dict, or None if no rows."""
    row = cur.fetchone()
    if row is None:
        return None
    return dict(row)


# ---------------------------------------------------------------------------
# Schema DDL — two versions (backends differ on AUTOINCREMENT syntax)
# ---------------------------------------------------------------------------

_CREATE_CHANNELS = """
CREATE TABLE IF NOT EXISTS channels (
    id        INTEGER PRIMARY KEY,
    name      TEXT    NOT NULL,
    type      TEXT    NOT NULL,
    true_ctr  REAL    NOT NULL,
    true_roas REAL    NOT NULL,
    true_cac  REAL    NOT NULL
);
"""

_CREATE_DAILY_RESULTS = """
CREATE TABLE IF NOT EXISTS daily_results (
    day               INTEGER NOT NULL,
    channel_id        INTEGER NOT NULL,
    objective         TEXT    NOT NULL,
    allocator         TEXT    NOT NULL,
    budget_allocated  REAL    NOT NULL,
    impressions       INTEGER NOT NULL,
    clicks            INTEGER NOT NULL,
    conversions       INTEGER NOT NULL,
    revenue           REAL    NOT NULL,
    observed_ctr      REAL    NOT NULL,
    observed_roas     REAL    NOT NULL,
    observed_cac      REAL    NOT NULL,
    PRIMARY KEY (day, channel_id, objective, allocator)
);
"""

_CREATE_BANDIT_STATE = """
CREATE TABLE IF NOT EXISTS bandit_state (
    channel_id  INTEGER NOT NULL,
    objective   TEXT    NOT NULL,
    alpha       REAL    NOT NULL DEFAULT 1.0,
    beta        REAL    NOT NULL DEFAULT 1.0,
    PRIMARY KEY (channel_id, objective)
);
"""

# AUTOINCREMENT is SQLite syntax; Postgres uses SERIAL (auto-incrementing integer).
if USE_POSTGRES:
    _CREATE_ACTIVE_SHOCKS = """
    CREATE TABLE IF NOT EXISTS active_shocks (
        id                   SERIAL PRIMARY KEY,
        name                 TEXT    NOT NULL,
        description          TEXT    NOT NULL,
        affected_channel_ids TEXT    NOT NULL,
        multipliers          TEXT    NOT NULL,
        days_remaining       INTEGER NOT NULL,
        triggered_on_day     INTEGER NOT NULL
    );
    """
else:
    _CREATE_ACTIVE_SHOCKS = """
    CREATE TABLE IF NOT EXISTS active_shocks (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        name                 TEXT    NOT NULL,
        description          TEXT    NOT NULL,
        affected_channel_ids TEXT    NOT NULL,
        multipliers          TEXT    NOT NULL,
        days_remaining       INTEGER NOT NULL,
        triggered_on_day     INTEGER NOT NULL
    );
    """

# ---------------------------------------------------------------------------
# Setup + seeding
# ---------------------------------------------------------------------------

def setup_database(channels: list) -> None:
    """
    Create all tables and seed static data. Safe to call on every startup —
    all inserts use ON CONFLICT / INSERT OR IGNORE so duplicates are skipped.
    """
    conn = _connect()
    _exec(conn, _CREATE_CHANNELS)
    _exec(conn, _CREATE_DAILY_RESULTS)
    _exec(conn, _CREATE_BANDIT_STATE)
    _exec(conn, _CREATE_ACTIVE_SHOCKS)

    # Upsert channel definitions. Syntax differs between backends:
    #   SQLite:   INSERT OR REPLACE
    #   Postgres: INSERT ... ON CONFLICT (id) DO UPDATE SET ...
    for ch in channels:
        if USE_POSTGRES:
            _exec(conn, """
                INSERT INTO channels (id, name, type, true_ctr, true_roas, true_cac)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name=EXCLUDED.name, type=EXCLUDED.type,
                    true_ctr=EXCLUDED.true_ctr, true_roas=EXCLUDED.true_roas,
                    true_cac=EXCLUDED.true_cac
            """, (ch["id"], ch["name"], ch["type"], ch["true_ctr"], ch["true_roas"], ch["true_cac"]))
        else:
            _exec(conn, """
                INSERT OR REPLACE INTO channels (id, name, type, true_ctr, true_roas, true_cac)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (ch["id"], ch["name"], ch["type"], ch["true_ctr"], ch["true_roas"], ch["true_cac"]))

    # Seed bandit priors Beta(1, 1) — only if row doesn't already exist.
    for ch in channels:
        weight = STATIC_WEIGHTS.get(ch["id"], 1.0 / len(channels))
        alpha_init = weight * N_PRIOR
        beta_init  = (1.0 - weight) * N_PRIOR
        for objective in ("ctr", "roas", "cac"):
            if USE_POSTGRES:
                _exec(conn, """
                    INSERT INTO bandit_state (channel_id, objective, alpha, beta)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (ch["id"], objective, alpha_init, beta_init))
            else:
                _exec(conn, """
                    INSERT OR IGNORE INTO bandit_state (channel_id, objective, alpha, beta)
                    VALUES (?, ?, ?, ?)
                """, (ch["id"], objective, alpha_init, beta_init))

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Bandit state reads + writes
# ---------------------------------------------------------------------------

def get_bandit_states(objective: str) -> dict:
    """Return {channel_id: {alpha, beta}} for one objective. Called by bandit.py."""
    conn = _connect()
    if USE_POSTGRES:
        cur = _exec(conn, "SELECT channel_id, alpha, beta FROM bandit_state WHERE objective = %s", (objective,))
    else:
        cur = _exec(conn, "SELECT channel_id, alpha, beta FROM bandit_state WHERE objective = ?", (objective,))
    rows = _fetchall(cur)
    conn.close()
    return {r["channel_id"]: {"alpha": r["alpha"], "beta": r["beta"]} for r in rows}


def batch_update_bandit_states(updates: list) -> None:
    """
    Batch-increment alpha/beta for multiple (channel_id, objective) pairs.
    One connection for all 18 updates (6 channels × 3 objectives) per simulated day.

    Args: list of (channel_id, objective, alpha_delta, beta_delta)
    """
    if not updates:
        return
    conn = _connect()
    if USE_POSTGRES:
        _exec_many(conn, """
            UPDATE bandit_state
            SET alpha = alpha + %s, beta = beta + %s
            WHERE channel_id = %s AND objective = %s
        """, [(a_d, b_d, ch_id, obj) for ch_id, obj, a_d, b_d in updates])
    else:
        _exec_many(conn, """
            UPDATE bandit_state
            SET alpha = alpha + ?, beta = beta + ?
            WHERE channel_id = ? AND objective = ?
        """, [(a_d, b_d, ch_id, obj) for ch_id, obj, a_d, b_d in updates])
    conn.commit()
    conn.close()


def batch_set_bandit_states(states: dict) -> None:
    """
    Overwrite alpha/beta for all (channel_id, objective) pairs with absolute values.

    Used at the end of run_full_simulation when Bayesian decay is applied in-memory.
    Decay modifies the base state each day, so the final values cannot be reconstructed
    from incremental deltas — we must write the absolute final state.

    states format: {objective: {channel_id: {"alpha": float, "beta": float}}}
    """
    params = [
        (data["alpha"], data["beta"], ch_id, obj)
        for obj, channels in states.items()
        for ch_id, data in channels.items()
    ]
    if not params:
        return
    conn = _connect()
    if USE_POSTGRES:
        _exec_many(conn, """
            UPDATE bandit_state SET alpha = %s, beta = %s
            WHERE channel_id = %s AND objective = %s
        """, params)
    else:
        _exec_many(conn, """
            UPDATE bandit_state SET alpha = ?, beta = ?
            WHERE channel_id = ? AND objective = ?
        """, params)
    conn.commit()
    conn.close()


def update_bandit_state(channel_id: int, objective: str, alpha_delta: float, beta_delta: float) -> None:
    """Single-row bandit update. Prefer batch_update_bandit_states() for multi-row writes."""
    conn = _connect()
    if USE_POSTGRES:
        _exec(conn, """
            UPDATE bandit_state SET alpha = alpha + %s, beta = beta + %s
            WHERE channel_id = %s AND objective = %s
        """, (alpha_delta, beta_delta, channel_id, objective))
    else:
        _exec(conn, """
            UPDATE bandit_state SET alpha = alpha + ? , beta = beta + ?
            WHERE channel_id = ? AND objective = ?
        """, (alpha_delta, beta_delta, channel_id, objective))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Daily results writes
# ---------------------------------------------------------------------------

def insert_daily_results_batch(rows: list) -> None:
    """
    Batch-insert a list of daily_results row dicts in a single transaction.
    Uses INSERT OR REPLACE / ON CONFLICT to handle re-runs of the same day.

    rows: list of dicts with keys matching the daily_results columns.
    """
    conn = _connect()

    if USE_POSTGRES:
        # psycopg2 uses %(name)s for named dict params (equivalent to SQLite's :name).
        _exec_many(conn, """
            INSERT INTO daily_results
              (day, channel_id, objective, allocator, budget_allocated,
               impressions, clicks, conversions, revenue,
               observed_ctr, observed_roas, observed_cac)
            VALUES
              (%(day)s, %(channel_id)s, %(objective)s, %(allocator)s, %(budget_allocated)s,
               %(impressions)s, %(clicks)s, %(conversions)s, %(revenue)s,
               %(observed_ctr)s, %(observed_roas)s, %(observed_cac)s)
            ON CONFLICT (day, channel_id, objective, allocator)
            DO UPDATE SET
                budget_allocated = EXCLUDED.budget_allocated,
                impressions      = EXCLUDED.impressions,
                clicks           = EXCLUDED.clicks,
                conversions      = EXCLUDED.conversions,
                revenue          = EXCLUDED.revenue,
                observed_ctr     = EXCLUDED.observed_ctr,
                observed_roas    = EXCLUDED.observed_roas,
                observed_cac     = EXCLUDED.observed_cac
        """, rows)
    else:
        # SQLite uses :name for named dict params.
        _exec_many(conn, """
            INSERT OR REPLACE INTO daily_results
              (day, channel_id, objective, allocator, budget_allocated,
               impressions, clicks, conversions, revenue,
               observed_ctr, observed_roas, observed_cac)
            VALUES
              (:day, :channel_id, :objective, :allocator, :budget_allocated,
               :impressions, :clicks, :conversions, :revenue,
               :observed_ctr, :observed_roas, :observed_cac)
        """, rows)

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Reads for API responses
# ---------------------------------------------------------------------------

def get_current_day() -> int:
    """Return the highest simulated day, or 0 if no simulation has run."""
    conn = _connect()
    cur = _exec(conn, "SELECT MAX(day) AS max_day FROM daily_results")
    row = _fetchone(cur)
    conn.close()
    return row["max_day"] if row and row["max_day"] is not None else 0


def get_all_results() -> list:
    """Return all daily_results rows as plain dicts, ordered for deterministic frontend parsing."""
    conn = _connect()
    cur = _exec(conn, "SELECT * FROM daily_results ORDER BY day, objective, allocator, channel_id")
    rows = _fetchall(cur)
    conn.close()
    return rows


def get_all_bandit_states() -> list:
    """Return all bandit_state rows as plain dicts."""
    conn = _connect()
    cur = _exec(conn, "SELECT * FROM bandit_state ORDER BY objective, channel_id")
    rows = _fetchall(cur)
    conn.close()
    return rows


# ---------------------------------------------------------------------------
# Shock event reads + writes
# ---------------------------------------------------------------------------

def insert_shock(
    name: str,
    description: str,
    affected_channel_ids: list,
    multipliers: dict,
    duration: int,
    triggered_on_day: int,
) -> int:
    """
    Insert a new active shock. Returns the new row's id.
    Postgres needs RETURNING id to get the auto-increment value back;
    sqlite3 uses cursor.lastrowid.
    """
    conn = _connect()

    if USE_POSTGRES:
        cur = _exec(conn, """
            INSERT INTO active_shocks
              (name, description, affected_channel_ids, multipliers, days_remaining, triggered_on_day)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (name, description, json.dumps(affected_channel_ids), json.dumps(multipliers), duration, triggered_on_day))
        new_id = _fetchone(cur)["id"]
    else:
        cur = _exec(conn, """
            INSERT INTO active_shocks
              (name, description, affected_channel_ids, multipliers, days_remaining, triggered_on_day)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, description, json.dumps(affected_channel_ids), json.dumps(multipliers), duration, triggered_on_day))
        new_id = cur.lastrowid

    conn.commit()
    conn.close()
    return new_id


def get_triggered_shock_names() -> set:
    """
    Return the names of every shock that has ever been triggered this session.
    Includes both still-active and already-expired shocks (days_remaining <= 0).
    Used by api.py to enforce the no-repeat rule: each unique event fires at most once.
    """
    conn = _connect()
    cur  = _exec(conn, "SELECT name FROM active_shocks")
    rows = _fetchall(cur)
    conn.close()
    return {r["name"] for r in rows}


def get_active_shocks() -> list:
    """Return all shocks with days_remaining > 0 as plain dicts (JSON fields deserialised)."""
    conn = _connect()
    if USE_POSTGRES:
        cur = _exec(conn, "SELECT * FROM active_shocks WHERE days_remaining > 0")
    else:
        cur = _exec(conn, "SELECT * FROM active_shocks WHERE days_remaining > 0")
    rows = _fetchall(cur)
    conn.close()

    for row in rows:
        row["affected_channel_ids"] = json.loads(row["affected_channel_ids"])
        row["multipliers"]          = json.loads(row["multipliers"])
    return rows


def decrement_shock_durations() -> None:
    """Subtract 1 from days_remaining for all active shocks. Called once per simulated day."""
    conn = _connect()
    _exec(conn, "UPDATE active_shocks SET days_remaining = days_remaining - 1")
    conn.commit()
    conn.close()


def clear_shocks() -> None:
    """Delete all shock rows. Called on full reset."""
    conn = _connect()
    _exec(conn, "DELETE FROM active_shocks")
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

def reset_simulation(channels: list) -> None:
    """
    Wipe all simulation history and reset bandit state to informed priors.
    Priors are derived from STATIC_WEIGHTS so day-1 allocation matches static.
    Channel definitions are preserved. Shocks are cleared via clear_shocks().
    """
    conn = _connect()
    _exec(conn, "DELETE FROM daily_results")
    _exec(conn, "DELETE FROM bandit_state")

    for ch in channels:
        weight = STATIC_WEIGHTS.get(ch["id"], 1.0 / len(channels))
        alpha_init = weight * N_PRIOR
        beta_init  = (1.0 - weight) * N_PRIOR
        for objective in ("ctr", "roas", "cac"):
            if USE_POSTGRES:
                _exec(conn, """
                    INSERT INTO bandit_state (channel_id, objective, alpha, beta)
                    VALUES (%s, %s, %s, %s)
                """, (ch["id"], objective, alpha_init, beta_init))
            else:
                _exec(conn, """
                    INSERT INTO bandit_state (channel_id, objective, alpha, beta)
                    VALUES (?, ?, ?, ?)
                """, (ch["id"], objective, alpha_init, beta_init))

    conn.commit()
    conn.close()
