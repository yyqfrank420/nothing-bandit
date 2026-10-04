import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

export const CHANNEL_COLORS = {
  1: "#F97316",
  2: "#A78BFA",
  3: "#4ECDC4",
  4: "#E879A0",
  5: "#22D3EE",
  6: "#4ADE80",
};

export const CHANNEL_NAMES = {
  1: "Tech KOL",
  2: "Design KOL",
  3: "Generic KOL",
  4: "Instagram Ads",
  5: "TikTok Ads",
  6: "Google Search",
};

const MAX_DAYS = 183;

// Baseline metric values match channels.py.
const CHANNEL_INFO = {
  1: {
    what: "Technology influencers",
    ctr:  "4.5%",
    roas: "2.8× return on spend",
    cac:  "$120 per customer",
  },
  2: {
    what: "Design influencers",
    ctr:  "3.0%",
    roas: "3.5× return on spend",
    cac:  "$145 per customer",
  },
  3: {
    what: "Lifestyle influencers with broad audiences",
    ctr:  "2.0%",
    roas: "1.8× return on spend",
    cac:  "$220 per customer",
  },
  4: {
    what: "Paid placements in Instagram feeds and Stories",
    ctr:  "2.5%",
    roas: "2.5× return on spend",
    cac:  "$175 per customer",
  },
  5: {
    what: "Short-form video ads on TikTok",
    ctr:  "5.5%",
    roas: "1.5× return on spend",
    cac:  "$200 per customer",
  },
  6: {
    what: "Search ads shown to people actively looking for phones",
    ctr:  "1.5%",
    roas: "4.2× return on spend",
    cac:  "$90 per customer",
  },
};

function Btn({ onClick, disabled, variant = "default", children, title, spinning = false }) {
  return (
    <button className={`dashboard-button dashboard-button--${variant}`}
      aria-busy={spinning || undefined} onClick={onClick} disabled={disabled} title={title}>
      {spinning && <span className="loading-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

function ShockBanner({ shock, onDismiss, onViewImpact }) {
  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => { clearTimeout(timer); clearTimeout(dismissTimerRef.current); };
  }, [shock]);

  const close = (callback) => {
    setVisible(false);
    dismissTimerRef.current = setTimeout(callback, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  };
  if (!shock) return null;
  const affectedChannels = shock.affected_channel_names ?? shock.affected_channels ?? [];
  return (
    <div className="shock-banner" role="status" aria-live="polite" data-visible={visible}>
      <h2 className="shock-banner-title">{shock.name}</h2>
      <p className="shock-banner-description">{shock.description}</p>
      <dl className="shock-banner-details">
        <div><dt>Affects</dt><dd>{affectedChannels.join(", ")}</dd></div>
        <div><dt>Active days</dt><dd>{shock.start_day} to {shock.end_day}</dd></div>
      </dl>
      <div className="shock-banner-actions">
        <Btn onClick={() => close(onViewImpact)} disabled={!visible} variant="primary">View impact</Btn>
        <Btn onClick={() => close(onDismiss)} disabled={!visible}>Dismiss</Btn>
      </div>
    </div>
  );
}

function ChannelTooltip({ channelId, x, y, onEnter, onLeave, onBlur, onDismiss }) {
  const tooltipRef = useRef(null);
  useLayoutEffect(() => {
    const position = () => {
      if (!tooltipRef.current) return;
      const rect = tooltipRef.current.getBoundingClientRect();
      tooltipRef.current.style.left = `${Math.max(16, Math.min(x, window.innerWidth - rect.width - 16))}px`;
      tooltipRef.current.style.top = `${Math.max(16, Math.min(y, window.innerHeight - rect.height - 16))}px`;
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [channelId, x, y]);
  if (!channelId) return null;
  const info  = CHANNEL_INFO[channelId];
  const color = CHANNEL_COLORS[channelId];
  const name  = CHANNEL_NAMES[channelId];
  if (!info) return null;

  return (
    <div ref={tooltipRef} tabIndex={0} onFocus={onEnter} onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onDismiss(); } }}
      onMouseEnter={onEnter} onMouseLeave={onLeave} className="channel-tooltip" id={`channel-tooltip-${channelId}`} role="tooltip"
      style={{ left: x, top: y, borderColor: `${color}66` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: "13px", color: "#E0E0E0", letterSpacing: "0.05em" }}>{name}</span>
      </div>
      <p className="channel-tooltip-assumption">Simulation baseline assumptions</p>
      <div style={{ fontSize: "13px", color: "#888", marginBottom: "10px", lineHeight: "1.5" }}>
        {info.what}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "10px" }}>
        <div style={{ fontSize: "12px", color: "var(--color-text-2)" }}>
          Click Rate: <span style={{ color: "#C0C0C0" }}>{info.ctr}</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-2)" }}>
          Ad Return: <span style={{ color: "#C0C0C0" }}>{info.roas}</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-2)" }}>
          Acq. Cost: <span style={{ color: "#C0C0C0" }}>{info.cac}</span>
        </div>
      </div>
      <div style={{ fontSize: "12px", color: "var(--color-text-2)", borderTop: "1px solid #1E1E1E", paddingTop: "8px", lineHeight: "1.6" }}>
        These are model inputs. Daily outcomes vary with settings, noise, and market shocks.
      </div>
    </div>
  );
}

function LoadingOverlay({ visible, label = "Simulating..." }) {
  if (!visible) return null;
  return (
    <div className="loading-overlay" role="status" aria-live="polite" style={{
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
        <span className="loading-spinner loading-spinner--large" aria-hidden="true" />
        <p style={{ fontSize: "14px", color: "var(--color-text-2)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [results, setResults] = useState([]);
  const [banditStates, setBanditStates] = useState([]);
  const [currentDay, setCurrentDay] = useState(0);
  const [viewDay, setViewDay] = useState(0);
  const [isLoadingDays, setIsLoadingDays] = useState(0);
  const [operationBusy, setOperationBusy] = useState(false);
  const [simulatingLabel, setSimulatingLabel] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [activeShock, setActiveShock] = useState(null);
  const [shockEvents, setShockEvents] = useState([]);
  const [error, setError] = useState(null);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [shockPending, setShockPending] = useState(false);
  const [shocksExhausted, setShocksExhausted] = useState(false);
  const tooltipDismissTimerRef = useRef(null);
  const [channelTooltip, setChannelTooltip] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // null represents initial load before choosing the landing page or dashboard.
  const [showLanding, setShowLanding] = useState(null);
  const [tourActive, setTourActive] = useState(false);
  // Timer callbacks read current settings through this ref.
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const shockPanelRef = useRef(null);
  const headerRef = useRef(null);
  const autoIntervalRef   = useRef(null);
  const sequentialRunning = useRef(false);
  const loadingRef        = useRef(false);
  const currentDayRef     = useRef(0);
  const viewDayRef        = useRef(0);

  useEffect(() => () => clearTimeout(tooltipDismissTimerRef.current), []);

  useEffect(() => {
    async function load() {
      try {
        const { results: res, bandit_states: states, active_shocks: shocks, shock_events: events } = await getState();
        setResults(res);
        setBanditStates(states);
        if (res.length > 0) {
          const maxDay = Math.max(...res.map((r) => r.day));
          setCurrentDay(maxDay);
          setViewDay(maxDay);
          currentDayRef.current = maxDay;
          viewDayRef.current    = maxDay;
          setShowLanding(false);
        } else {
          setShowLanding(true);
        }
        setShockEvents(events);
        if (shocks.length > 0) setActiveShock(shocks[shocks.length - 1]);
      } catch (e) {
        const msg = e.name === "AbortError"
          ? "The simulation service took too long to respond. Reload the page to try again."
          : "The simulation could not be loaded. Reload to try again.";
        setError(msg);
        setInitialLoadFailed(true);
        setShowLanding(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (currentDay >= MAX_DAYS && autoRunning) {
      stopAuto();
    }
  }, [currentDay, autoRunning]);

  const fetchAndMerge = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setOperationBusy(true);
    try {
      const response = await simulate(1, settingsRef.current);
      setResults((prev) => [...prev, ...response.new_rows]);
      setBanditStates(response.bandit_states);
      setCurrentDay(response.current_day);
      currentDayRef.current = response.current_day;
      setViewDay(response.current_day);
      viewDayRef.current = response.current_day;
    } catch (e) {
      setError("Auto-run request failed. Reload to restore the latest campaign state.");
      setAutoRunning(false);
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
    } finally {
      loadingRef.current = false;
      setOperationBusy(false);
    }
  }, []);

  // Simulate the batch once on the server, then replay its returned days in the client.
  const handleSimulate = useCallback(async (nDays) => {
    if (sequentialRunning.current || loadingRef.current || currentDayRef.current >= MAX_DAYS) return false;
    sequentialRunning.current = true;
    setOperationBusy(true);
    const safe = Math.min(nDays, MAX_DAYS - currentDayRef.current);

    loadingRef.current = true;
    setIsLoadingDays(safe);
    setError(null);
    setSimulatingLabel(safe === 1 ? "" : `Simulating ${safe} days…`);
    let response;
    try {
      response = await simulate(safe, settingsRef.current);
    } catch (e) {
      setError("Simulation request failed. Reload to restore the latest campaign state before trying again.");
      loadingRef.current = false;
      setIsLoadingDays(0);
      sequentialRunning.current = false;
      setOperationBusy(false);
      setSimulatingLabel("");
      return false;
    }
    loadingRef.current = false;
    setIsLoadingDays(0);
    setSimulatingLabel("");
    setBanditStates(response.bandit_states);

    const byDay = new Map();
    response.new_rows.forEach((r) => {
      if (!byDay.has(r.day)) byDay.set(r.day, []);
      byDay.get(r.day).push(r);
    });
    const days = Array.from(byDay.keys()).sort((a, b) => a - b);
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
    setOperationBusy(false);
    return true;
  }, []);

  const stopAuto = useCallback(() => {
    setAutoRunning(false);
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
  }, []);

  const startAuto = () => {
    if (autoRunning || loadingRef.current || sequentialRunning.current || currentDayRef.current >= MAX_DAYS) return;
    setAutoRunning(true);
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

  // Keep the keyboard listener stable while the toggle callback changes.
  const handleAutoToggleRef = useRef(handleAutoToggle);
  useEffect(() => { handleAutoToggleRef.current = handleAutoToggle; });

  useEffect(() => {
    const prevMs = settingsRef.current.autoIntervalMs;
    settingsRef.current = settings;
    if (autoRunning && settings.autoIntervalMs !== prevMs) {
      setSimulatingLabel("speed change on next start");
      const t = setTimeout(() => setSimulatingLabel(""), 2500);
      return () => clearTimeout(t);
    }
  }, [settings, autoRunning]);

  // Focused controls keep native keys; shortcuts apply only to the dashboard.
  useEffect(() => {
    const handler = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || tourActive || settingsOpen || initialLoadFailed || showLanding !== false) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, button, a, [tabindex], [contenteditable], [role='button']")) return;
      if (e.code === "Space" && !e.shiftKey) {
        e.preventDefault();
        handleAutoToggleRef.current();
      } else if (!loadingRef.current && !sequentialRunning.current && !autoRunning) {
        if (e.code === "ArrowRight" && e.shiftKey) {
          e.preventDefault();
          setViewDay(currentDayRef.current);
          viewDayRef.current = currentDayRef.current;
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          handleSimulate(1);
        } else if (e.code === "ArrowLeft" && !e.shiftKey && currentDayRef.current > 0) {
          e.preventDefault();
          setViewDay((d) => {
            const next = Math.max(1, d - 1);
            viewDayRef.current = next;
            return next;
          });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tourActive, settingsOpen, initialLoadFailed, showLanding, autoRunning, handleSimulate]);

  const handleShock = async () => {
    if (loadingRef.current || sequentialRunning.current || shockPending || shocksExhausted) return;
    loadingRef.current = true;
    setOperationBusy(true);
    setShockPending(true);
    try {
      const event = await triggerShock();
      setActiveShock(event);
      setShockEvents((prev) => [...prev, event]);
    } catch (e) {
      // HTTP 409 means the event pool is exhausted; disable further shock requests.
      if (e.message?.includes("409") || e.message?.includes("SHOCKS_EXHAUSTED")) {
        setShocksExhausted(true);
      } else {
        setError("Market shock request failed. Reload to restore the latest campaign state.");
      }
    } finally {
      setShockPending(false);
      loadingRef.current = false;
      setOperationBusy(false);
    }
  };

  const handleReset = async () => {
    if (loadingRef.current || sequentialRunning.current) return;
    loadingRef.current = true;
    setOperationBusy(true);
    setError(null);
    stopAuto();
    setIsLoadingDays(7);
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
      setShowLanding(true);
    } catch (e) {
      setError("Reset request failed. Reload to check the current campaign state.");
    } finally {
      loadingRef.current = false;
      setOperationBusy(false);
      setIsLoadingDays(0);
    }
  };

  const visibleResults = useMemo(
    () => results.filter((r) => r.day <= viewDay),
    [results, viewDay]
  );
  const isReplaying = viewDay < currentDay && currentDay > 0;

  if (initialLoadFailed) {
    return <main className="initial-load-unavailable">
      <span className="brand-dot" aria-hidden="true" />
      <h1>Simulation unavailable</h1>
      <p role="alert">{error}</p>
      <Btn variant="primary" onClick={() => window.location.reload()}>Reload</Btn>
    </main>;
  }
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
        <div className="decorative-motion" role="status" aria-label="Loading simulation" style={{
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
        error={error}
        onStart={() => setShowLanding(false)}
        onGetStarted={() => { setTourActive(true); setShowLanding(false); }}
        onSimulate={handleSimulate}
      />
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {activeShock && (
        <ShockBanner shock={activeShock} onDismiss={() => setActiveShock(null)}
          onViewImpact={() => {
            setActiveShock(null);
            if (shockPanelRef.current) {
              const header = headerRef.current;
              const headerHeight = header && getComputedStyle(header).position === "sticky"
                ? header.getBoundingClientRect().height : 0;
              window.scrollTo({
                top: Math.max(0, shockPanelRef.current.getBoundingClientRect().top + window.scrollY - headerHeight - 16),
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
              });
            }
          }} />
      )}
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onUpdate={setSettings}
        onClose={() => setSettingsOpen(false)}
        onReset={() => setSettings(DEFAULT_SETTINGS)}
      />
      <GuidedTour show={tourActive} onDone={() => setTourActive(false)} />
      <LoadingOverlay visible={isLoadingDays > 1} label={simulatingLabel || "Resetting simulation..."} />
      {channelTooltip && <ChannelTooltip {...channelTooltip}
        onEnter={() => clearTimeout(tooltipDismissTimerRef.current)}
        onLeave={() => {
          if (!document.activeElement?.closest(".channel-legend-button, .channel-tooltip")) {
            tooltipDismissTimerRef.current = setTimeout(() => setChannelTooltip(null), 150);
          }
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget) && !e.relatedTarget?.closest(".channel-legend-button")) {
            clearTimeout(tooltipDismissTimerRef.current); setChannelTooltip(null);
          }
        }}
        onDismiss={() => {
          clearTimeout(tooltipDismissTimerRef.current);
          document.querySelector(`[data-channel-id="${channelTooltip.channelId}"]`)?.focus();
          setChannelTooltip(null);
        }} />}
      <div style={{
        minHeight: "100vh",
        padding: "0 0 64px 0",
        background: "var(--color-bg)",
      }}>
        <a className="skip-link" href="#dashboard-main">Skip to dashboard</a>
        <header ref={headerRef} className="dashboard-header">
          <div className="dashboard-header-inner">
            <div className="dashboard-masthead">
              <div className="dashboard-brand">
                <span className="brand-dot" aria-hidden="true" />
                <div>
                  <h1>Nothing Bandit™</h1>
                  <p>Budget allocation system</p>
                </div>
              </div>
              <div className="dashboard-timeline">
                <div className="timeline-heading">
                  <span className="timeline-label">Campaign · {MAX_DAYS} days</span>
                  <div className="timeline-current">
                    {isReplaying && <>
                      <span className="replay-label">Replay</span>
                      <button className="dashboard-button dashboard-button--default timeline-now"
                        disabled={operationBusy || autoRunning}
                        onClick={() => { setViewDay(currentDay); viewDayRef.current = currentDay; }}>Now</button>
                    </>}
                    <span className="timeline-day">
                      {currentDay === 0 ? "DAY 0" : isReplaying ? `DAY ${viewDay}` : `DAY ${currentDay}`}
                    </span>
                  </div>
                </div>
                {currentDay > 0 ? (
                  <input type="range" className="timeline-slider" min={1} max={currentDay} value={viewDay || 1}
                    aria-label="Campaign replay day" aria-valuetext={`Day ${viewDay} of ${currentDay} simulated days`}
                    disabled={operationBusy || autoRunning} title="Drag to replay past days"
                    onChange={(e) => {
                      const d = Math.min(Number(e.target.value), currentDay);
                      setViewDay(d); viewDayRef.current = d;
                    }}
                    style={{ backgroundImage: (() => {
                      const vPct = (viewDay / currentDay) * 100;
                      const cPct = 100;
                      const fillColor = isReplaying ? "#FF4444" : autoRunning ? "#22D3EE" : "#3A3A3A";
                      const simulatedColor = isReplaying ? "rgba(255,68,68,0.18)" : "#232323";
                      return `linear-gradient(90deg, ${fillColor} ${vPct}%, ${simulatedColor} ${vPct}%, ${simulatedColor} ${cPct}%, #1A1A1A ${cPct}%)`;
                    })() }} />
                ) : <div className="timeline-placeholder" />}
                <div className="timeline-endpoints"><span>D1</span><span>D{currentDay || MAX_DAYS}</span></div>
              </div>
            </div>
            <div className="dashboard-controls" data-tour="controls">
              <div className="simulation-controls" role="group" aria-label="Simulation controls">
                <Btn onClick={() => handleSimulate(1)} disabled={operationBusy || autoRunning || currentDay >= MAX_DAYS}
                  variant="primary" title="Simulate 1 day [Right arrow]" spinning={isLoadingDays === 1}>+1 Day</Btn>
                <Btn onClick={() => handleSimulate(7)} disabled={operationBusy || autoRunning || currentDay >= MAX_DAYS}
                  variant="primary" title="Simulate 1 week">+1 Week</Btn>
                <Btn onClick={() => handleSimulate(30)} disabled={operationBusy || autoRunning || currentDay >= MAX_DAYS}
                  variant="primary" title="Simulate 1 month">+1 Month</Btn>
                <Btn onClick={handleAutoToggle} disabled={!autoRunning && (operationBusy || currentDay >= MAX_DAYS)}
                  variant={autoRunning ? "active" : "primary"} title="Auto-run [Space]">{autoRunning ? "Stop" : "Auto"}</Btn>
              </div>
              <div className="scenario-controls" role="group" aria-label="Scenario controls">
                <Btn onClick={handleShock} disabled={operationBusy || shocksExhausted} spinning={shockPending}
                  variant="shock" title={shocksExhausted ? "All 10 shock events used. Reset to replay." : "Trigger a random market shock event"}>
                  {shocksExhausted ? "Exhausted" : "Shock"}
                </Btn>
                <Btn onClick={handleReset} disabled={operationBusy} variant="danger" title="Reset simulation to day 0">Reset</Btn>
              </div>
              <div className="utility-controls">
                <div className="shortcut-help">
                  <button className="dashboard-button dashboard-button--default" aria-label="Keyboard shortcuts"
                    onClick={(e) => e.currentTarget.focus()} aria-describedby="keyboard-shortcuts" title="Keyboard shortcuts">Keys</button>
                  <div className="shortcut-tooltip" id="keyboard-shortcuts" role="tooltip">
                    <p>Keyboard shortcuts</p>
                    <div><kbd>Space</kbd> Auto play/pause</div>
                    <div><kbd>→</kbd> +1 Day</div>
                    <div><kbd>←</kbd> Replay back 1 day</div>
                    <div><kbd>Shift+→</kbd> Current day</div>
                  </div>
                </div>
                <button className="dashboard-button dashboard-button--default" aria-label="Open settings"
                  aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)} title="Settings">Settings</button>
              </div>
              <div className="dashboard-status" role="status" aria-live="polite">
                {(operationBusy || autoRunning) && <span className="loading-spinner" aria-hidden="true" />}
                <span>{shockPending ? "Applying shock…" : isLoadingDays > 0
                  ? (simulatingLabel || (isLoadingDays === 1 ? "Simulating 1 day…" : "Resetting…"))
                  : operationBusy ? "Replaying days…" : autoRunning ? "Auto running"
                  : currentDay >= MAX_DAYS ? "Campaign complete" : "Ready"}</span>
              </div>
            </div>
          </div>
        </header>
        {error && (
          <div role="alert" style={{
            background: "rgba(255,0,0,0.08)",
            borderBottom: "1px solid rgba(255,0,0,0.3)",
            padding: "10px 32px",
            fontSize: "11px",
            color: "#FF6666",
            letterSpacing: "0.04em",
          }}>
            {error}
            <button className="dashboard-button" onClick={() => window.location.reload()} style={{ marginLeft: "16px", padding: "6px 12px", background: "transparent", color: "var(--color-text)", border: "1px solid var(--color-border-2)", font: "inherit" }}>Reload</button>
          </div>
        )}
        <main className="dashboard-main" id="dashboard-main" tabIndex={-1}>
          {currentDay === 0 && isLoadingDays === 0 && (
            <div className="dashboard-empty-state">
              <div>
                <span style={{
                  fontFamily: "var(--font-display)", fontSize: "16px",
                  color: "var(--color-text)",
                }}>
                  DAY 0 · AWAITING SIMULATION
                </span>
                <span style={{ fontSize: "11px", color: "var(--color-text-2)", marginLeft: "16px" }}>
                  No simulated days yet. Use +1 Day or Auto to begin.
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Btn onClick={() => handleSimulate(1)} disabled={operationBusy || autoRunning} variant="primary">+1 Day</Btn>
                <Btn onClick={handleAutoToggle} disabled={operationBusy || autoRunning} variant="primary">Auto</Btn>
              </div>
            </div>
          )}
            <div className="dashboard-legend" aria-label="Chart legend">
              <span className="legend-label">Channels</span>
              {Object.entries(CHANNEL_NAMES).map(([id, name]) => {
                const showInfo = (e) => {
                  clearTimeout(tooltipDismissTimerRef.current);
                  const rect = e.currentTarget.getBoundingClientRect();
                  setChannelTooltip({ channelId: Number(id), x: rect.left, y: rect.bottom + 8 });
                };
                return <button key={id} data-channel-id={id} className="channel-legend-button"
                  aria-describedby={channelTooltip?.channelId === Number(id) ? `channel-tooltip-${id}` : undefined}
                  onFocus={showInfo} onMouseEnter={showInfo} onClick={showInfo}
                  onBlur={(e) => { if (!e.relatedTarget?.closest(".channel-tooltip")) { clearTimeout(tooltipDismissTimerRef.current); setChannelTooltip(null); } }}
                  onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) tooltipDismissTimerRef.current = setTimeout(() => setChannelTooltip(null), 150); }}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); clearTimeout(tooltipDismissTimerRef.current); setChannelTooltip(null); } }}>
                  <span className="channel-dot" style={{ background: CHANNEL_COLORS[id] }} aria-hidden="true" />{name}
                </button>;
              })}
              <div className="allocator-legend">
                <span><i className="allocator-line allocator-line--bandit" aria-hidden="true" />Bandit</span>
                <span><i className="allocator-line allocator-line--static" aria-hidden="true" />Static</span>
              </div>
            </div>
            <div ref={shockPanelRef}>
              <ShockImpactPanel
                shockEvents={shockEvents}
                results={visibleResults}
                viewDay={viewDay}
              />
            </div>

            <div className="section-heading" data-tour="allocation-grid">
              <h2 className="section-title">3 parallel bandits</h2>
              <p className="section-description">Each optimises a different objective independently.</p>
            </div>
            <div className="objective-grid">
              {OBJECTIVES.map((obj) => (
                <div key={obj} style={{ background: "var(--color-bg)" }}>
                  <div className="objective-heading">
                    <h3 className="objective-code">{OBJECTIVE_SHORT[obj]}</h3>
                    <p className="objective-name">{OBJECTIVE_LABELS[obj]}</p>
                    <p className="objective-description">{OBJECTIVE_DESCRIPTIONS[obj]}</p>
                  </div>
                  <div className="objective-plot">
                    <h4 className="chart-caption">Budget allocation</h4>
                    <BudgetAllocationChart
                      results={visibleResults}
                      objective={obj}
                      shockEvents={shockEvents}
                      currentDay={viewDay}
                    />
                  </div>
                  <div className="objective-plot objective-plot--comparison">
                    <h4 className="chart-caption">Bandit vs static</h4>
                    <p className="chart-description">Running {obj === "cac" ? "CAC" : obj === "roas" ? "ROAS" : "avg CTR"} (cumulative)</p>
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
            <section className="dashboard-section" aria-labelledby="business-heading">
              <div className="section-heading" data-tour="business-outcomes">
                <h2 className="section-title" id="business-heading">Business outcomes</h2>
                <p className="section-description">Bandit vs static baseline</p>
              </div>
              <BusinessMetricsChart
                results={visibleResults}
                currentDay={viewDay}
              />
            </section>
            <section className="dashboard-section" aria-labelledby="confidence-heading">
              <div className="section-heading">
                <h2 className="section-title" id="confidence-heading">Bandit confidence</h2>
                <p className="section-description">Each curve estimates a channel's chance of meeting its reward threshold. Narrower curves indicate greater certainty.
                  Dashed lines mark the most likely success rates. Adjust reward thresholds in Settings.</p>
              </div>
              <div className="confidence-grid">
                {OBJECTIVES.map((obj) => (
                  <div key={obj} className="confidence-panel">
                    <div className="confidence-objective-heading">
                      <span>Beta(α,β)</span><span className="confidence-objective-code">{OBJECTIVE_SHORT[obj]}</span>
                      <span className="confidence-objective-name">{OBJECTIVE_LABELS[obj]}</span>
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
