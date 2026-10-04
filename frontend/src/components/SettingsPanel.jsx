/**
 * File: SettingsPanel.jsx
 * Language: JavaScript (React 18)
 * Purpose: Slide-out settings drawer for tuning simulation hyperparameters.
 *          Settings are session-scoped (React state) — they reset on full page reload.
 *          Values are forwarded to the backend with every simulate() call.
 * Connects to: App.jsx (receives settings, onUpdate, onClose props)
 * Inputs:  settings object, open boolean, callbacks
 * Outputs: Renders a slide-in panel; calls onUpdate(newSettings) on change
 */

import React, { useEffect, useRef } from "react";

// Default values mirror channels.py / simulator.py constants.
export const DEFAULT_SETTINGS = {
  dailyBudget:    5000,
  noiseSigma:     0.15,
  rewardCtr:      0.030,
  rewardRoas:     2.50,
  rewardCac:      160.0,
  autoIntervalMs: 150,
  decayFactor:    0.95,   // Bayesian forgetting — γ per day (~14-day half-life)
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SettingRow({ id, label, hint, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <label htmlFor={id} style={{ fontSize: "12px", color: "#C0C0C0", letterSpacing: "0.04em" }}>
          {label}
        </label>
        <span style={{ fontSize: "11px", color: "#999", fontFamily: "Ndot55, monospace" }}>
          {hint}
        </span>
      </div>
      {children}
    </div>
  );
}

function SliderInput({ value, min, max, step, onChange, id, valueText }) {
  return (
    <input
      type="range"
      id={id}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: "100%",
        appearance: "none",
        WebkitAppearance: "none",
        height: "2px",
        borderRadius: "1px",
        background: `linear-gradient(90deg, #4ADE80 ${((value - min) / (max - min)) * 100}%, #1E1E1E ${((value - min) / (max - min)) * 100}%)`,
        cursor: "pointer",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SettingsPanel({ open, settings, onUpdate, onClose, onReset }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  const set = (key, value) => onUpdate({ ...settings, [key]: value });

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      aria-describedby="settings-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(360px, 100vw)",
        height: "100dvh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
        margin: "0 0 0 auto",
        padding: 0,
        border: 0,
        boxSizing: "border-box",
        zIndex: 300,
        background: "#111",
        borderLeft: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        animation: "slideInRight 220ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        {/* Drawer header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid #1E1E1E",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}>
          <div>
            <h2 id="settings-title" style={{
              margin: 0,
              fontWeight: "normal",
              fontFamily: "Ndot55, monospace",
              fontSize: "13px",
              color: "#E0E0E0",
              letterSpacing: "0.1em",
            }}>
              SETTINGS
            </h2>
            <div id="settings-description" style={{ fontSize: "11px", color: "#999", marginTop: "6px", lineHeight: 1.5 }}>
              Session-scoped — resets on page reload
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: "none", border: "none", color: "#999",
              cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "8px", minWidth: "44px", minHeight: "44px", flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#999"; }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px" }}>

          {/* Section: Simulation */}
          <div style={{
            fontSize: "11px", color: "#999", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: "16px",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            Simulation
          </div>

          <SettingRow id="setting-dailyBudget" label="Daily Budget" hint={`$${settings.dailyBudget.toLocaleString()}`}>
            <SliderInput
              id="setting-dailyBudget"
              valueText={`$${settings.dailyBudget.toLocaleString()}`}
              value={settings.dailyBudget}
              min={1000} max={100000} step={1000}
              onChange={(v) => set("dailyBudget", v)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: "#999", fontFamily: "LetteraMonoLL, monospace" }}>$1,000</span>
              <span style={{ fontSize: "11px", color: "#999", fontFamily: "LetteraMonoLL, monospace" }}>$100,000</span>
            </div>
          </SettingRow>

          <SettingRow id="setting-noiseSigma"
            label="Noise Level (σ)"
            hint={`${(settings.noiseSigma * 100).toFixed(0)}%`}
          >
            <SliderInput
              id="setting-noiseSigma"
              valueText={`${(settings.noiseSigma * 100).toFixed(0)}%`}
              value={settings.noiseSigma}
              min={0.02} max={0.50} step={0.01}
              onChange={(v) => set("noiseSigma", v)}
            />
            <div style={{ fontSize: "12px", color: "#999", marginTop: "6px", lineHeight: "1.5" }}>
              Gaussian noise applied to each observed metric. Higher = more volatile results.
            </div>
          </SettingRow>

          <SettingRow id="setting-decayFactor"
            label="Bandit Forgetting (γ)"
            hint={`${settings.decayFactor.toFixed(2)}`}
          >
            <SliderInput
              id="setting-decayFactor"
              valueText={settings.decayFactor.toFixed(2)}
              value={settings.decayFactor}
              min={0.80} max={1.00} step={0.01}
              onChange={(v) => set("decayFactor", parseFloat(v.toFixed(2)))}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: "#999", fontFamily: "LetteraMonoLL, monospace" }}>Fast forget (0.80)</span>
              <span style={{ fontSize: "11px", color: "#999", fontFamily: "LetteraMonoLL, monospace" }}>No forget (1.00)</span>
            </div>
            <div style={{ fontSize: "12px", color: "#999", marginTop: "6px", lineHeight: "1.5" }}>
              Per-day discount on accumulated evidence. Lower = faster recovery after shocks.
              Half-life ≈ {settings.decayFactor >= 1.0 ? "∞" : Math.round(Math.log(0.5) / Math.log(settings.decayFactor))} days.
            </div>
          </SettingRow>

          {/* Section: Reward Thresholds */}
          <div style={{
            fontSize: "11px", color: "#999", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: "16px", marginTop: "28px",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            Reward Thresholds
          </div>
          <div style={{ fontSize: "12px", color: "#999", marginBottom: "16px", lineHeight: "1.6" }}>
            A day is counted as a "success" (Alpha +1) when the observed metric beats this
            threshold. Failures increment Beta. Adjust to change how aggressively the bandit
            discriminates between channels.
            {" "}<span style={{ color: "#999" }}>
              These thresholds directly shape the Beta posteriors in the Bandit Confidence
              charts — raise a threshold to make the bandit more selective, producing flatter
              curves and more exploration across channels.
            </span>
          </div>

          <SettingRow id="setting-rewardCtr" label="CTR Threshold" hint={`≥ ${(settings.rewardCtr * 100).toFixed(1)}%`}>
            <SliderInput
              id="setting-rewardCtr"
              valueText={`${(settings.rewardCtr * 100).toFixed(1)}%`}
              value={settings.rewardCtr}
              min={0.005} max={0.08} step={0.005}
              onChange={(v) => set("rewardCtr", parseFloat(v.toFixed(3)))}
            />
          </SettingRow>

          <SettingRow id="setting-rewardRoas" label="ROAS Threshold" hint={`≥ ${settings.rewardRoas.toFixed(2)}×`}>
            <SliderInput
              id="setting-rewardRoas"
              valueText={`${settings.rewardRoas.toFixed(2)} times`}
              value={settings.rewardRoas}
              min={0.5} max={5.0} step={0.1}
              onChange={(v) => set("rewardRoas", parseFloat(v.toFixed(1)))}
            />
          </SettingRow>

          <SettingRow id="setting-rewardCac" label="CAC Threshold" hint={`≤ $${settings.rewardCac.toFixed(0)}`}>
            <SliderInput
              id="setting-rewardCac"
              valueText={`$${settings.rewardCac.toFixed(0)}`}
              value={settings.rewardCac}
              min={50} max={400} step={10}
              onChange={(v) => set("rewardCac", v)}
            />
            <div style={{ fontSize: "12px", color: "#999", marginTop: "6px" }}>
              Lower CAC = better. A channel wins when its CAC is below this threshold.
            </div>
          </SettingRow>

          {/* Section: Auto Speed */}
          <div style={{
            fontSize: "11px", color: "#999", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: "16px", marginTop: "28px",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            Auto Speed
          </div>

          <SettingRow id="setting-autoIntervalMs"
            label="Interval between days"
            hint={`${settings.autoIntervalMs}ms`}
          >
            <SliderInput
              id="setting-autoIntervalMs"
              valueText={`${settings.autoIntervalMs} milliseconds`}
              value={settings.autoIntervalMs}
              min={50} max={600} step={50}
              onChange={(v) => set("autoIntervalMs", v)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: "#999", fontFamily: "LetteraMonoLL, monospace" }}>Fast (50ms)</span>
              <span style={{ fontSize: "11px", color: "#999", fontFamily: "LetteraMonoLL, monospace" }}>Slow (600ms)</span>
            </div>
            <div style={{ fontSize: "12px", color: "#999", marginTop: "6px" }}>
              Takes effect on next Auto start.
            </div>
          </SettingRow>

        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #1E1E1E",
          flexShrink: 0,
        }}>
          <button
            onClick={onReset}
            style={{
              width: "100%",
              padding: "10px",
              background: "transparent",
              border: "1px solid #282828",
              borderRadius: "3px",
              color: "#999",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "LetteraMonoLL, monospace",
              transition: "all 200ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#444";
              e.currentTarget.style.color = "#888";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#282828";
              e.currentTarget.style.color = "#999";
            }}
          >
            Reset to Defaults
          </button>
        </div>
    </dialog>
  );
}
