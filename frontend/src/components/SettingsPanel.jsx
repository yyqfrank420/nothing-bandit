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

import React from "react";

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

function SettingRow({ label, hint, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", color: "#C0C0C0", letterSpacing: "0.04em" }}>
          {label}
        </span>
        <span style={{ fontSize: "11px", color: "#666", fontFamily: "Ndot55, monospace" }}>
          {hint}
        </span>
      </div>
      {children}
    </div>
  );
}

function SliderInput({ value, min, max, step, onChange, formatHint }) {
  return (
    <input
      type="range"
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
        outline: "none",
        cursor: "pointer",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SettingsPanel({ open, settings, onUpdate, onClose, onReset }) {
  if (!open) return null;

  const set = (key, value) => onUpdate({ ...settings, [key]: value });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "320px",
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
            <div style={{
              fontFamily: "Ndot55, monospace",
              fontSize: "13px",
              color: "#E0E0E0",
              letterSpacing: "0.1em",
            }}>
              SETTINGS
            </div>
            <div style={{ fontSize: "10px", color: "#444", marginTop: "3px" }}>
              Session-scoped — resets on page reload
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "#444",
              cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 4px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#444"; }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

          {/* Section: Simulation */}
          <div style={{
            fontSize: "9px", color: "#5A5A5A", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: "16px",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            Simulation
          </div>

          <SettingRow label="Daily Budget" hint={`$${settings.dailyBudget.toLocaleString()}`}>
            <SliderInput
              value={settings.dailyBudget}
              min={1000} max={100000} step={1000}
              onChange={(v) => set("dailyBudget", v)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>$1,000</span>
              <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>$100,000</span>
            </div>
          </SettingRow>

          <SettingRow
            label="Noise Level (σ)"
            hint={`${(settings.noiseSigma * 100).toFixed(0)}%`}
          >
            <SliderInput
              value={settings.noiseSigma}
              min={0.02} max={0.50} step={0.01}
              onChange={(v) => set("noiseSigma", v)}
            />
            <div style={{ fontSize: "10px", color: "#5A5A5A", marginTop: "6px", lineHeight: "1.5" }}>
              Gaussian noise applied to each observed metric. Higher = more volatile results.
            </div>
          </SettingRow>

          <SettingRow
            label="Bandit Forgetting (γ)"
            hint={`${settings.decayFactor.toFixed(2)}`}
          >
            <SliderInput
              value={settings.decayFactor}
              min={0.80} max={1.00} step={0.01}
              onChange={(v) => set("decayFactor", parseFloat(v.toFixed(2)))}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>Fast forget (0.80)</span>
              <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>No forget (1.00)</span>
            </div>
            <div style={{ fontSize: "10px", color: "#5A5A5A", marginTop: "6px", lineHeight: "1.5" }}>
              Per-day discount on accumulated evidence. Lower = faster recovery after shocks.
              Half-life ≈ {settings.decayFactor >= 1.0 ? "∞" : Math.round(Math.log(0.5) / Math.log(settings.decayFactor))} days.
            </div>
          </SettingRow>

          {/* Section: Reward Thresholds */}
          <div style={{
            fontSize: "9px", color: "#5A5A5A", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: "16px", marginTop: "28px",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            Reward Thresholds
          </div>
          <div style={{ fontSize: "10px", color: "#5A5A5A", marginBottom: "16px", lineHeight: "1.6" }}>
            A day is counted as a "success" (Alpha +1) when the observed metric beats this
            threshold. Failures increment Beta. Adjust to change how aggressively the bandit
            discriminates between channels.
            {" "}<span style={{ color: "#4A4A4A" }}>
              These thresholds directly shape the Beta posteriors in the Bandit Confidence
              charts — raise a threshold to make the bandit more selective, producing flatter
              curves and more exploration across channels.
            </span>
          </div>

          <SettingRow label="CTR Threshold" hint={`≥ ${(settings.rewardCtr * 100).toFixed(1)}%`}>
            <SliderInput
              value={settings.rewardCtr}
              min={0.005} max={0.08} step={0.005}
              onChange={(v) => set("rewardCtr", parseFloat(v.toFixed(3)))}
            />
          </SettingRow>

          <SettingRow label="ROAS Threshold" hint={`≥ ${settings.rewardRoas.toFixed(2)}×`}>
            <SliderInput
              value={settings.rewardRoas}
              min={0.5} max={5.0} step={0.1}
              onChange={(v) => set("rewardRoas", parseFloat(v.toFixed(1)))}
            />
          </SettingRow>

          <SettingRow label="CAC Threshold" hint={`≤ $${settings.rewardCac.toFixed(0)}`}>
            <SliderInput
              value={settings.rewardCac}
              min={50} max={400} step={10}
              onChange={(v) => set("rewardCac", v)}
            />
            <div style={{ fontSize: "10px", color: "#5A5A5A", marginTop: "6px" }}>
              Lower CAC = better. A channel wins when its CAC is below this threshold.
            </div>
          </SettingRow>

          {/* Section: Auto Speed */}
          <div style={{
            fontSize: "9px", color: "#5A5A5A", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: "16px", marginTop: "28px",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            Auto Speed
          </div>

          <SettingRow
            label="Interval between days"
            hint={`${settings.autoIntervalMs}ms`}
          >
            <SliderInput
              value={settings.autoIntervalMs}
              min={50} max={600} step={50}
              onChange={(v) => set("autoIntervalMs", v)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>Fast (50ms)</span>
              <span style={{ fontSize: "9px", color: "#444", fontFamily: "LetteraMonoLL, monospace" }}>Slow (600ms)</span>
            </div>
            <div style={{ fontSize: "10px", color: "#5A5A5A", marginTop: "6px" }}>
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
              color: "#555",
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
              e.currentTarget.style.color = "#555";
            }}
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </>
  );
}
