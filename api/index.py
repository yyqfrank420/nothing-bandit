"""Vercel ASGI entrypoint for the FastAPI backend.

Persistent deployment data requires the configured hosted PostgreSQL database.
Local SQLite files are not a persistent store on a serverless filesystem.
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
# compatibility; Vite's proxy strips /api before forwarding to localhost:8000).
# This thin wrapper strips the leading "/api" from the path so FastAPI routing works.

async def app(scope, receive, send):
    """ASGI entrypoint that strips /api prefix then delegates to the FastAPI app."""
    if scope.get("type") == "http":
        path = scope.get("path", "")
        if path.startswith("/api"):
            scope = {**scope, "path": path[4:] or "/"}
    await _backend_app(scope, receive, send)
