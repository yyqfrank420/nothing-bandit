import React, { useEffect, useRef, useState } from "react";
import "./LandingPage.css";

export default function LandingPage({ onStart, onGetStarted, onSimulate, error }) {
  const [leaving, setLeaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const dismissTimer = useRef(null);
  const dismissing = useRef(false);
  const mounted = useRef(false);
  const simulating = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(dismissTimer.current);
    };
  }, []);

  function dismiss(callback, immediate = false) {
    if (dismissing.current || !mounted.current) return;
    dismissing.current = true;
    if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      callback();
      return;
    }
    setLeaving(true);
    dismissTimer.current = setTimeout(callback, 180);
  }

  async function handleSimulate(event) {
    if (simulating.current || dismissing.current) return;
    const keyboardInitiated = event.detail === 0;
    simulating.current = true;
    setLoading(true);
    try {
      const succeeded = await onSimulate(1);
      if (succeeded) dismiss(onStart, keyboardInitiated);
    } finally {
      simulating.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <main
      className={`landing-page${leaving ? " is-leaving" : ""}`}
      aria-labelledby="landing-title"
    >
      <div className="landing-content">
        <div className="landing-brand-dot" aria-hidden="true" />
        <h1 id="landing-title" className="landing-title">Nothing Bandit™</h1>
        <div className="landing-description">
          <p className="landing-summary">
            183-day SEA marketing campaign simulation
          </p>
          <p className="landing-details">
            Thompson Sampling · 6 Channels · 3 Objectives
          </p>
        </div>
        <div className="landing-actions">
          <button
            type="button"
            className="landing-button landing-button-primary"
            onClick={event => dismiss(onGetStarted, event.detail === 0)}
            disabled={loading || leaving}
          >
            Read tutorial
          </button>
          <button
            type="button"
            className="landing-button landing-button-secondary"
            onClick={handleSimulate}
            disabled={loading || leaving}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="landing-spinner" aria-hidden="true" />
                Simulating…
              </>
            ) : "+1 Day (skip tutorial)"}
          </button>
        </div>
        {error && (
          <p role="alert" className="landing-error">
            {error}
          </p>
        )}
      </div>
      <footer className="landing-footer">
        Nothing Technology Ltd · Prototype
      </footer>
    </main>
  );
}
