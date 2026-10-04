"""Synthetic channel parameters, reward thresholds, and budget settings.

These values are model assumptions, not measured channel performance.
The simulator applies noise and shock multipliers to these base rates.
"""

# Each channel dict is the single source of truth for simulation + DB seeding.
CHANNELS = [
    {
        "id":        1,
        "name":      "Tech KOL",
        "type":      "KOL",
        "true_ctr":  0.045,
        "true_roas": 2.8,
        "true_cac":  120.0,
    },
    {
        "id":        2,
        "name":      "Design KOL",
        "type":      "KOL",
        "true_ctr":  0.030,
        "true_roas": 3.5,
        "true_cac":  145.0,
    },
    {
        "id":        3,
        "name":      "Generic KOL",
        "type":      "KOL",
        "true_ctr":  0.020,
        "true_roas": 1.8,
        "true_cac":  220.0,
    },
    {
        "id":        4,
        "name":      "Instagram Ads",
        "type":      "DTC",
        "true_ctr":  0.025,
        "true_roas": 2.5,
        "true_cac":  175.0,
    },
    {
        "id":        5,
        "name":      "TikTok Ads",
        "type":      "DTC",
        "true_ctr":  0.055,
        "true_roas": 1.5,
        "true_cac":  200.0,
    },
    {
        "id":        6,
        "name":      "Google Search",
        "type":      "DTC",
        "true_ctr":  0.015,
        "true_roas": 4.2,
        "true_cac":  90.0,
    },
]

# Binary rewards compare observed metrics with these model thresholds.
# CTR and ROAS succeed at or above the threshold; CAC succeeds at or below it.
REWARD_THRESHOLDS = {
    "ctr":  0.030,
    "roas": 2.50,
    "cac":  160.0,
}

DAILY_BUDGET = 5000.0   # total USD allocated per day across all channels
NOISE_SIGMA  = 0.15     # relative std dev of Gaussian noise on each metric (15%)

# Fixed model budget split, keyed by channel ID. Weights sum to 1.0.
STATIC_WEIGHTS = {
    6: 0.30,
    5: 0.25,
    4: 0.20,
    1: 0.15,
    2: 0.07,
    3: 0.03,
}
