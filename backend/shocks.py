"""
File: shocks.py
Language: Python
Purpose: Static library of 10 market shock events for the SEA marketing simulation.
         Each event represents a realistic disruption to the advertising landscape.
         Triggered on demand via the /shock API endpoint.

Connects to: api.py (selects from SHOCK_EVENTS, enforces no-repeat per session)
             simulator.py (reads active shocks from DB to apply multipliers each day)
Inputs:  None (static config)
Outputs: SHOCK_EVENTS list of dicts

Shock format:
    name                 — short display label (must be unique — used as dedup key)
    description          — plain-English explanation of the real-world cause
    affected_channel_ids — list of channel IDs impacted (1=Tech KOL, 2=Design KOL,
                           3=Generic KOL, 4=Instagram Ads, 5=TikTok Ads, 6=Google Search)
    multipliers          — {metric: factor} applied to true_* values during the shock window
                           e.g. {"ctr": 0.5} halves observed CTR for affected channels
                           CAC multiplier < 1 means cheaper acquisition (positive effect)
    duration_range       — (min_days, max_days); actual duration drawn uniformly at trigger time

No-overlap rule: each event can only be triggered once per session (api.py enforces this).
All 10 events exhausted → api.py returns 409, frontend shows "no events remaining".
"""

SHOCK_EVENTS = [
    # ── Negative: single-channel ────────────────────────────────────────────

    {
        "name": "TikTok Algorithm Change",
        "description": (
            "TikTok's recommendation algorithm de-prioritises paid content in favour of "
            "organic creators, collapsing ad reach and purchase intent overnight."
        ),
        "affected_channel_ids": [5],
        "multipliers": {"ctr": 0.45, "roas": 0.65},
        "duration_range": (7, 21),
    },
    {
        "name": "Instagram Platform Outage",
        "description": (
            "A global Instagram service degradation renders Reels and Story ads "
            "non-deliverable for most of the day. Impressions and clicks crater."
        ),
        "affected_channel_ids": [4],
        "multipliers": {"ctr": 0.10, "roas": 0.10, "cac": 5.0},
        "duration_range": (7, 14),
    },
    {
        "name": "Competitor Price War",
        "description": (
            "A rival brand launches aggressive discounting on Google Shopping. "
            "High-intent search audiences defect and ROAS on branded terms collapses."
        ),
        "affected_channel_ids": [6],
        "multipliers": {"roas": 0.60, "cac": 1.40},
        "duration_range": (14, 30),
    },

    # ── Negative: multi-channel ──────────────────────────────────────────────

    {
        "name": "KOL Influencer Scandal",
        "description": (
            "A prominent SEA tech influencer is embroiled in a paid-review controversy. "
            "Brand trust collapses across the entire KOL ecosystem as audiences pause."
        ),
        "affected_channel_ids": [1, 2, 3],
        "multipliers": {"ctr": 0.40, "roas": 0.50},
        "duration_range": (10, 25),
    },
    {
        "name": "Social Media Privacy Backlash",
        "description": (
            "A regional data-harvesting exposé goes viral, prompting users to restrict "
            "social app permissions across the board. Instagram and TikTok ad reach "
            "drops sharply as audience targeting degrades."
        ),
        "affected_channel_ids": [4, 5],
        "multipliers": {"ctr": 0.55, "roas": 0.60},
        "duration_range": (10, 20),
    },
    {
        "name": "Currency Volatility",
        "description": (
            "The Indonesian Rupiah and Malaysian Ringgit weaken sharply against the USD, "
            "raising the effective price of imported electronics. Consumers delay big-ticket "
            "purchases — clicks hold but conversion rates collapse across every channel."
        ),
        "affected_channel_ids": [1, 2, 3, 4, 5, 6],
        "multipliers": {"roas": 0.65, "cac": 1.50},
        "duration_range": (14, 30),
    },

    # ── Positive: single-channel ─────────────────────────────────────────────

    {
        "name": "Viral Brand Moment",
        "description": (
            "A Nothing Phone unboxing goes organically viral on TikTok, boosting paid "
            "ad performance through association with trending content."
        ),
        "affected_channel_ids": [5],
        "multipliers": {"ctr": 2.0, "roas": 1.50},
        "duration_range": (7, 14),
    },
    {
        "name": "Design Community Trend",
        "description": (
            "Nothing's glyph interface aesthetic goes viral in Figma and Dribbble "
            "communities. Design KOL audiences surge with high-intent buyers drawn "
            "to the brand's hardware-meets-software philosophy."
        ),
        "affected_channel_ids": [2],
        "multipliers": {"ctr": 1.70, "roas": 1.60, "cac": 0.80},
        "duration_range": (7, 18),
    },

    # ── Positive: multi-channel ──────────────────────────────────────────────

    {
        "name": "Regional Holiday Surge",
        "description": (
            "Harbolnas (Indonesia's National Online Shopping Day) drives a cross-platform "
            "surge in purchase intent. Every channel sees elevated clicks and conversions."
        ),
        "affected_channel_ids": [1, 2, 3, 4, 5, 6],
        "multipliers": {"ctr": 1.35, "roas": 1.40, "cac": 0.75},
        "duration_range": (7, 14),
    },
    {
        "name": "Coordinated Tech Review Wave",
        "description": (
            "Major tech YouTube channels and Google-indexed review sites simultaneously "
            "publish Nothing Phone 3 reviews under an embargo lift. Search intent and "
            "KOL credibility spike in tandem."
        ),
        "affected_channel_ids": [1, 6],
        "multipliers": {"ctr": 1.55, "roas": 1.45, "cac": 0.85},
        "duration_range": (10, 21),
    },
]
