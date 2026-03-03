"""
File: channels.py
Language: Python
Purpose: Defines the 6 marketing channels used in the simulation, their true (hidden)
         performance parameters, reward thresholds for the bandit, and global budget config.
Connects to: bandit.py (reads REWARD_THRESHOLDS), simulator.py (reads channel dicts),
             database.py (seeds channel rows on startup)
Inputs:  None (static config)
Outputs: CHANNELS list, REWARD_THRESHOLDS dict, DAILY_BUDGET float, NOISE_SIGMA float

Design note: True params are hidden from the bandit — it must discover them through
exploration. The thresholds below are chosen so each objective converges to a different
winner, making the side-by-side comparison visually compelling:
  Max CTR  → TikTok Ads    (true CTR 5.5%)
  Max ROAS → Google Search  (true ROAS 4.2x)
  Min CAC  → Google Search  (true CAC $90)

CAC calibration: Nothing phones retail at ~$350–600 in SEA. At a healthy 1:3 LTV:CAC
ratio, CAC ceiling is ~$120–200. Google Search (high-intent) anchors the floor at $90;
Generic KOL (broad, unqualified) sits at $220 — a realistic SEA D2C premium tech spread.
"""

# Each channel dict is the single source of truth for simulation + DB seeding.
CHANNELS = [
    {
        "id":        1,
        "name":      "Tech KOL",
        "type":      "KOL",
        "true_ctr":  0.045,   # 4.5% CTR — engaged tech-enthusiast audience
        "true_roas": 2.8,     # $2.80 revenue per $1 spent
        "true_cac":  120.0,   # $120 — targeted audience converts reasonably well
    },
    {
        "id":        2,
        "name":      "Design KOL",
        "type":      "KOL",
        "true_ctr":  0.030,   # 3.0% CTR — design audience is selective
        "true_roas": 3.5,     # high ROAS — design-led buyers tend to spend more
        "true_cac":  145.0,   # $145 — quality audience but smaller & harder to scale
    },
    {
        "id":        3,
        "name":      "Generic KOL",
        "type":      "KOL",
        "true_ctr":  0.020,   # low CTR — broad, unqualified audience
        "true_roas": 1.8,     # low ROAS — poor purchase intent
        "true_cac":  220.0,   # $220 — expensive: high volume, low conversion quality
    },
    {
        "id":        4,
        "name":      "Instagram Ads",
        "type":      "DTC",
        "true_ctr":  0.025,   # mid-tier CTR — visual discovery, browsing mindset
        "true_roas": 2.5,     # mid-tier ROAS
        "true_cac":  175.0,   # $175 — mid-funnel, requires nurturing to convert
    },
    {
        "id":        5,
        "name":      "TikTok Ads",
        "type":      "DTC",
        "true_ctr":  0.055,   # highest CTR — impulse clicks on viral content
        "true_roas": 1.5,     # low ROAS — high click volume, poor purchase intent
        "true_cac":  200.0,   # $200 — impulse audience doesn't commit to premium price
    },
    {
        "id":        6,
        "name":      "Google Search",
        "type":      "DTC",
        "true_ctr":  0.015,   # low CTR — only high-intent searchers click through
        "true_roas": 4.2,     # highest ROAS — already in buy mode at search time
        "true_cac":  90.0,    # $90 — cheapest acquisition: intent is already there
    },
]

# Binary reward thresholds — each day's observed metric is compared to these.
# "Success" = beat the threshold → Alpha += 1; "Failure" → Beta += 1.
# CAC threshold set between Design KOL ($145) and Instagram ($175) so 3 channels
# reliably win (Google, Tech KOL, Design KOL) and 3 lose (Instagram, TikTok, Generic KOL).
REWARD_THRESHOLDS = {
    "ctr":  0.030,   # 3.0% — above = CTR success
    "roas": 2.50,    # 2.5x  — above = ROAS success
    "cac":  160.0,   # $160  — BELOW = CAC success (lower CAC is better)
}

DAILY_BUDGET = 5000.0   # total USD allocated per day across all channels
NOISE_SIGMA  = 0.15     # relative std dev of Gaussian noise on each metric (15%)

# Fixed industry-prior budget split used by the static allocator.
# Keyed by channel_id. Weights sum to 1.0.
# Source: typical Southeast Asia performance marketing mix.
STATIC_WEIGHTS = {
    6: 0.30,  # Google Search   — 30% (intent-driven, reliable baseline)
    5: 0.25,  # TikTok Ads      — 25% (high reach, youth demographic)
    4: 0.20,  # Instagram Ads   — 20% (mid-funnel visual discovery)
    1: 0.15,  # Tech KOL        — 15% (targeted tech audience)
    2: 0.07,  # Design KOL      —  7% (niche high-intent)
    3: 0.03,  # Generic KOL     —  3% (broad, low conviction)
}
