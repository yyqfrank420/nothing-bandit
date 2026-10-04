import React, { useEffect, useRef } from "react";
import "./SettingsPanel.css";

// Defaults match channels.py and simulator.py.
export const DEFAULT_SETTINGS = {
  dailyBudget:    5000,
  noiseSigma:     0.15,
  rewardCtr:      0.030,
  rewardRoas:     2.50,
  rewardCac:      160.0,
  autoIntervalMs: 150,
  decayFactor:    0.95,
};

function SettingRow({ id, label, hint, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", marginBottom: "2px" }}>
        <label htmlFor={id} style={{ fontSize: "13px", color: "var(--color-text)", letterSpacing: "0.04em" }}>
          {label}
        </label>
        <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>
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
      className="settings-range"
      type="range"
      id={id}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--range-fill": `${((value - min) / (max - min)) * 100}%` }}
    />
  );
}

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
        background: "var(--color-surface)",
        fontFamily: "var(--font-body)",
        borderLeft: "1px solid #222",
        display: "flex",
        flexDirection: "column",
      }}>
        <div className="settings-header" style={{
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
              fontFamily: "var(--font-heading)",
              fontSize: "22px",
              color: "#E0E0E0",
              letterSpacing: "0.02em",
            }}>
              Settings
            </h2>
            <div id="settings-description" style={{ fontSize: "13px", color: "var(--color-text-2)", marginTop: "6px", lineHeight: 1.5 }}>
              Settings reset when you reload the page.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="dialog-button settings-close"
            style={{
              background: "none",
              cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "8px", minWidth: "44px", minHeight: "44px", flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div className="settings-content" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}>
          <h3 className="settings-section-title">
            Simulation
          </h3>

          <SettingRow id="setting-dailyBudget" label="Daily Budget" hint={`$${settings.dailyBudget.toLocaleString()}`}>
            <SliderInput
              id="setting-dailyBudget"
              valueText={`$${settings.dailyBudget.toLocaleString()}`}
              value={settings.dailyBudget}
              min={1000} max={100000} step={1000}
              onChange={(v) => set("dailyBudget", v)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>$1,000</span>
              <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>$100,000</span>
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
            <div style={{ fontSize: "13px", color: "var(--color-text-2)", marginTop: "6px", lineHeight: "1.5" }}>
              Controls daily variation in channel metrics. Higher values add more variation.
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
              <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>Fast forget (0.80)</span>
              <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>No forget (1.00)</span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-2)", marginTop: "6px", lineHeight: "1.5" }}>
              Discounts accumulated evidence each day. Lower values give recent results more weight.
              Half-life ≈ {settings.decayFactor >= 1.0 ? "∞" : Math.round(Math.log(0.5) / Math.log(settings.decayFactor))} days.
            </div>
          </SettingRow>
          <h3 className="settings-section-title">
            Reward thresholds
          </h3>
          <div style={{ fontSize: "13px", color: "var(--color-text-2)", marginBottom: "16px", lineHeight: "1.6" }}>
            CTR and ROAS count as successes at or above their thresholds. CAC counts at or below its threshold.
            These results update the confidence curves.
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
          </SettingRow>
          <h3 className="settings-section-title">
            Auto speed
          </h3>

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
              <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>Fast (50ms)</span>
              <span style={{ fontSize: "12px", color: "var(--color-text-2)", fontFamily: "var(--font-mono)" }}>Slow (600ms)</span>
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-2)", marginTop: "6px" }}>
              Takes effect on next Auto start.
            </div>
          </SettingRow>

        </div>
        <div className="settings-footer" style={{
          borderTop: "1px solid #1E1E1E",
          flexShrink: 0,
        }}>
          <button
            onClick={onReset}
            className="dialog-button settings-reset"
            style={{
              width: "100%",
              padding: "10px",
              background: "transparent",
              borderRadius: "3px",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            Reset to Defaults
          </button>
        </div>
    </dialog>
  );
}
