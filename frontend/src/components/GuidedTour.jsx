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

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function useTourDialog(onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    ref.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = [...ref.current.querySelectorAll("button:not([disabled])")];
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !controls.includes(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !controls.includes(active))) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);
  return ref;
}

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
  color:         "#A0A0A0",
  fontSize:      "12px",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  cursor:        "pointer",
  fontFamily:    "LetteraMonoLL, monospace",
  padding:       "8px 0",
  minHeight:     "44px",
  transition:    "color 150ms",
};

const btnPrimary = {
  padding:       "9px 22px",
  minHeight:     "44px",
  background:    "#1A1A1A",
  border:        "1px solid #444",
  borderRadius:  "3px",
  color:         "#F0F0F0",
  fontSize:      "12px",
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
  const dialogRef = useTourDialog(onSkip);
  const [slide, setSlide] = useState(0);
  const previousSlide = useRef(slide);
  useEffect(() => {
    if (previousSlide.current === slide) return;
    previousSlide.current = slide;
    dialogRef.current.scrollTop = 0;
    dialogRef.current.querySelector("#guide-title").focus({ preventScroll: true });
  }, [slide, dialogRef]);
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
        {/* Guide content scrolls independently of the dashboard. */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          tabIndex={-1}
          style={{
            width:        "min(540px, calc(100vw - 32px))",
            boxSizing:    "border-box",
            maxHeight:    "calc(100dvh - 32px)",
            overscrollBehavior: "contain",
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
              <span style={{ fontFamily: "Ndot55, monospace", fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.12em" }}>
                NOTHING BANDIT™
              </span>
            </div>
            {/* Tag */}
            <span style={{ fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.12em", textTransform: "uppercase" }}>
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
            <h2 id="guide-title" tabIndex={-1} aria-live="polite" style={{
              marginTop: 0,
              fontWeight: "normal",
              fontFamily:    "Ndot55, monospace",
              fontSize:      "16px",
              color:         "#F0F0F0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom:  "22px",
              lineHeight:    1.3,
            }}>
              {current.title}
            </h2>

            {/* Two-column layout for Real vs Simulated slide */}
            {current.twoCol ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap: "20px", marginBottom: "20px" }}>
                {/* Real column */}
                <div>
                  <div style={{ fontSize: "11px", color: "var(--color-positive)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "11px" }}>✓</span> Real
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {current.real.map((item, i) => (
                      <li key={i} style={{ display: "flex", gap: "7px", fontSize: "12px", color: "#A0A0A0", lineHeight: "1.5" }}>
                        <span style={{ color: "var(--color-positive)", flexShrink: 0, marginTop: "1px" }}>—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Simulated column */}
                <div>
                  <div style={{ fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontSize: "11px" }}>~</span> Simulated
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {current.simulated.map((item, i) => (
                      <li key={i} style={{ display: "flex", gap: "7px", fontSize: "12px", color: "#A0A0A0", lineHeight: "1.5" }}>
                        <span style={{ color: "#A0A0A0", flexShrink: 0, marginTop: "1px" }}>—</span>
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
                  <li key={i} style={{ display: "flex", gap: "10px", fontSize: "12px", color: "#A0A0A0", lineHeight: "1.6" }}>
                    <span style={{ color: "#A0A0A0", flexShrink: 0, marginTop: "1px" }}>—</span>
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
                fontSize:     "12px",
                color:        "#A0A0A0",
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
            flexWrap:       "wrap",
            gap:            "16px",
            borderTop:      "1px solid #1A1A1A",
          }}>
            {/* Progress dots */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {GUIDE_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  style={{
                    width:        "24px",
                    height:       "24px",
                    borderRadius: "3px",
                    background:   "transparent",
                    display:      "grid",
                    placeItems:   "center",
                    border:       "none",
                    cursor:       "pointer",
                    padding:      0,
                    transition:   "all 250ms ease",
                    flexShrink:   0,
                  }}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === slide ? "step" : undefined}
                  title={`Slide ${i + 1}`}
                >
                  <span aria-hidden="true" style={{
                    width: i === slide ? "14px" : "6px",
                    height: "6px",
                    borderRadius: "3px",
                    background: i === slide ? "var(--color-accent)" : "#555",
                  }} />
                </button>
              ))}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <button
                onClick={onSkip}
                style={{
                  ...btnSecondary,
                  color:         "#A0A0A0",
                  border:        "1px solid #2A2A2A",
                  borderRadius:  "3px",
                  padding:       "7px 14px",
                  fontSize:      "12px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#C0C0C0"; e.currentTarget.style.borderColor = "#555"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#A0A0A0";    e.currentTarget.style.borderColor = "#2A2A2A"; }}
              >
                Skip to Dashboard →
              </button>

              {slide > 0 && (
                <button
                  onClick={() => setSlide((s) => s - 1)}
                  style={{ ...btnSecondary, color: "#A0A0A0" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#A0A0A0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#A0A0A0"; }}
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
 * element underneath stays fully visible while the tour owns interaction.
 */
function Spotlight({ step, stepIndex, totalSteps, rect, onNext, onSkip }) {
  const dialogRef = useTourDialog(onSkip);
  const [tipHeight, setTipHeight] = useState(0);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      setTipHeight(dialogRef.current.getBoundingClientRect().height);
    });
    observer.observe(dialogRef.current);
    return () => observer.disconnect();
  }, [dialogRef]);

  const boxLeft = (rect?.left ?? 0) - PADDING;
  const boxTop = (rect?.top ?? 0) - PADDING;
  const boxWidth = (rect?.width ?? 0) + PADDING * 2;
  const boxHeight = (rect?.height ?? 0) + PADDING * 2;
  const tipWidth = Math.min(360, window.innerWidth - 32);
  const tipLeft = Math.max(16, Math.min(
    window.innerWidth - tipWidth - 16,
    boxLeft + boxWidth / 2 - tipWidth / 2,
  ));
  const desiredTop = rect
    ? (step.position === "bottom" ? boxTop + boxHeight + 16 : boxTop - tipHeight - 16)
    : (window.innerHeight - tipHeight) / 2;
  // Tall dashboard targets leave no outside space; keep navigation inside the viewport.
  const tipTop = Math.max(16, Math.min(desiredTop, window.innerHeight - tipHeight - 16));
  const tipStyle = { top: `${tipTop}px`, left: `${tipLeft}px` };

  return createPortal(
    <>
      {/* Full-screen click-trap — clicking anywhere outside the tooltip skips */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9000 }}
        onClick={onSkip}
      />

      {/* Spotlight cutout */}
      {rect && <div
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
      />}

      {/* Tooltip callout */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        style={{
          position:      "fixed",
          zIndex:        9002,
          width:         `${tipWidth}px`,
          boxSizing:     "border-box",
          maxHeight:     "calc(100dvh - 32px)",
          overflowY:     "auto",
          overscrollBehavior: "contain",
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
        <div style={{ fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>
          {stepIndex + 1} / {totalSteps}
        </div>

        {/* Title */}
        <h2 id="tour-title" aria-live="polite" style={{
          marginTop: 0,
          fontWeight: "normal",
          fontFamily:    "Ndot55, monospace",
          fontSize:      "13px",
          color:         "#F0F0F0",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom:  "10px",
          lineHeight:    1.3,
        }}>
          {step.title}
        </h2>

        {/* Bullets */}
        <ul style={{ margin: "0 0 20px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
          {step.bullets.map((b, i) => (
            <li key={i} style={{ fontSize: "12px", color: "#A0A0A0", lineHeight: "1.5", display: "flex", gap: "8px" }}>
              <span style={{ color: "#A0A0A0", flexShrink: 0 }}>—</span>
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
            onMouseEnter={(e) => { e.currentTarget.style.color = "#A0A0A0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#A0A0A0"; }}
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

  // Portal content remains scrollable while the dashboard is inert.
  useLayoutEffect(() => {
    if (!show) return;
    const root = document.getElementById("root");
    const previousInert = root?.inert;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    return () => {
      if (root) root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
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
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
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
