/**
 * File: App.jsx
 * Language: JavaScript (React 18)
 * Purpose: Root application shell. Manages global state, time controls, shock events,
 *          and lays out all chart components in the Nothing brand visual language.
 * Connects to: api/client.js (all fetch calls)
 *              components/BudgetAllocationChart.jsx
 *              components/BanditVsStaticChart.jsx
 *              components/BanditConfidenceChart.jsx
 *              components/BusinessMetricsChart.jsx
 * Inputs:  User interactions (buttons), backend API responses
 * Outputs: Full-page dashboard UI
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getState,
  reset,
  simulate,
  triggerShock,
} from "./api/client.js";
import BanditConfidenceChart from "./components/BanditConfidenceChart.jsx";
import BanditVsStaticChart from "./components/BanditVsStaticChart.jsx";
import BudgetAllocationChart from "./components/BudgetAllocationChart.jsx";
import BusinessMetricsChart from "./components/BusinessMetricsChart.jsx";
import SettingsPanel, { DEFAULT_SETTINGS } from "./components/SettingsPanel.jsx";
import ShockImpactPanel from "./components/ShockImpactPanel.jsx";
import LandingPage from "./components/LandingPage.jsx";
import GuidedTour from "./components/GuidedTour.jsx";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OBJECTIVES = ["ctr", "roas", "cac"];

const OBJECTIVE_LABELS = {
  ctr:  "Click Through Rate",
  roas: "Return on Ad Spend",
  cac:  "Customer Acquisition Cost",
};

const OBJECTIVE_SHORT = {
  ctr:  "CTR",
  roas: "ROAS",
  cac:  "CAC",
};

const OBJECTIVE_DESCRIPTIONS = {
  ctr:  "Maximise click-through rate",
  roas: "Maximise return on ad spend",
  cac:  "Minimise cost to acquire",
};

// Each channel keeps the same colour throughout every chart.
export const CHANNEL_COLORS = {
  1: "#F97316",  // Tech KOL      (orange — swapped with Generic KOL to separate from Instagram pink)
  2: "#A78BFA",  // Design KOL
  3: "#4ECDC4",  // Generic KOL   (teal — swapped with Tech KOL, now clearly distinct from Instagram pink)
  4: "#E879A0",  // Instagram Ads
  5: "#22D3EE",  // TikTok Ads
  6: "#4ADE80",  // Google Search
};

export const CHANNEL_NAMES = {
  1: "Tech KOL",
  2: "Design KOL",
  3: "Generic KOL",
  4: "Instagram Ads",
  5: "TikTok Ads",
  6: "Google Search",
};

const MAX_DAYS = 183;  // full 6-month campaign

// Plain-English descriptions for each channel — shown on hover in the channel legend.
// Values reflect the true parameters from channels.py.
const CHANNEL_INFO = {
  1: {
    what: "Tech influencers — YouTube reviewers & Twitter personalities",
    ctr:  "4.5% — high click rate",
    roas: "2.8× return on spend",
    cac:  "$120 per customer",
    note: "Strong awareness driver. High clicks, moderate purchase conversion.",
  },
  2: {
    what: "Design & aesthetic influencers — Figma creators, creative Twitter",
    ctr:  "3.0% — solid engagement",
    roas: "3.5× return on spend",
    cac:  "$145 per customer",
    note: "High-intent design buyers. Good brand fit for Nothing's aesthetic.",
  },
  3: {
    what: "Broad-reach lifestyle influencers — general audience",
    ctr:  "2.0% — below average",
    roas: "1.8× return on spend",
    cac:  "$220 per customer — most expensive",
    note: "Low purchase intent. The bandit learns to de-prioritise this quickly.",
  },
  4: {
    what: "Paid placements in Instagram feeds and Stories",
    ctr:  "2.5% — moderate",
    roas: "2.5× return on spend",
    cac:  "$175 per customer",
    note: "Consistent but unexceptional. Good for brand visibility in SEA.",
  },
  5: {
    what: "Short-form video ads on TikTok",
    ctr:  "5.5% — highest click rate",
    roas: "1.5× return — lowest",
    cac:  "$200 per customer",
    note: "Viral reach drives clicks but converts poorly. High volume, low quality.",
  },
  6: {
    what: "Search ads shown to people actively looking for phones",
    ctr:  "1.5% — lower click rate",
    roas: "4.2× return — best",
    cac:  "$90 per customer — cheapest",
    note: "Captures high-intent buyers. Best ROAS and CAC. The efficiency winner.",
  },
};

// ---------------------------------------------------------------------------
// Small UI primitives
// ---------------------------------------------------------------------------

// spinning=true renders a tiny CSS spinner inside the button instead of text content.
function Btn({ onClick, disabled, variant = "default", children, title, spinning = false }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    border: "1px solid",
    borderRadius: "3px",
    fontFamily: "inherit",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 200ms ease",
    outline: "none",
    opacity: disabled ? 0.4 : 1,
    whiteSpace: "nowrap",
  };

  const variants = {
    default: {
      background: "transparent",
      borderColor: "#333",
      color: "#A0A0A0",
    },
    primary: {
      background: "#1A1A1A",
      borderColor: "#444",
      color: "#F0F0F0",
    },
    danger: {
      background: "transparent",
      borderColor: "#FF0000",
      color: "#FF0000",
    },
    active: {
      background: "#FF0000",
      borderColor: "#FF0000",
      color: "#FFFFFF",
    },
    shock: {
      background: "rgba(255,0,0,0.08)",
      borderColor: "rgba(255,0,0,0.4)",
      color: "#FF6666",
    },
  };

  return (
    <button
      style={{ ...base, ...variants[variant] }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = variant === "danger" || variant === "shock" ? "#FF4444" : "#666";
          e.currentTarget.style.color = variant === "danger" || variant === "shock" ? "#FF4444" : "#F0F0F0";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          Object.assign(e.currentTarget.style, variants[variant]);
        }
      }}
    >
      {spinning ? (
        <span style={{
          display: "inline-block",
          width: "10px", height: "10px",
          border: "1.5px solid rgba(255,255,255,0.2)",
          borderTopColor: "#F0F0F0",
          borderRadius: "50%",
          animation: "spin 500ms linear infinite",
        }} />
      ) : children}
    </button>
  );
}

function ShockBanner({ shock, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, [shock]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 400);
  };

  if (!shock) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? "0" : "-120px"})`,
        zIndex: 1000,
        maxWidth: "640px",
        width: "calc(100% - 48px)",
        background: "#1A0A0A",
        border: "1px solid #FF0000",
        borderRadius: "4px",
        padding: "16px 20px",
        boxShadow: "0 0 40px rgba(255,0,0,0.2)",
        transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
        <div style={{ flex: 1 }}>
          {/* Pulse dot */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#FF0000",
                animation: "pulse 1.5s infinite",
                flexShrink: 0,
              }}
            />
            <span style={{
              fontFamily: "Ndot55, monospace",
              fontSize: "13px",
              color: "#FF4444",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              {shock.name}
            </span>
          </div>
          <p style={{
            fontSize: "12px",
            color: "#C0C0C0",
            lineHeight: "1.6",
            marginBottom: "10px",
          }}>
            {shock.description}
          </p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "#888", letterSpacing: "0.05em" }}>
              AFFECTS: <span style={{ color: "#E0A0A0" }}>
                {shock.affected_channels?.join(", ") || shock.affected_channel_names?.join(", ")}
              </span>
            </span>
            <span style={{ fontSize: "11px", color: "#888", letterSpacing: "0.05em" }}>
              DURATION: <span style={{ color: "#E0A0A0" }}>
                {shock.duration_days || shock.days_remaining} DAYS
              </span>
            </span>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
            padding: "2px 4px",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#FF4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Floating info card for the channel legend — shows plain-English parameters on hover.
function ChannelTooltip({ channelId, x, y }) {
  if (!channelId) return null;
  const info  = CHANNEL_INFO[channelId];
  const color = CHANNEL_COLORS[channelId];
  const name  = CHANNEL_NAMES[channelId];
  if (!info) return null;

  return (
    <div style={{
      position: "fixed",
      left: `${x}px`,
      top:  `${y}px`,
      zIndex: 600,
      background: "#161616",
      border: `1px solid ${color}44`,
      borderRadius: "4px",
      padding: "12px 14px",
      width: "220px",
      fontFamily: "LetteraMonoLL, monospace",
      boxShadow: "0 4px 20px rgba(0,0,0,0.55)",
      pointerEvents: "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: "11px", color: "#E0E0E0", letterSpacing: "0.05em" }}>{name}</span>
      </div>
      <div style={{ fontSize: "10px", color: "#888", marginBottom: "10px", lineHeight: "1.5" }}>
        {info.what}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "10px" }}>
        <div style={{ fontSize: "9px", color: "#666" }}>
          Click Rate: <span style={{ color: "#C0C0C0" }}>{info.ctr}</span>
        </div>
        <div style={{ fontSize: "9px", color: "#666" }}>
          Ad Return: <span style={{ color: "#C0C0C0" }}>{info.roas}</span>
        </div>
        <div style={{ fontSize: "9px", color: "#666" }}>
          Acq. Cost: <span style={{ color: "#C0C0C0" }}>{info.cac}</span>
        </div>
      </div>
      <div style={{ fontSize: "9px", color: "#555", borderTop: "1px solid #1E1E1E", paddingTop: "8px", lineHeight: "1.6" }}>
        {info.note}
      </div>
    </div>
  );
}

// Full-screen overlay — only shown for multi-day ops (week/month), not for single-day clicks.
// Single-day (+1 Day) shows an inline spinner inside the button instead.
function LoadingOverlay({ visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(13,13,13,0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 500,
      backdropFilter: "blur(2px)",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "32px",
          height: "32px",
          border: "2px solid #333",
          borderTopColor: "var(--color-accent)",
          borderRadius: "50%",
          animation: "spin 600ms linear infinite",
          margin: "0 auto 16px",
        }} />
        <p style={{ fontSize: "11px", color: "#666", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Simulating...
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [results, setResults] = useState([]);
  const [banditStates, setBanditStates] = useState([]);
  const [currentDay, setCurrentDay] = useState(0);   // highest simulated day
  const [viewDay, setViewDay] = useState(0);          // slider position (replay cursor)
  // isLoadingDays: how many days the current simulate call is for.
  // 0 = idle, 1 = +1 Day (inline spinner only), >1 = full overlay for multi-day ops.
  const [isLoadingDays, setIsLoadingDays] = useState(0);
  const [simulatingLabel, setSimulatingLabel] = useState("");  // inline status text
  const [autoRunning, setAutoRunning] = useState(false);
  const [activeShock, setActiveShock] = useState(null);
  const [shockEvents, setShockEvents] = useState([]);
  const [error, setError] = useState(null);
  const [shockPending, setShockPending] = useState(false);
  const [shocksExhausted, setShocksExhausted] = useState(false);
  const [channelTooltip, setChannelTooltip] = useState(null);  // { channelId, x, y }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // null = unknown (mount not yet complete); true = show landing; false = show dashboard.
  const [showLanding, setShowLanding] = useState(null);
  // true = guided tour is active (triggered by "Get Started" on landing page).
  const [tourActive, setTourActive] = useState(false);
  // Ref so auto interval always reads current settings without stale closure.
  const settingsRef = useRef(DEFAULT_SETTINGS);
  // Ref for scrolling into view after shock banner dismiss.
  const shockPanelRef = useRef(null);
  const autoIntervalRef   = useRef(null);
  const sequentialRunning = useRef(false);  // true while +1Wk / +1Mo sequential loop is running
  const loadingRef        = useRef(false);
  const currentDayRef     = useRef(0);
  const viewDayRef        = useRef(0);      // ref so slider onChange can read it without stale closure

  // Load existing data on mount so charts restore after page refresh.
  // Uses /api/state (single round-trip) instead of three parallel GETs —
  // on serverless (Vercel) this avoids 3 separate cold-starts on page load.
  useEffect(() => {
    async function load() {
      try {
        const { results: res, bandit_states: states, active_shocks: shocks, current_day: stateDay } = await getState();
        setResults(res);
        setBanditStates(states);
        if (res.length > 0) {
          const maxDay = Math.max(...res.map((r) => r.day));
          setCurrentDay(maxDay);
          setViewDay(maxDay);
          currentDayRef.current = maxDay;
          viewDayRef.current    = maxDay;
          setShowLanding(false);  // existing data — skip landing
        } else {
          setShowLanding(true);   // day 0 — show landing
        }
        if (shocks.length > 0) {
          // Enrich each restored shock with a stable endDay computed from the current
          // simulation day + days_remaining. days_remaining in the DB decrements each tick,
          // so we must pin endDay at load time to prevent it drifting as simulation runs.
          const enriched = shocks.map(s => ({
            ...s,
            endDay: s.endDay ?? (stateDay + s.days_remaining - 1),
          }));
          setShockEvents(enriched);
          setActiveShock(enriched[enriched.length - 1]);  // show most recent
        }
      } catch (e) {
        // AbortError = 10s timeout fired — backend is running but not responding.
        // Everything else (TypeError "Failed to fetch") = backend is not running at all.
        const msg = e.name === "AbortError"
          ? "Backend not responding after 10s. Restart uvicorn on port 8000."
          : "Backend unreachable. Start: cd backend && uvicorn api:app --reload --port 8000";
        setError(msg);
        setShowLanding(false);  // don't block on error — show dashboard with error bar
      }
    }
    load();
  }, []);

  // Stop auto-run if campaign is complete.
  useEffect(() => {
    if (currentDay >= MAX_DAYS && autoRunning) {
      stopAuto();
    }
  }, [currentDay, autoRunning]);

  // Auto-mode fetcher — one API call per tick, no loading overlay.
  // Reads settings via ref so the closure is always fresh without needing re-creation.
  const fetchAndMerge = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await simulate(1, settingsRef.current);
      setResults((prev) => [...prev, ...response.new_rows]);
      setBanditStates(response.bandit_states);
      setCurrentDay(response.current_day);
      currentDayRef.current = response.current_day;
      setViewDay(response.current_day);
      viewDayRef.current = response.current_day;
    } catch (e) {
      setError(e.message);
      setAutoRunning(false);
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // Simulate handler — ONE backend call for any n_days, then replays the returned rows
  // client-side one day at a time for smooth chart animation. This avoids the latency of
  // making 28+ separate API calls for +1 Month while still giving day-by-day visual updates.
  const handleSimulate = useCallback(async (nDays) => {
    if (sequentialRunning.current || loadingRef.current || currentDayRef.current >= MAX_DAYS) return;
    sequentialRunning.current = true;
    const safe = Math.min(nDays, MAX_DAYS - currentDayRef.current);

    // Single backend call — backend simulates all days at once.
    loadingRef.current = true;
    setIsLoadingDays(safe);
    setError(null);
    setSimulatingLabel(safe === 1 ? "" : `Simulating ${safe} days…`);
    let response;
    try {
      response = await simulate(safe, settingsRef.current);
    } catch (e) {
      setError(e.message);
      loadingRef.current = false;
      setIsLoadingDays(0);
      sequentialRunning.current = false;
      return;
    }
    loadingRef.current = false;
    setIsLoadingDays(0);
    setSimulatingLabel("");
    setBanditStates(response.bandit_states);

    // Client-side replay — group the returned rows by day, add one day at a time.
    // No extra API calls: we already have all the data, just staggering the state updates.
    const byDay = new Map();
    response.new_rows.forEach((r) => {
      if (!byDay.has(r.day)) byDay.set(r.day, []);
      byDay.get(r.day).push(r);
    });
    const days = Array.from(byDay.keys()).sort((a, b) => a - b);
    // Replay speed per day: +1 Day = instant, +1 Week = 500ms (slow, visible), +1 Month = 50ms (fast).
    const gapMs = safe <= 1 ? 0 : safe <= 7 ? 500 : 50;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      setResults((prev) => [...prev, ...byDay.get(day)]);
      setCurrentDay(day);
      currentDayRef.current = day;
      setViewDay(day);
      viewDayRef.current = day;
      if (gapMs > 0 && i < days.length - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
    sequentialRunning.current = false;
  }, []);

  // stopAuto is defined before startAuto so startAuto's closure can reference it.
  const stopAuto = useCallback(() => {
    setAutoRunning(false);
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
  }, []);

  const startAuto = () => {
    if (autoRunning || currentDayRef.current >= MAX_DAYS) return;
    setAutoRunning(true);
    // Use settingsRef.current so we pick up the latest autoIntervalMs without stale closure.
    const ms = settingsRef.current.autoIntervalMs;
    autoIntervalRef.current = setInterval(() => {
      if (currentDayRef.current >= MAX_DAYS) { stopAuto(); return; }
      if (sequentialRunning.current) return;
      fetchAndMerge();
    }, ms);
  };

  const handleAutoToggle = () => {
    autoRunning ? stopAuto() : startAuto();
  };

  // Ref-wrap handleAutoToggle so the keyboard handler always calls the current version
  // without needing to re-register the event listener on every render.
  const handleAutoToggleRef = useRef(handleAutoToggle);
  useEffect(() => { handleAutoToggleRef.current = handleAutoToggle; });

  // Keep settingsRef in sync with state so closures (fetchAndMerge, startAuto) always see latest.
  // When auto is running and the interval changes, briefly show a "speed change on next start" note.
  useEffect(() => {
    const prevMs = settingsRef.current.autoIntervalMs;
    settingsRef.current = settings;
    if (autoRunning && settings.autoIntervalMs !== prevMs) {
      setSimulatingLabel("speed change on next start");
      const t = setTimeout(() => setSimulatingLabel(""), 2500);
      return () => clearTimeout(t);
    }
  }, [settings, autoRunning]);

  // Keyboard shortcuts — Space, →, ←, Shift+→.
  // Guards: skip when focus is on an input/textarea, or when the tour is active.
  // Uses refs for all callbacks so the listener never goes stale between tourActive changes.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tourActive) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleAutoToggleRef.current();      // always fresh via ref — no stale closure
      } else if (e.code === "ArrowRight" && e.shiftKey) {
        setViewDay(currentDayRef.current);
        viewDayRef.current = currentDayRef.current;
      } else if (e.code === "ArrowRight") {
        if (!loadingRef.current && currentDayRef.current < MAX_DAYS) handleSimulate(1);
      } else if (e.code === "ArrowLeft") {
        setViewDay((d) => {
          const next = Math.max(1, d - 1);
          viewDayRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // handleSimulate is a stable useCallback — safe to omit. tourActive is the only reactive dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive]);

  const handleShock = async () => {
    if (shockPending || shocksExhausted) return;
    setShockPending(true);
    try {
      const event = await triggerShock();
      setActiveShock(event);
      // Pin endDay at trigger time (triggered_on_day + duration - 1) so the impact panel
      // shows a stable range even as days_remaining decrements in the DB.
      setShockEvents((prev) => [...prev, {
        ...event,
        triggered_on_day: currentDay,
        endDay: currentDay + (event.duration_days ?? 14) - 1,
      }]);
    } catch (e) {
      // 409 = all unique events used up — disable the button rather than showing an error bar.
      if (e.message?.includes("409") || e.message?.includes("SHOCKS_EXHAUSTED")) {
        setShocksExhausted(true);
      } else {
        setError(e.message);
      }
    } finally {
      setShockPending(false);
    }
  };

  const handleReset = async () => {
    stopAuto();
    setIsLoadingDays(7);  // show overlay during reset
    try {
      await reset();
      setResults([]);
      setBanditStates([]);
      setCurrentDay(0);
      setViewDay(0);
      currentDayRef.current     = 0;
      viewDayRef.current        = 0;
      loadingRef.current        = false;
      sequentialRunning.current = false;
      setActiveShock(null);
      setShockEvents([]);
      setShocksExhausted(false);
      setShowLanding(true);   // return to landing after reset
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoadingDays(0);
    }
  };

  const campaignProgress = Math.min((currentDay / MAX_DAYS) * 100, 100);

  // Filter results to the slider cursor — enables replay without re-simulating.
  const visibleResults = useMemo(
    () => results.filter((r) => r.day <= viewDay),
    [results, viewDay]
  );
  const isReplaying = viewDay < currentDay && currentDay > 0;


  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Landing page is shown on first load (day 0). After Reset it reappears.
  // null = initial fetch in-flight. Show a loading screen so the user doesn't
  // see a blank page while waiting for /api/state (hung backend = infinite blank).
  if (showLanding === null) {
    return (
      <div style={{
        position:       "fixed",
        inset:          0,
        background:     "#0D0D0D",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}>
        <style>{`
          @keyframes nbPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.35; transform: scale(1.5); }
          }
        `}</style>
        <div style={{
          width:        "10px",
          height:       "10px",
          borderRadius: "50%",
          background:   "#FF0000",
          animation:    "nbPulse 1.4s ease-in-out infinite",
        }} />
      </div>
    );
  }
  if (showLanding) {
    return (
      <LandingPage
        onStart={() => setShowLanding(false)}
        onGetStarted={() => { setTourActive(true); setShowLanding(false); }}
        onSimulate={handleSimulate}
      />
    );
  }

  return (
    <>
      {/* Global keyframe animations */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.3); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dayGlow {
          0%   { filter: brightness(0.6) blur(0.5px); transform: scale(0.94) translateY(3px); }
          35%  { filter: brightness(2) drop-shadow(0 0 10px rgba(255,255,255,0.65)); transform: scale(1.07) translateY(0); }
          100% { filter: brightness(1); transform: scale(1) translateY(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        input[type="range"].timeline-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 2px;
          border-radius: 1px;
          outline: none;
          cursor: pointer;
        }
        input[type="range"].timeline-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #FF0000;
          cursor: pointer;
          transition: transform 150ms ease;
        }
        input[type="range"].timeline-slider:hover::-webkit-slider-thumb {
          transform: scale(1.5);
        }
        input[type="range"].timeline-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #FF0000;
          border: none;
          cursor: pointer;
        }
        input[type="range"].timeline-slider::-moz-range-track {
          height: 2px;
          border-radius: 1px;
        }
      `}</style>

      {/* Shock banner — dismissing scrolls to the impact panel below */}
      {activeShock && (
        <ShockBanner
          shock={activeShock}
          onDismiss={() => {
            setActiveShock(null);
            shockPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onUpdate={setSettings}
        onClose={() => setSettingsOpen(false)}
        onReset={() => setSettings(DEFAULT_SETTINGS)}
      />

      {/* Guided tour — triggered by "Get Started" on landing page */}
      <GuidedTour show={tourActive} onDone={() => setTourActive(false)} />

      {/* Full-screen overlay only for multi-day operations (week/month) */}
      <LoadingOverlay visible={isLoadingDays > 1} />

      {/* Channel legend tooltip */}
      {channelTooltip && <ChannelTooltip {...channelTooltip} />}

      {/* Page wrapper */}
      <div style={{
        minHeight: "100vh",
        padding: "0 0 64px 0",
        background: "var(--color-bg)",
      }}>

        {/* ----------------------------------------------------------------
            Header
            ---------------------------------------------------------------- */}
        <header style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(13,13,13,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-border)",
          padding: "0 32px",
        }}>
          <div style={{
            maxWidth: "1600px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "60px",
            gap: "24px",
          }}>
            {/* Brand */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
              {/* Nothing dot logo — pulses red during auto mode */}
              <div style={{
                position: "relative",
                width: "10px",
                height: "10px",
                flexShrink: 0,
              }}>
                {autoRunning && (
                  <div style={{
                    position: "absolute",
                    inset: "-4px",
                    borderRadius: "50%",
                    background: "#FF0000",
                    animation: "shockRing 1.2s ease-out infinite",
                  }} />
                )}
                <div style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#FF0000",
                  position: "relative",
                  zIndex: 1,
                }} />
              </div>
              <div>
                <div style={{
                  fontFamily: "Ndot55, monospace",
                  fontSize: "14px",
                  color: "#F0F0F0",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}>
                  Nothing Bandit™
                </div>
                <div style={{
                  fontSize: "10px",
                  color: "#555",
                  letterSpacing: "0.08em",
                  marginTop: "2px",
                }}>
                  Budget Allocation System
                </div>
              </div>
            </div>

            {/* Campaign timeline — progress bar IS the slider */}
            <div style={{
              flex: 1,
              maxWidth: "400px",
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            }}>
              {/* Top row: label + day counter + replay controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Campaign
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {isReplaying && (
                    <>
                      <span style={{
                        fontSize: "9px",
                        color: "#FF6666",
                        letterSpacing: "0.1em",
                        border: "1px solid rgba(255,100,100,0.3)",
                        padding: "2px 5px",
                        borderRadius: "2px",
                        fontFamily: "LetteraMonoLL, monospace",
                      }}>REPLAY</span>
                      <button
                        onClick={() => { setViewDay(currentDay); viewDayRef.current = currentDay; }}
                        style={{
                          background: "none", border: "1px solid #2A2A2A", color: "#666",
                          fontSize: "9px", letterSpacing: "0.08em", padding: "2px 7px",
                          borderRadius: "2px", cursor: "pointer", textTransform: "uppercase",
                          fontFamily: "LetteraMonoLL, monospace",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#999"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2A2A2A"; e.currentTarget.style.color = "#666"; }}
                      >NOW →</button>
                    </>
                  )}
                  {/* key={currentDay} causes React to re-mount this span on each day change,
                      restarting the CSS animation from 0% every time. */}
                  <span
                    key={currentDay}
                    style={{
                      fontFamily: "Ndot55, monospace",
                      fontSize: "18px",
                      color: currentDay === 0 ? "#444" : isReplaying ? "#FF6666" : "#F0F0F0",
                      letterSpacing: "0.06em",
                      transition: "color 300ms",
                      display: "inline-block",  // required for transform in dayGlow
                      // Only glow on manual +1 Day clicks — not during auto (too noisy) or replay.
                      animation: currentDay > 0 && !isReplaying && !autoRunning ? "dayGlow 600ms ease-out forwards" : "none",
                    }}
                  >
                    {currentDay === 0 ? "---" : isReplaying ? `D${viewDay}` : `DAY ${currentDay}`}
                  </span>
                </div>
              </div>

              {/* Interactive timeline slider — replaces static progress bar.
                  Three-zone background: viewed | simulated-not-viewed | unsimulated */}
              {currentDay > 0 ? (
                <input
                  type="range"
                  className="timeline-slider"
                  min={1}
                  max={MAX_DAYS}
                  value={viewDay || 1}
                  title="Drag to replay past days"
                  onChange={(e) => {
                    // Clamp to simulated days — can't replay what hasn't happened yet.
                    const d = Math.min(Number(e.target.value), currentDay);
                    setViewDay(d);
                    viewDayRef.current = d;
                  }}
                  style={{
                    width: "100%",
                    background: (() => {
                      const vPct = (viewDay / MAX_DAYS) * 100;
                      const cPct = (currentDay / MAX_DAYS) * 100;
                      if (currentDay >= MAX_DAYS) return "#FF0000";
                      const fillColor = isReplaying ? "#FF4444"
                        : autoRunning ? "#22D3EE" : "#3A3A3A";
                      const simulatedColor = isReplaying ? "rgba(255,68,68,0.18)" : "#232323";
                      return `linear-gradient(90deg, ${fillColor} ${vPct}%, ${simulatedColor} ${vPct}%, ${simulatedColor} ${cPct}%, #1A1A1A ${cPct}%)`;
                    })(),
                  }}
                />
              ) : (
                <div style={{ height: "2px", background: "#1A1A1A", borderRadius: "1px" }} />
              )}

              {/* Bottom row: D1 ... D183 */}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>D1</span>
                <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>D{MAX_DAYS}</span>
              </div>
            </div>

            {/* Controls */}
            <div data-tour="controls" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {/* Inline status — always occupies space so buttons don't shift on load/idle toggle */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "6px",
                width: "130px",   // fixed width — prevents layout shift
                flexShrink: 0,
              }}>
                <div style={{
                  width: "10px", height: "10px",
                  border: "1px solid #444",
                  borderTopColor: autoRunning ? "var(--color-info)" : "var(--color-text)",
                  borderRadius: "50%",
                  animation: (isLoadingDays > 1 || autoRunning) ? "spin 500ms linear infinite" : "none",
                  flexShrink: 0,
                  opacity: (isLoadingDays > 1 || autoRunning) ? 1 : 0,
                  transition: "opacity 200ms",
                }} />
                <span style={{
                  fontSize: "10px", color: "#555",
                  letterSpacing: "0.06em", whiteSpace: "nowrap",
                  fontFamily: "LetteraMonoLL, monospace",
                  opacity: (isLoadingDays > 1 || autoRunning) && simulatingLabel ? 1 : 0,
                  transition: "opacity 200ms",
                }}>
                  {simulatingLabel || "\u00A0"}
                </span>
              </div>
              {/* +1 Day: inline spinner instead of full-screen overlay */}
              <Btn
                onClick={() => handleSimulate(1)}
                disabled={isLoadingDays > 0 || currentDay >= MAX_DAYS}
                variant="primary"
                title="Simulate 1 day  [→]"
                spinning={isLoadingDays === 1}
              >
                +1 Day
              </Btn>
              <Btn
                onClick={() => handleSimulate(7)}
                disabled={isLoadingDays > 0 || currentDay >= MAX_DAYS}
                variant="primary"
                title="Simulate 1 week"
              >
                +1 Wk
              </Btn>
              <Btn
                onClick={() => handleSimulate(30)}
                disabled={isLoadingDays > 0 || currentDay >= MAX_DAYS}
                variant="primary"
                title="Simulate 1 month"
              >
                +1 Mo
              </Btn>
              <Btn
                onClick={handleAutoToggle}
                disabled={currentDay >= MAX_DAYS}
                variant={autoRunning ? "active" : "primary"}
                title="Auto-run — speed set in Settings  [Space]"
              >
                {autoRunning ? "■ Stop" : "▶ Auto"}
              </Btn>

              {/* Divider */}
              <div style={{ width: "1px", height: "24px", background: "#282828" }} />

              <Btn
                onClick={handleShock}
                disabled={isLoadingDays > 0 || shockPending || shocksExhausted}
                variant="shock"
                title={shocksExhausted ? "All 10 shock events used — Reset to replay" : "Trigger a random market shock event"}
              >
                {shockPending ? "..." : shocksExhausted ? "⚡ Exhausted" : "⚡ Shock"}
              </Btn>
              <Btn
                onClick={handleReset}
                disabled={isLoadingDays > 0}
                variant="danger"
                title="Reset simulation to day 0"
              >
                Reset
              </Btn>

              {/* Divider */}
              <div style={{ width: "1px", height: "24px", background: "#282828" }} />

              {/* ? keyboard shortcuts help icon */}
              <div style={{ position: "relative" }}>
                <button
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "28px", height: "28px",
                    background: "transparent",
                    border: "1px solid #222",
                    borderRadius: "50%", cursor: "pointer",
                    color: "#555", fontSize: "11px",
                    fontFamily: "LetteraMonoLL, monospace",
                    transition: "all 200ms",
                  }}
                  title="Keyboard shortcuts"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#444";
                    e.currentTarget.style.color = "#C0C0C0";
                    e.currentTarget.nextSibling.style.opacity = "1";
                    e.currentTarget.nextSibling.style.pointerEvents = "none";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#222";
                    e.currentTarget.style.color = "#555";
                    e.currentTarget.nextSibling.style.opacity = "0";
                  }}
                >
                  ?
                </button>
                {/* Keyboard shortcuts tooltip — appears on ? hover */}
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  background: "#161616",
                  border: "1px solid #2A2A2A",
                  borderRadius: "4px",
                  padding: "10px 14px",
                  fontFamily: "LetteraMonoLL, monospace",
                  fontSize: "10px",
                  color: "#888",
                  whiteSpace: "nowrap",
                  lineHeight: "2",
                  opacity: 0,
                  transition: "opacity 150ms",
                  zIndex: 300,
                  pointerEvents: "none",
                }}>
                  <div style={{ color: "#555", fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>Keyboard Shortcuts</div>
                  <div><span style={{ color: "#C0C0C0" }}>Space</span> · ▶/■ Auto play/pause</div>
                  <div><span style={{ color: "#C0C0C0" }}>→</span> · +1 Day</div>
                  <div><span style={{ color: "#C0C0C0" }}>←</span> · Replay back 1 day</div>
                  <div><span style={{ color: "#C0C0C0" }}>Shift+→</span> · Jump to current day</div>
                </div>
              </div>

              {/* Settings button */}
              <button
                onClick={() => setSettingsOpen(true)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "32px", height: "32px",
                  background: settingsOpen ? "#1E1E1E" : "transparent",
                  border: `1px solid ${settingsOpen ? "#444" : "#282828"}`,
                  borderRadius: "3px", cursor: "pointer", color: "#666",
                  fontSize: "14px", transition: "all 200ms",
                }}
                title="Settings"
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#C0C0C0"; }}
                onMouseLeave={(e) => {
                  if (!settingsOpen) {
                    e.currentTarget.style.borderColor = "#282828";
                    e.currentTarget.style.color = "#666";
                  }
                }}
              >
                ⚙
              </button>
            </div>
          </div>

        </header>

        {/* Error bar */}
        {error && (
          <div style={{
            background: "rgba(255,0,0,0.08)",
            borderBottom: "1px solid rgba(255,0,0,0.3)",
            padding: "10px 32px",
            fontSize: "11px",
            color: "#FF6666",
            letterSpacing: "0.04em",
          }}>
            {error}
          </div>
        )}

        {/* ----------------------------------------------------------------
            Main content — always rendered; charts show day 0 state when empty
            ---------------------------------------------------------------- */}
        <main style={{
          maxWidth: "1600px",
          margin: "0 auto",
          padding: "32px 32px 0",
        }}>
          {/* Day 0 call-to-action — shown instead of blank charts */}
          {currentDay === 0 && isLoadingDays === 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              marginBottom: "24px",
              background: "#111",
              border: "1px solid #1E1E1E",
              borderRadius: "4px",
              animation: "fadeIn 400ms ease",
            }}>
              <div>
                <span style={{
                  fontFamily: "Ndot55, monospace", fontSize: "13px",
                  color: "#444", letterSpacing: "0.08em",
                }}>
                  DAY 0 · AWAITING SIMULATION
                </span>
                <span style={{ fontSize: "11px", color: "#333", marginLeft: "16px" }}>
                  All metrics at baseline. Click +1 Day or ▶ Auto to begin.
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Btn onClick={() => handleSimulate(1)} variant="primary">+1 Day</Btn>
                <Btn onClick={handleAutoToggle} variant="primary">▶ Auto</Btn>
              </div>
            </div>
          )}

            {/* Channel legend — shared across all charts */}
            <div style={{
              display: "flex",
              gap: "20px",
              flexWrap: "wrap",
              marginBottom: "28px",
              padding: "12px 16px",
              background: "#111",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              alignItems: "center",
            }}>
              <span style={{ fontSize: "10px", color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Channels
              </span>
              {Object.entries(CHANNEL_NAMES).map(([id, name]) => (
                <div
                  key={id}
                  style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "default" }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setChannelTooltip({ channelId: Number(id), x: rect.left, y: rect.bottom + 8 });
                  }}
                  onMouseLeave={() => setChannelTooltip(null)}
                >
                  <div style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: CHANNEL_COLORS[id],
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: "11px", color: "#888" }}>{name}</span>
                </div>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "20px", height: "2px", background: "#4ADE80" }} />
                  <span style={{ fontSize: "11px", color: "#888" }}>Bandit</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: "20px",
                    height: "2px",
                    background: "repeating-linear-gradient(90deg, #505050 0, #505050 4px, transparent 4px, transparent 8px)",
                  }} />
                  <span style={{ fontSize: "11px", color: "#888" }}>Static</span>
                </div>
              </div>
            </div>

            {/* Shock impact cards — one card per shock, persists until Reset */}
            <div ref={shockPanelRef}>
              <ShockImpactPanel
                shockEvents={shockEvents}
                results={visibleResults}
                viewDay={viewDay}
              />
            </div>

            {/* Section label — data-tour anchors the spotlight to this slim element */}
            <div
              data-tour="allocation-grid"
              style={{
                fontSize: "10px",
                color: "#555",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "12px",
                paddingLeft: "2px",
              }}
            >
              3 Parallel Bandits — each optimising a different objective function independently
            </div>

            {/* 3-column grid — one column per objective */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "1px",
              background: "var(--color-border)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              overflow: "hidden",
              marginBottom: "32px",
            }}>
              {OBJECTIVES.map((obj) => (
                <div key={obj} style={{ background: "var(--color-bg)" }}>
                  {/* Objective header — short code large, full name below */}
                  <div style={{
                    padding: "16px 20px 12px",
                    borderBottom: "1px solid var(--color-border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                      <span style={{
                        fontFamily: "Ndot55, monospace",
                        fontSize: "18px",
                        color: "#F0F0F0",
                        letterSpacing: "0.12em",
                      }}>
                        {OBJECTIVE_SHORT[obj]}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
                      {OBJECTIVE_LABELS[obj]}
                    </div>
                    <div style={{ fontSize: "10px", color: "#5A5A5A", marginTop: "2px" }}>
                      {OBJECTIVE_DESCRIPTIONS[obj]}
                    </div>
                  </div>

                  {/* Budget allocation chart */}
                  <div style={{ padding: "16px 20px 0" }}>
                    <div style={{ fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>
                      Budget Allocation
                    </div>
                    <BudgetAllocationChart
                      results={visibleResults}
                      objective={obj}
                      shockEvents={shockEvents}
                      currentDay={viewDay}
                    />
                  </div>

                  {/* Bandit vs static chart */}
                  <div style={{ padding: "0 20px 20px" }}>
                    <div style={{ fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px", marginTop: "20px" }}>
                      Bandit vs Static
                      {/* Inline metric descriptor — one per objective column */}
                      <span style={{ color: "#444", textTransform: "none", letterSpacing: 0, marginLeft: "6px", fontSize: "9px" }}>
                        — running {obj === "cac" ? "CAC" : obj === "roas" ? "ROAS" : "avg CTR"} (cumulative)
                      </span>
                    </div>
                    <BanditVsStaticChart
                      results={visibleResults}
                      objective={obj}
                      shockEvents={shockEvents}
                      currentDay={viewDay}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Business Outcomes — full width, with objective toggle */}
            <section style={{ marginBottom: "32px" }}>
              <div
                data-tour="business-outcomes"
                style={{
                  fontSize: "10px",
                  color: "#555",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "16px",
                  paddingLeft: "2px",
                }}
              >
                Business Outcomes — Bandit vs Static Baseline
              </div>
              <BusinessMetricsChart
                results={visibleResults}
                currentDay={viewDay}
              />
            </section>

            {/* Bandit Confidence — 3 panels at bottom */}
            <section style={{ marginBottom: "32px" }}>
              <div style={{
                fontSize: "10px",
                color: "#555",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "4px",
                paddingLeft: "2px",
              }}>
                Bandit Confidence — how certain the bandit is about each channel
              </div>
              {/* Interpretation note */}
              <p style={{
                fontSize: "11px",
                color: "#5A5A5A",
                marginBottom: "16px",
                paddingLeft: "2px",
                lineHeight: "1.7",
              }}>
                Each curve is the Beta(α, β) posterior for one channel under a given objective.
                A <span style={{ color: "#888" }}>tall narrow peak</span> = high confidence the channel performs well.
                A <span style={{ color: "#888" }}>flat wide curve</span> = still exploring (few observations).
                The dashed line marks the distribution mode (most likely true reward rate).
                Over time, winning channels converge to sharp peaks near 1; losers flatten near 0.
                {" "}<span style={{ color: "#444" }}>
                  The Reward Thresholds in ⚙ Settings control what counts as a win — raising
                  a threshold makes posteriors flatter and pushes the bandit to explore more.
                </span>
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "1px",
                background: "var(--color-border)",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                overflow: "hidden",
              }}>
                {OBJECTIVES.map((obj) => (
                  <div key={obj} style={{ background: "var(--color-bg)", padding: "16px 20px" }}>
                    <div style={{
                      fontSize: "11px",
                      color: "#888",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}>
                      <span style={{ color: "#444" }}>Beta(α,β) ·</span>
                      <span>{OBJECTIVE_SHORT[obj]}</span>
                      <span style={{ color: "#333", fontFamily: "LetteraMonoLL, monospace", fontSize: "10px" }}>
                        — {OBJECTIVE_LABELS[obj]}
                      </span>
                    </div>
                    <BanditConfidenceChart
                      banditStates={banditStates}
                      objective={obj}
                    />
                  </div>
                ))}
              </div>
            </section>

          </main>
      </div>
    </>
  );
}
