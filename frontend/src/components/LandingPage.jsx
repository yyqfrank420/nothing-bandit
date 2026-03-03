/**
 * File: LandingPage.jsx
 * Language: JavaScript (React 18)
 * Purpose: Full-screen title screen shown on first load (day 0 only).
 *          Bypassed automatically if simulation data already exists (day > 0).
 *
 * Connects to: App.jsx
 * Inputs:
 *   onStart    — callback: enter dashboard at day 0 (no simulation)
 *   onSimulate — callback(nDays): simulate n days then enter dashboard
 * Outputs: Full-viewport React element
 */

import React, { useEffect, useState } from "react";

export default function LandingPage({ onStart, onSimulate }) {
  const [visible,  setVisible]  = useState(false);   // controls fade-in
  const [leaving,  setLeaving]  = useState(false);   // controls fade-out
  const [loading,  setLoading]  = useState(false);   // +1 Day in progress

  // Slight delay before fade-in so browser has painted the initial black frame.
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Fade out, then call the callback once the transition is done.
  function dismiss(cb) {
    setLeaving(true);
    setTimeout(cb, 500);
  }

  async function handleSimulate() {
    setLoading(true);
    await onSimulate(1);
    dismiss(onStart);
  }

  const opacity = leaving ? 0 : visible ? 1 : 0;

  return (
    <>
      {/* Keyframes only needed here — scoped to this component */}
      <style>{`
        @keyframes dotPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0.4); }
          50%       { box-shadow: 0 0 0 18px rgba(255,0,0,0); }
        }
        @keyframes landingFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        position:        "fixed",
        inset:           0,
        background:      "#0D0D0D",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        justifyContent:  "center",
        zIndex:          2000,
        opacity,
        transition:      "opacity 500ms ease",
        userSelect:      "none",
      }}>

        {/* Subtle dot-grid background — same vibe as Nothing's product pages */}
        <div style={{
          position:   "absolute",
          inset:      0,
          backgroundImage: "radial-gradient(circle, #1A1A1A 1px, transparent 1px)",
          backgroundSize:  "28px 28px",
          opacity:    0.5,
          pointerEvents: "none",
        }} />

        {/* Center content */}
        <div style={{
          position:      "relative",
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           "0",
          textAlign:     "center",
        }}>

          {/* Nothing red dot — large version with slow pulse */}
          <div style={{
            width:        "18px",
            height:       "18px",
            borderRadius: "50%",
            background:   "#FF0000",
            animation:    "dotPulse 2.8s ease-in-out infinite",
            marginBottom: "40px",
            animationDelay: "0.8s",
            // Entrance
            opacity:    visible ? 1 : 0,
            transform:  visible ? "scale(1)" : "scale(0.4)",
            transition: "opacity 500ms ease 0ms, transform 500ms cubic-bezier(0.34,1.56,0.64,1) 0ms",
          }} />

          {/* Title */}
          <div style={{
            fontFamily:     "Ndot55, monospace",
            fontSize:       "clamp(32px, 6vw, 60px)",
            color:          "#F0F0F0",
            letterSpacing:  "0.12em",
            textTransform:  "uppercase",
            lineHeight:     1,
            marginBottom:   "20px",
            animation:      visible ? "landingFadeUp 600ms ease 150ms both" : "none",
          }}>
            Nothing Bandit™
          </div>

          {/* Descriptor row */}
          <div style={{
            fontFamily:    "LetteraMonoLL, monospace",
            fontSize:      "11px",
            color:         "#444",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom:  "8px",
            animation:     visible ? "landingFadeUp 600ms ease 300ms both" : "none",
          }}>
            Thompson Sampling · 6 Channels · 3 Objectives
          </div>

          <div style={{
            fontFamily:    "LetteraMonoLL, monospace",
            fontSize:      "10px",
            color:         "#2E2E2E",
            letterSpacing: "0.1em",
            marginBottom:  "64px",
            animation:     visible ? "landingFadeUp 600ms ease 380ms both" : "none",
          }}>
            183-day SEA marketing campaign simulation
          </div>

          {/* CTA buttons */}
          <div style={{
            display:   "flex",
            gap:       "12px",
            animation: visible ? "landingFadeUp 600ms ease 500ms both" : "none",
          }}>
            {/* Start — enter dashboard at day 0 */}
            <button
              onClick={() => dismiss(onStart)}
              disabled={loading}
              style={{
                padding:       "12px 28px",
                background:    "transparent",
                border:        "1px solid #333",
                borderRadius:  "3px",
                color:         "#888",
                fontFamily:    "LetteraMonoLL, monospace",
                fontSize:      "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor:        loading ? "not-allowed" : "pointer",
                transition:    "all 200ms ease",
                opacity:       loading ? 0.4 : 1,
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.borderColor = "#555";
                  e.currentTarget.style.color       = "#C0C0C0";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#333";
                e.currentTarget.style.color       = "#888";
              }}
            >
              Start →
            </button>

            {/* +1 Day — simulate one day then enter dashboard */}
            <button
              onClick={handleSimulate}
              disabled={loading}
              style={{
                padding:       "12px 28px",
                background:    loading ? "#1A1A1A" : "#FF0000",
                border:        "1px solid",
                borderColor:   loading ? "#333" : "#FF0000",
                borderRadius:  "3px",
                color:         loading ? "#555" : "#FFFFFF",
                fontFamily:    "LetteraMonoLL, monospace",
                fontSize:      "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor:        loading ? "not-allowed" : "pointer",
                transition:    "all 200ms ease",
                display:       "flex",
                alignItems:    "center",
                gap:           "8px",
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.background  = "#CC0000";
                  e.currentTarget.style.borderColor = "#CC0000";
                }
              }}
              onMouseLeave={e => {
                if (!loading) {
                  e.currentTarget.style.background  = "#FF0000";
                  e.currentTarget.style.borderColor = "#FF0000";
                }
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: "10px", height: "10px",
                    border: "1px solid #444", borderTopColor: "#888",
                    borderRadius: "50%",
                    animation: "spin 500ms linear infinite",
                    flexShrink: 0,
                  }} />
                  Simulating…
                </>
              ) : "+1 Day"}
            </button>
          </div>
        </div>

        {/* Bottom label */}
        <div style={{
          position:      "absolute",
          bottom:        "32px",
          fontFamily:    "LetteraMonoLL, monospace",
          fontSize:      "9px",
          color:         "#222",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          animation:     visible ? "landingFadeUp 600ms ease 700ms both" : "none",
        }}>
          Nothing Technology Ltd · Prototype
        </div>

      </div>
    </>
  );
}
