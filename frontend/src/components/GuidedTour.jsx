/**
 * File: GuidedTour.jsx
 * Language: JavaScript (React 18)
 * Purpose: Controlled spotlight tour — 3 sequential steps highlighting key dashboard
 *          areas. Shows only when the parent explicitly passes show={true}.
 *          No auto-start, no cookie gating. The LandingPage "Get Started" button
 *          is the sole entry point; this component just renders the spotlights.
 *
 *          Spotlight technique: a transparent <div> over the target element with a
 *          large box-shadow creates the dim overlay + cutout in pure CSS — no canvas
 *          or SVG clipping needed.
 *
 * Connects to: App.jsx — receives show (bool) and onDone (callback)
 *              DOM elements with data-tour attributes in App.jsx + BusinessMetricsChart.jsx
 * Inputs:
 *   show   — true = render spotlight sequence, false = render nothing
 *   onDone — called when user finishes or skips the tour
 * Outputs: React portal overlay rendered into document.body
 */

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Tour step definitions — each step targets a data-tour DOM attribute
// ---------------------------------------------------------------------------

const STEPS = [
  {
    target:   "controls",          // data-tour="controls" in App.jsx header
    title:    "Run the Simulation",
    bullets: [
      { bold: "+1 Day / +1 Wk / +1 Mo", text: "step time forward and watch the bandit adapt." },
      { bold: "Auto",                    text: "runs continuously at a configurable tick speed." },
      { bold: "Shock",                   text: "injects a live SEA market event — forces re-adaptation." },
    ],
    position: "bottom",
  },
  {
    target:   "allocation-grid",   // data-tour="allocation-grid" in App.jsx
    title:    "Watch Budget Shift",
    bullets: [
      { bold: "3 independent bandits",   text: "— one each for CTR, ROAS, and CAC." },
      { bold: "Stacked area chart",      text: "shows budget migrating to proven winners over time." },
      { bold: "Confidence accumulates",  text: "— weak channels lose share as the bandit learns." },
    ],
    position: "bottom",
  },
  {
    target:   "business-outcomes", // data-tour="business-outcomes" section label in App.jsx
    title:    "Measure the Outcome",
    bullets: [
      { bold: "Revenue, CAC, ROAS, Conversions", text: "— all tracked cumulatively." },
      { bold: "Solid line = bandit",             text: "— dashed line = static baseline." },
      { bold: "Hover any KPI card",              text: "for exact figures at any point in time." },
    ],
    position: "bottom",
  },
];

// Extra pixels of breathing room between the target element edge and the spotlight ring.
const PADDING = 14;

// ---------------------------------------------------------------------------
// WelcomePane — full-screen dimmed overlay with centered intro card
// ---------------------------------------------------------------------------

function WelcomePane({ onStart, onSkip }) {
  return createPortal(
    <>
      {/* Dimmed overlay — clicking outside skips */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9000 }}
        onClick={onSkip}
      />

      {/* Positioning shell — transform must not be animated or it fights translate(-50%,-50%) */}
      <div
        style={{
          position:  "fixed",
          top:       "50%",
          left:      "50%",
          transform: "translate(-50%, -50%)",
          zIndex:    9001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
      {/* Animated content card — animation is scoped here so it only affects opacity+Y */}
      <div style={{
        width:        "400px",
        background:   "#161616",
        border:       "1px solid #2A2A2A",
        borderRadius: "4px",
        padding:      "36px 40px",
        fontFamily:   "LetteraMonoLL, monospace",
        boxShadow:    "0 8px 40px rgba(0,0,0,0.6)",
        animation:    "fadeIn 300ms ease",
      }}>
        {/* Nothing red dot */}
        <div style={{
          width:        "10px",
          height:       "10px",
          borderRadius: "50%",
          background:   "#FF0000",
          marginBottom: "24px",
        }} />

        {/* Title */}
        <div style={{
          fontFamily:    "Ndot55, monospace",
          fontSize:      "15px",
          color:         "#F0F0F0",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom:  "6px",
        }}>
          Nothing Bandit™
        </div>

        {/* Tag line */}
        <div style={{
          fontSize:      "10px",
          color:         "#444",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom:  "28px",
        }}>
          Thompson Sampling · 6 Channels · 3 Objectives
        </div>

        {/* Bullets */}
        <ul style={{ margin: "0 0 32px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { bold: "What it does",   text: "allocates a daily marketing budget across 6 digital channels using Thompson Sampling — a Bayesian algorithm that learns which channels convert best." },
            { bold: "Why it matters", text: "static splits waste 10–30% on underperformers. the bandit adapts in real time." },
            { bold: "This tour",      text: "walks through the controls, budget allocation charts, and outcome metrics." },
          ].map((b, i) => (
            <li key={i} style={{ fontSize: "11px", color: "#888", lineHeight: "1.6", display: "flex", gap: "8px" }}>
              <span style={{ color: "#555", flexShrink: 0 }}>—</span>
              <span>
                <strong style={{ color: "#C0C0C0", fontWeight: "600" }}>{b.bold}:</strong>
                {" "}{b.text}
              </span>
            </li>
          ))}
        </ul>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onSkip}
            style={{
              background:    "none",
              border:        "none",
              color:         "#444",
              fontSize:      "10px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              cursor:        "pointer",
              fontFamily:    "LetteraMonoLL, monospace",
              padding:       0,
              transition:    "color 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#444"; }}
          >
            Skip Tour
          </button>

          <button
            onClick={onStart}
            style={{
              padding:       "8px 20px",
              background:    "#1A1A1A",
              border:        "1px solid #444",
              borderRadius:  "3px",
              color:         "#F0F0F0",
              fontSize:      "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor:        "pointer",
              fontFamily:    "LetteraMonoLL, monospace",
              transition:    "border-color 200ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; }}
          >
            Start Tour →
          </button>
        </div>
      </div>
      </div>
    </>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Spotlight — dark overlay with cutout + tooltip callout for one step
// ---------------------------------------------------------------------------

/**
 * The "hole" is created by a transparent div positioned exactly over the target
 * element. A massive box-shadow (0 0 0 9999px rgba(0,0,0,0.82)) fills everything
 * OUTSIDE that div with a dark overlay. The div itself is transparent — the
 * element underneath stays fully visible and interactive.
 */
function Spotlight({ step, stepIndex, totalSteps, rect, onNext, onSkip }) {
  if (!rect) return null;

  const boxLeft   = rect.left   - PADDING;
  const boxTop    = rect.top    - PADDING;
  const boxWidth  = rect.width  + PADDING * 2;
  const boxHeight = rect.height + PADDING * 2;

  // Clamp tooltip horizontally so it doesn't overflow the viewport.
  const isBottom = step.position === "bottom";
  const tipLeft  = Math.max(16, Math.min(
    window.innerWidth - 336,
    boxLeft + boxWidth / 2 - 160,
  ));
  const tipStyle = isBottom
    ? { top:  `${boxTop + boxHeight + 16}px`, left: `${tipLeft}px` }
    : { top:  `${boxTop - 16}px`,             left: `${tipLeft}px`, transform: "translateY(-100%)" };

  return createPortal(
    <>
      {/* Full-screen click-trap — clicking anywhere outside the tooltip skips */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9000 }}
        onClick={onSkip}
      />

      {/* Spotlight cutout */}
      <div
        style={{
          position:      "fixed",
          left:          `${boxLeft}px`,
          top:           `${boxTop}px`,
          width:         `${boxWidth}px`,
          height:        `${boxHeight}px`,
          borderRadius:  "4px",
          boxShadow:     "0 0 0 9999px rgba(0,0,0,0.82)",
          outline:       "1px solid rgba(255,255,255,0.07)",
          zIndex:        9001,
          pointerEvents: "none",
          transition:    [
            "left 360ms cubic-bezier(0.22,1,0.36,1)",
            "top 360ms cubic-bezier(0.22,1,0.36,1)",
            "width 360ms cubic-bezier(0.22,1,0.36,1)",
            "height 360ms cubic-bezier(0.22,1,0.36,1)",
          ].join(", "),
        }}
      />

      {/* Tooltip callout */}
      <div
        style={{
          position:     "fixed",
          zIndex:       9002,
          width:        "320px",
          ...tipStyle,
          background:   "#161616",
          border:       "1px solid #2A2A2A",
          borderRadius: "4px",
          padding:      "20px 24px",
          fontFamily:   "LetteraMonoLL, monospace",
          boxShadow:    "0 8px 40px rgba(0,0,0,0.6)",
          animation:    "fadeIn 300ms ease",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step counter */}
        <div style={{
          fontSize:      "9px",
          color:         "#444",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom:  "10px",
        }}>
          {stepIndex + 1} / {totalSteps}
        </div>

        {/* Title */}
        <div style={{
          fontFamily:    "Ndot55, monospace",
          fontSize:      "13px",
          color:         "#F0F0F0",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom:  "10px",
          lineHeight:    1.3,
        }}>
          {step.title}
        </div>

        {/* Bullet points */}
        <ul style={{
          margin:      "0 0 20px 0",
          padding:     "0",
          listStyle:   "none",
          display:     "flex",
          flexDirection: "column",
          gap:         "7px",
        }}>
          {step.bullets.map((b, i) => (
            <li key={i} style={{ fontSize: "11px", color: "#888", lineHeight: "1.5", display: "flex", gap: "8px" }}>
              <span style={{ color: "#555", flexShrink: 0 }}>—</span>
              <span>
                <strong style={{ color: "#C0C0C0", fontWeight: "600" }}>
                  "{b.bold}"
                </strong>
                {" "}{b.text}
              </span>
            </li>
          ))}
        </ul>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onSkip}
            style={{
              background:    "none",
              border:        "none",
              color:         "#444",
              fontSize:      "10px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              cursor:        "pointer",
              fontFamily:    "LetteraMonoLL, monospace",
              padding:       0,
              transition:    "color 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#444"; }}
          >
            Skip Tour
          </button>

          <button
            onClick={onNext}
            style={{
              padding:       "8px 20px",
              background:    "#1A1A1A",
              border:        "1px solid #444",
              borderRadius:  "3px",
              color:         "#F0F0F0",
              fontSize:      "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor:        "pointer",
              fontFamily:    "LetteraMonoLL, monospace",
              transition:    "border-color 200ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; }}
          >
            {stepIndex < totalSteps - 1 ? "Next →" : "Done"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Main export — controlled by show/onDone props, no internal auto-start logic
// ---------------------------------------------------------------------------

/**
 * GuidedTour
 *
 * Purely controlled: parent sets show=true to start, onDone fires when finished.
 * The LandingPage "Get Started" button is the only trigger.
 *
 * Props:
 *   show   {boolean}   — whether the tour is currently active
 *   onDone {function}  — called when user completes or skips all steps
 */
export default function GuidedTour({ show, onDone }) {
  const [stepIndex,    setStepIndex]    = useState(0);
  const [rect,         setRect]         = useState(null);
  const [showWelcome,  setShowWelcome]  = useState(false);

  // Reset to step 0 and show welcome pane whenever the tour is freshly triggered.
  useEffect(() => {
    if (show) {
      setStepIndex(0);
      setRect(null);
      setShowWelcome(true);
    }
  }, [show]);

  // Block user-initiated scrolling while the tour is active.
  // Programmatic scrollIntoView() bypasses these event listeners and still works.
  // passive: false is required to call preventDefault() on wheel and touchmove.
  useEffect(() => {
    if (!show) return;
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
    const blockWheel    = (e) => e.preventDefault();
    const blockTouch    = (e) => e.preventDefault();
    const blockKeys     = (e) => { if (SCROLL_KEYS.has(e.key)) e.preventDefault(); };
    window.addEventListener("wheel",     blockWheel, { passive: false });
    window.addEventListener("touchmove", blockTouch, { passive: false });
    window.addEventListener("keydown",   blockKeys);
    return () => {
      window.removeEventListener("wheel",     blockWheel);
      window.removeEventListener("touchmove", blockTouch);
      window.removeEventListener("keydown",   blockKeys);
    };
  }, [show]);

  // Measure the current step's target element.
  // useLayoutEffect = synchronous read after DOM paint, so no flicker on first render.
  const measureTarget = useCallback(() => {
    if (!show) return;
    const target = STEPS[stepIndex]?.target;
    if (!target) return;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return;
    setRect(el.getBoundingClientRect());
  }, [show, stepIndex]);

  useLayoutEffect(() => {
    measureTarget();
    window.addEventListener("resize", measureTarget);
    // Capture phase catches scroll on any scrollable ancestor, not just window.
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [measureTarget]);

  // Scroll target into view then re-measure once scroll animation settles.
  useEffect(() => {
    if (!show) return;
    const target = STEPS[stepIndex]?.target;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(measureTarget, 450);
    return () => clearTimeout(t);
  }, [show, stepIndex, measureTarget]);

  const handleSkip = useCallback(() => {
    onDone?.();
  }, [onDone]);

  const handleNext = useCallback(() => {
    const next = stepIndex + 1;
    if (next >= STEPS.length) {
      onDone?.();
    } else {
      setStepIndex(next);
    }
  }, [stepIndex, onDone]);

  if (!show) return null;

  if (showWelcome) {
    return (
      <WelcomePane
        onStart={() => setShowWelcome(false)}
        onSkip={handleSkip}
      />
    );
  }

  return (
    <Spotlight
      step={STEPS[stepIndex]}
      stepIndex={stepIndex}
      totalSteps={STEPS.length}
      rect={rect}
      onNext={handleNext}
      onSkip={handleSkip}
    />
  );
}
