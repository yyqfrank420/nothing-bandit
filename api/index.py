"""
File: api/index.py
Language: Python
Purpose: Vercel serverless entrypoint — re-exports the FastAPI app from backend/api.py
         so Vercel's Python runtime picks it up as a single ASGI function.

Connects to: ../backend/api.py  (the actual FastAPI application)

IMPORTANT — Pre-deployment checklist:
  1. SQLite does NOT work on Vercel (ephemeral filesystem — writes are discarded
     between function invocations). Before deploying, replace SQLite in database.py
     with a hosted database:
       - Vercel Postgres (built-in, free tier: 256 MB storage)
       - Turso          (remote SQLite-compatible, generous free tier)
       - Supabase       (PostgreSQL, 500 MB free)
     Update the connection logic in database.py accordingly.

  2. CORS origins in backend/api.py must include your Vercel deployment URL.
     Change allow_origins to: ["https://your-app.vercel.app"] or ["*"] for testing.

  3. Vercel Hobby limits:
       - 60s max function duration (configurable in vercel.json)
       - 100 GB bandwidth / month
       - 512 MB memory (set in vercel.json)
       - 6,000 build minutes / month

  4. The /simulate endpoint for large n_days may approach the 60s limit.
     Consider chunking large simulations or increasing maxDuration to 300s
     (available with Fluid Compute on Hobby plan at no extra cost).
"""

import sys
import os

# Make backend modules importable from this entrypoint.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from api import app as _backend_app  # FastAPI routes registered at /health, /simulate, etc.


# ---------------------------------------------------------------------------
# ASGI path-stripping wrapper
# ---------------------------------------------------------------------------
# Vercel rewrites "/api/:path*" to this function but preserves the full path,
# so the function receives GET /api/health instead of GET /health.
# The FastAPI backend registers routes without the /api prefix (for local dev
# compatibility — Vite's proxy strips /api before forwarding to localhost:8000).
# This thin wrapper strips the leading "/api" from the path so FastAPI routing works.

async def app(scope, receive, send):
    """ASGI entrypoint that strips /api prefix then delegates to the FastAPI app."""
    if scope.get("type") == "http":
        path = scope.get("path", "")
        if path.startswith("/api"):
            scope = {**scope, "path": path[4:] or "/"}
    await _backend_app(scope, receive, send)
