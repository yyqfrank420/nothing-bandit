"""Hypothetical shock parameters and presentation copy.

Names are unique. Events may overlap; each name triggers once per session.
"""

SHOCK_EVENTS = [
    # -- Negative: single-channel --------------------------------------------

    {
        "name": "TikTok Algorithm Change",
        "description": (
            (
            "A simulated TikTok algorithm change lowers click-through rate and return on ad "
            "spend for TikTok Ads."
        )
        ),
        "affected_channel_ids": [5],
        "multipliers": {"ctr": 0.45, "roas": 0.65},
        "duration_range": (7, 21),
    },
    {
        "name": "Instagram Platform Outage",
        "description": (
            (
            "A simulated Instagram outage lowers click-through rate and return on ad spend, "
            "and raises acquisition cost for Instagram Ads."
        )
        ),
        "affected_channel_ids": [4],
        "multipliers": {"ctr": 0.10, "roas": 0.10, "cac": 5.0},
        "duration_range": (7, 14),
    },
    {
        "name": "Competitor Price War",
        "description": (
            (
            "A simulated competitor discount campaign lowers return on ad spend and raises "
            "acquisition cost for Google Search."
        )
        ),
        "affected_channel_ids": [6],
        "multipliers": {"roas": 0.60, "cac": 1.40},
        "duration_range": (14, 30),
    },

    # -- Negative: multi-channel ----------------------------------------------

    {
        "name": "KOL Influencer Scandal",
        "description": (
            (
            "A simulated influencer controversy lowers click-through rate and return on ad "
            "spend for all KOL channels."
        )
        ),
        "affected_channel_ids": [1, 2, 3],
        "multipliers": {"ctr": 0.40, "roas": 0.50},
        "duration_range": (10, 25),
    },
    {
        "name": "Social Media Privacy Backlash",
        "description": (
            (
            "A simulated privacy backlash lowers click-through rate and return on ad spend "
            "for Instagram and TikTok Ads."
        )
        ),
        "affected_channel_ids": [4, 5],
        "multipliers": {"ctr": 0.55, "roas": 0.60},
        "duration_range": (10, 20),
    },
    {
        "name": "Currency Volatility",
        "description": (
            (
            "A simulated currency disruption lowers return on ad spend and raises acquisition "
            "cost across all channels."
        )       ),
        "affected_channel_ids": [1, 2, 3, 4, 5, 6],
        "multipliers": {"roas": 0.65, "cac": 1.50},
        "duration_range": (14, 30),
    },

    # -- Positive: single-channel ---------------------------------------------

    {
        "name": "Viral Brand Moment",
        "description": (
            (
            "A simulated viral brand moment raises click-through rate and return on ad spend "
            "for TikTok Ads."
        )
        ),
        "affected_channel_ids": [5],
        "multipliers": {"ctr": 2.0, "roas": 1.50},
        "duration_range": (7, 14),
    },
    {
        "name": "Design Community Trend",
        "description": (
            (
            "A simulated design trend raises click-through rate and return on ad spend, and "
            "lowers acquisition cost for Design KOL."
        )
        ),
        "affected_channel_ids": [2],
        "multipliers": {"ctr": 1.70, "roas": 1.60, "cac": 0.80},
        "duration_range": (7, 18),
    },

    # -- Positive: multi-channel ----------------------------------------------

    {
        "name": "Regional Holiday Surge",
        "description": (
            (
            "A simulated regional holiday raises click-through rate and return on ad spend, "
            "and lowers acquisition cost across all channels."
        )
        ),
        "affected_channel_ids": [1, 2, 3, 4, 5, 6],
        "multipliers": {"ctr": 1.35, "roas": 1.40, "cac": 0.75},
        "duration_range": (7, 14),
    },
    {
        "name": "Coordinated Tech Review Wave",
        "description": (
            (
            "A simulated review campaign raises click-through rate and return on ad spend, "
            "and lowers acquisition cost for Tech KOL and Google Search."
        )
        ),
        "affected_channel_ids": [1, 6],
        "multipliers": {"ctr": 1.55, "roas": 1.45, "cac": 0.85},
        "duration_range": (10, 21),
    },
]
