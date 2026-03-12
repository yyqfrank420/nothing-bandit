/**
 * File: GuidedTour.jsx
 * Language: JavaScript (React 18)
 * Purpose: Full user guide flow triggered by "Get Started" on the landing page.
 *          Phase 1 — UserGuide: a 5-slide educational wizard explaining the
 *            problem, algorithm, prototype, what's real vs simulated, and
 *            how to read the dashboard. Written for business stakeholders.
 *          Phase 2 — Spotlight tour: 3 sequential steps highlighting key
 *            dashboard areas (controls, allocation grid, business outcomes).
 *
 * Connects to: App.jsx — receives show (bool) and onDone (callback)
 *              DOM elements with data-tour attributes in App.jsx
 * Inputs:
 *   show   — true = render user guide, false = render nothing
 *   onDone — called when user finishes or skips both phases
 * Outputs: React portal overlay rendered into document.body
 */

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// User Guide slide definitions
// ---------------------------------------------------------------------------

const GUIDE_SLIDES = [
  {
    tag:   "THE SCENARIO",
    title: "You Have $10K. Six Channels. No Playbook.",
    body: [
      {
        bold: "The brief",
        text: "you're launching a consumer electronics product across Southeast Asia. Six digital channels: KOL partnerships, Instagram Ads, TikTok Ads, Google Search. Daily budget: $10,000. Question: how do you split it?",
      },
      {
        bold: "What most teams do",
        text: "equal splits, or last quarter's numbers. Simple, auditable, and quietly expensive — because not every channel performs the same, and the split never adjusts.",
      },
      {
        bold: "The hidden cost",
        text: "in this simulation, Google Search converts 4× better than Generic KOL. A static equal split sends 17% of budget to the worst performer every single day — that's not a rounding error, it's structural waste.",
      },
      {
        bold: "The question this answers",
        text: "what if the budget allocated itself — observing daily results and shifting spend toward what's actually working, automatically, every day?",
      },
    ],
    accent: null,
  },
  {
    tag:   "THE ALGORITHM",
    title: "Thompson Sampling",
    body: [
      {
        bold: "What it is",
        text: "a reinforcement learning algorithm from the Multi-Armed Bandit family. Named after the \"explore vs exploit\" tradeoff — do you keep playing the slot machine that paid out, or try others?",
      },
      {
        bold: "How it works",
        text: "each channel gets a Beta(α, β) distribution — a probabilistic belief about its true performance rate. Each day: sample from each belief, allocate more budget to the highest draw. Update beliefs from observed results.",
      },
      {
        bold: "Why not A/B testing",
        text: "A/B tests freeze budget during the test period, wasting it on underperformers just to gather data. Thompson Sampling explores and exploits simultaneously — the exploration tax is proportional, not total.",
      },
      {
        bold: "In plain English",
        text: "the algorithm starts uncertain, stays curious about channels it hasn't seen enough of, and steadily bets more on proven winners. The confidence distributions at the bottom of the dashboard show this learning in real time.",
      },
    ],
    accent: null,
  },
  {
    tag:   "THE PROTOTYPE",
    title: "What You're Seeing",
    body: [
      {
        bold: "6 digital channels",
        text: "Tech KOL, Design KOL, Generic KOL, Instagram Ads, TikTok Ads, Google Search — representing the SEA digital media mix for a consumer electronics launch.",
      },
      {
        bold: "3 independent bandits",
        text: "CTR (click-through rate), ROAS (revenue per dollar spent), and CAC (cost per acquisition) each run their own bandit with their own Beta posteriors. They may disagree on which channel is \"best\".",
      },
      {
        bold: "183-day campaign",
        text: "half a year of daily allocation decisions. The learning curve is visible: early days = wide exploration, later days = concentrated bets on proven channels.",
      },
      {
        bold: "Static baseline",
        text: "a naïve equal-split allocator runs in parallel every day. Every chart shows both lines — the bandit's edge (or lack of it) is the gap between them.",
      },
    ],
    accent: null,
  },
  {
    tag:    "TRANSPARENCY",
    title:  "What's Real vs Simulated",
    twoCol: true,
    real: [
      "Thompson Sampling decision logic",
      "Beta(α, β) posterior update rule",
      "Explore/exploit balancing mechanism",
      "Multi-objective parallel architecture",
      "Shock event adaptation (same algorithm — new data)",
      "API + database layer (FastAPI + Postgres)",
    ],
    simulated: [
      "Channel base rates set by us (CTR, ROAS, CAC means + σ)",
      "Daily impression/conversion simulation from those parameters",
      "Revenue figures (no real payment processor)",
      "6 pre-written SEA shock scenarios",
      "The \"market\" itself — not real ad platform data",
    ],
    note: "Swap the simulation layer for live API calls (Meta Ads, Google Ads API) and the algorithm runs identically with zero changes.",
  },
  {
    tag:   "THE DASHBOARD",
    title: "How to Read It",
    body: [
      {
        bold: "Budget Allocation (top charts)",
        text: "stacked area — watch budget migrate away from weak channels over time. Vertical red lines mark market shock events.",
      },
      {
        bold: "Bandit vs Static (lower charts)",
        text: "cumulative performance comparison. The gap should widen as the bandit accumulates evidence. CAC chart is inverted — lower = top of chart = better.",
      },
      {
        bold: "Confidence distributions (bottom)",
        text: "Beta(α, β) curves per channel. Tall narrow peak = confident about this channel. Wide flat curve = still exploring. The mode % label shows the most likely true performance rate.",
      },
      {
        bold: "Business Outcomes (full-width section)",
        text: "KPI cards — revenue, CAC, ROAS, conversions — comparing bandit vs static cumulatively. Toggle CTR / ROAS / CAC tabs to filter by objective.",
      },
    ],
    accent: "After this guide, a 3-step tour will highlight the controls, charts, and outcome metrics.",
  },
];

// ---------------------------------------------------------------------------
// Spotlight tour step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  {
    target:  "controls",
    title:   "Run the Simulation",
    bullets: [
      { bold: "+1 Day / +1 Wk / +1 Mo", text: "step time forward and watch the bandit adapt." },
      { bold: "Auto",                    text: "runs continuously — speed is adjustable in ⚙ Settings." },
      { bold: "⚡ Shock",               text: "injects a live SEA market event and forces re-adaptation." },
    ],
    position: "bottom",
  },
  {
    target:  "allocation-grid",
    title:   "Watch Budget Shift",
    bullets: [
      { bold: "3 independent bandits",  text: "— one each for CTR, ROAS, and CAC." },
      { bold: "Stacked area chart",     text: "shows budget migrating to proven winners over time." },
      { bold: "Hover the shock lines",  text: "to see what market event triggered each disruption." },
    ],
    position: "bottom",
  },
  {
    target:  "business-outcomes",
    title:   "Measure the Outcome",
    bullets: [
      { bold: "Revenue, CAC, ROAS, Conversions", text: "— all tracked cumulatively." },
      { bold: "Solid line = bandit",             text: "— dashed line = static baseline." },
      { bold: "Objective tabs",                  text: "filter all KPI charts to a single bandit objective." },
    ],
    position: "bottom",
  },
];

const PADDING = 14;

// ---------------------------------------------------------------------------
// Shared button styles
// ---------------------------------------------------------------------------

const btnSecondary = {
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
};

const btnPrimary = {
  padding:       "9px 22px",
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
};

// ---------------------------------------------------------------------------
// UserGuide — 5-slide educational wizard
// ---------------------------------------------------------------------------

function UserGuide({ onDone, onSkip }) {
  const [slide, setSlide] = useState(0);
  const total = GUIDE_SLIDES.length;
  const current = GUIDE_SLIDES[slide];
  const isLast  = slide === total - 1;

  return createPortal(
    <>
      {/* Dimmed overlay — clicking outside skips */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9000 }}
        onClick={onSkip}
      />

      {/* Positioning shell — no animation on this div, only on the card inside */}
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
        {/* Guide card — onWheel stopPropagation lets trackpad scroll inside
            the card without triggering the page-scroll blocker on window */}
        <div
          onWheel={(e) => e.stopPropagation()}
          style={{
            width:        "540px",
            maxHeight:    "88vh",
            overflowY:    "auto",
            background:   "#141414",
            border:       "1px solid #2A2A2A",
            borderRadius: "4px",
            fontFamily:   "LetteraMonoLL, monospace",
            boxShadow:    "0 12px 60px rgba(0,0,0,0.7)",
            animation:    "fadeIn 250ms ease",
          }}
        >

          {/* Header bar */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            padding:      "16px 28px",
            borderBottom: "1px solid #1E1E1E",
          }}>
            {/* Brand */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-accent)", flexShrink: 0 }} />
              <span style={{ fontFamily: "Ndot55, monospace", fontSize: "11px", color: "#666", letterSpacing: "0.12em" }}>
                NOTHING BANDIT™
              </span>
            </div>
            {/* Tag */}
            <span style={{ fontSize: "9px", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              USER GUIDE
            </span>
          </div>

          {/* Slide content */}
          <div style={{ padding: "28px 28px 20px" }}>

            {/* Slide tag */}
            <div style={{
              fontSize:      "9px",
              color:         "var(--color-accent)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom:  "10px",
            }}>
              {current.tag}
            </div>

            {/* Slide title */}
            <div style={{
              fontFamily:    "Ndot55, monospace",
              fontSize:      "16px",
              color:         "#F0F0F0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom:  "22px",
              lineHeight:    1.3,
            }}>
              {current.title}
            </div>

            {/* Two-column layout for Real vs Simulated slide */}
            {current.twoCol ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                {/* Real column */}
                <div>
                  <div style={{ fontSize: "9px", color: "var(--color-positive)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "11px" }}>✓</span> Real
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {current.real.map((item, i) => (
                      <li key={i} style={{ display: "flex", gap: "7px", fontSize: "10px", color: "#888", lineHeight: "1.5" }}>
                        <span style={{ color: "var(--color-positive)", flexShrink: 0, marginTop: "1px" }}>—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Simulated column */}
                <div>
                  <div style={{ fontSize: "9px", color: "#888", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "11px" }}>~</span> Simulated
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {current.simulated.map((item, i) => (
                      <li key={i} style={{ display: "flex", gap: "7px", fontSize: "10px", color: "#666", lineHeight: "1.5" }}>
                        <span style={{ color: "#444", flexShrink: 0, marginTop: "1px" }}>—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              /* Standard bullet list for all other slides */
              <ul style={{ margin: "0 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "13px", marginBottom: "20px" }}>
                {current.body.map((b, i) => (
                  <li key={i} style={{ display: "flex", gap: "10px", fontSize: "11px", color: "#888", lineHeight: "1.6" }}>
                    <span style={{ color: "#444", flexShrink: 0, marginTop: "1px" }}>—</span>
                    <span>
                      <strong style={{ color: "#C0C0C0", fontWeight: "600" }}>{b.bold}:</strong>
                      {" "}{b.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Note / accent line at bottom of slide (optional) */}
            {(current.note || current.accent) && (
              <div style={{
                padding:      "10px 14px",
                background:   "rgba(255,255,255,0.02)",
                borderLeft:   "2px solid #333",
                fontSize:     "10px",
                color:        "#555",
                lineHeight:   "1.6",
                marginBottom: "4px",
                marginTop:    current.twoCol ? "0" : "-6px",
              }}>
                {current.note || current.accent}
              </div>
            )}
          </div>

          {/* Footer: progress dots + navigation */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "14px 28px 20px",
            borderTop:      "1px solid #1A1A1A",
          }}>
            {/* Progress dots */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {GUIDE_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  style={{
                    width:        i === slide ? "14px" : "6px",
                    height:       "6px",
                    borderRadius: "3px",
                    background:   i === slide ? "var(--color-accent)" : "#2A2A2A",
                    border:       "none",
                    cursor:       "pointer",
                    padding:      0,
                    transition:   "all 250ms ease",
                    flexShrink:   0,
                  }}
                  title={`Slide ${i + 1}`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <button
                onClick={onSkip}
                style={{
                  ...btnSecondary,
                  color:         "#666",
                  border:        "1px solid #2A2A2A",
                  borderRadius:  "3px",
                  padding:       "7px 14px",
                  fontSize:      "10px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#C0C0C0"; e.currentTarget.style.borderColor = "#555"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#666";    e.currentTarget.style.borderColor = "#2A2A2A"; }}
              >
                Skip to Dashboard →
              </button>

              {slide > 0 && (
                <button
                  onClick={() => setSlide((s) => s - 1)}
                  style={{ ...btnSecondary, color: "#555" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; }}
                >
                  ← Back
                </button>
              )}

              <button
                onClick={isLast ? onDone : () => setSlide((s) => s + 1)}
                style={btnPrimary}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#888"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; }}
              >
                {isLast ? "Start Tour →" : "Next →"}
              </button>
            </div>
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
 * The "hole" is created by a transparent <div> positioned exactly over the target
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
          position:      "fixed",
          zIndex:        9002,
          width:         "320px",
          ...tipStyle,
          background:    "#161616",
          border:        "1px solid #2A2A2A",
          borderRadius:  "4px",
          padding:       "20px 24px",
          fontFamily:    "LetteraMonoLL, monospace",
          boxShadow:     "0 8px 40px rgba(0,0,0,0.6)",
          animation:     "fadeIn 300ms ease",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step counter */}
        <div style={{ fontSize: "9px", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>
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

        {/* Bullets */}
        <ul style={{ margin: "0 0 20px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
          {step.bullets.map((b, i) => (
            <li key={i} style={{ fontSize: "11px", color: "#888", lineHeight: "1.5", display: "flex", gap: "8px" }}>
              <span style={{ color: "#555", flexShrink: 0 }}>—</span>
              <span>
                <strong style={{ color: "#C0C0C0", fontWeight: "600" }}>"{b.bold}"</strong>
                {" "}{b.text}
              </span>
            </li>
          ))}
        </ul>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onSkip}
            style={btnSecondary}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#444"; }}
          >
            Skip Tour
          </button>

          <button
            onClick={onNext}
            style={btnPrimary}
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
// Main export
// ---------------------------------------------------------------------------

/**
 * GuidedTour
 *
 * Two-phase flow:
 *   Phase 1: UserGuide (5 educational slides) — purely modal, no DOM targeting
 *   Phase 2: Spotlight tour (3 steps) — highlights specific dashboard elements
 *
 * Purely controlled: parent sets show=true to start, onDone fires when finished.
 * "Get Started" on LandingPage is the only entry point.
 */
export default function GuidedTour({ show, onDone }) {
  const [phase,     setPhase]     = useState("guide");  // "guide" | "spotlight"
  const [stepIndex, setStepIndex] = useState(0);
  const [rect,      setRect]      = useState(null);

  // Reset to phase 1 whenever the tour is freshly triggered.
  useEffect(() => {
    if (show) {
      setPhase("guide");
      setStepIndex(0);
      setRect(null);
    }
  }, [show]);

  // Block user-initiated scrolling while the tour is active.
  useEffect(() => {
    if (!show) return;
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
    const blockWheel = (e) => e.preventDefault();
    const blockTouch = (e) => e.preventDefault();
    const blockKeys  = (e) => { if (SCROLL_KEYS.has(e.key)) e.preventDefault(); };
    window.addEventListener("wheel",     blockWheel, { passive: false });
    window.addEventListener("touchmove", blockTouch, { passive: false });
    window.addEventListener("keydown",   blockKeys);
    return () => {
      window.removeEventListener("wheel",     blockWheel);
      window.removeEventListener("touchmove", blockTouch);
      window.removeEventListener("keydown",   blockKeys);
    };
  }, [show]);

  // Measure the current spotlight step's target element.
  const measureTarget = useCallback(() => {
    if (!show || phase !== "spotlight") return;
    const target = STEPS[stepIndex]?.target;
    if (!target) return;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return;
    setRect(el.getBoundingClientRect());
  }, [show, phase, stepIndex]);

  useLayoutEffect(() => {
    measureTarget();
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [measureTarget]);

  // Scroll target into view then re-measure once scroll settles.
  useEffect(() => {
    if (!show || phase !== "spotlight") return;
    const target = STEPS[stepIndex]?.target;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(measureTarget, 450);
    return () => clearTimeout(t);
  }, [show, phase, stepIndex, measureTarget]);

  const handleSkip = useCallback(() => { onDone?.(); }, [onDone]);

  const handleNext = useCallback(() => {
    const next = stepIndex + 1;
    if (next >= STEPS.length) {
      onDone?.();
    } else {
      setStepIndex(next);
    }
  }, [stepIndex, onDone]);

  if (!show) return null;

  // Phase 1: educational guide
  if (phase === "guide") {
    return (
      <UserGuide
        onDone={() => { setPhase("spotlight"); setStepIndex(0); }}
        onSkip={handleSkip}
      />
    );
  }

  // Phase 2: spotlight tour
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
