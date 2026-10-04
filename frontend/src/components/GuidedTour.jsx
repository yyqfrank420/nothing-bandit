import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SettingsPanel.css";

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

const GUIDE_SLIDES = [
  {
    title: "Compare two budget strategies",
    body: [
      {
        bold: "Six channels",
        text: "Tech KOL, Design KOL, Generic KOL, Instagram Ads, TikTok Ads, and Google Search share the daily budget.",
      },
      {
        bold: "Adaptive allocation",
        text: "the bandit uses daily results to update its beliefs and change each channel's share.",
      },
      {
        bold: "Fixed comparison",
        text: "the static strategy keeps a weighted channel mix. Both strategies face the same simulated conditions each day.",
      },
    ],
    accent: null,
  },
  {
    title: "Thompson Sampling",
    body: [
      {
        bold: "Sample",
        text: "draw a possible success rate for each channel from its current belief. Uncertainty gives less familiar channels a chance to receive spend.",
      },
      {
        bold: "Allocate",
        text: "split the budget in proportion to those draws. Both strategies start with the same mix on day one; sampling begins on day two.",
      },
      {
        bold: "Learn",
        text: "record success when a channel meets the selected reward threshold. Update its belief, then discount accumulated evidence using the forgetting setting.",
      },
    ],
    accent: null,
  },
  {
    title: "Choose a measure",
    body: [
      {
        bold: "CTR",
        text: "click-through rate. A result at or above its threshold counts as a success.",
      },
      {
        bold: "ROAS and CAC",
        text: "return on ad spend rewards higher revenue per dollar. Customer acquisition cost rewards lower cost per customer.",
      },
      {
        bold: "Separate strategies",
        text: "each objective has its own bandit and may allocate differently. Settings controls the budget, noise, reward thresholds, and forgetting.",
      },
    ],
    accent: null,
  },
  {
    title: "What is real or simulated",
    twoCol: true,
    real: [
      "Thompson Sampling budget decisions",
      "Threshold-based success and failure updates",
      "Separate learning for CTR, ROAS, and CAC",
      "Comparison with a fixed weighted strategy",
    ],
    simulated: [
      "Channel performance rates and daily variation",
      "Revenue, clicks, and conversions",
      "Preset market shock scenarios",
      "All campaign outcomes",
    ],
    note: "This demo does not place ads or use live campaign data.",
  },
  {
    title: "Read the results",
    body: [
      {
        bold: "Budget allocation",
        text: "each colored area shows a channel's share of spend. Red lines mark simulated market shocks.",
      },
      {
        bold: "Performance and outcomes",
        text: "compare the bandit with the fixed strategy over time. Higher CTR and ROAS are better; lower CAC is better. Results can favor either strategy.",
      },
      {
        bold: "Confidence curves",
        text: "these estimate the chance of meeting a reward threshold, not the CTR, ROAS, or CAC value itself. Narrower curves indicate greater certainty.",
      },
    ],
    accent: "Next, a three-step tour shows the controls, allocation charts, and business outcomes.",
  },
];

const STEPS = [
  {
    target: "controls",
    title: "Run the simulation",
    bullets: [
      { bold: "+1 Day / +1 Week / +1 Month", text: "advance the campaign and update the results." },
      { bold: "Auto", text: "runs until paused or the campaign ends. Set its speed in Settings." },
      { bold: "Shock", text: "adds a simulated market event that temporarily changes channel performance." },
    ],
    position: "bottom",
  },
  {
    target: "allocation-grid",
    title: "Follow the budget",
    bullets: [
      { bold: "Three objectives", text: "CTR, ROAS, and CAC each use a separate bandit." },
      { bold: "Colored areas", text: "show how each channel's share of spend changes over time." },
      { bold: "Red event lines", text: "hover to read the simulated shock details." },
    ],
    position: "bottom",
  },
  {
    target: "business-outcomes",
    title: "Compare the outcomes",
    bullets: [
      { bold: "Revenue and conversions", text: "accumulate over the campaign. CAC and ROAS use running totals." },
      { bold: "Solid and dashed lines", text: "compare the bandit and static strategies, respectively." },
      { bold: "Objective tabs", text: "show one objective or the average across all three." },
    ],
    position: "bottom",
  },
];

const PADDING = 14;

const btnSecondary = {
  background:    "none",
  fontSize:      "12px",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  cursor:        "pointer",
  fontFamily:    "var(--font-mono)",
  padding:       "8px 0",
  minHeight:     "44px",
};

const btnPrimary = {
  padding:       "9px 22px",
  minHeight:     "44px",
  background:    "#1A1A1A",
  borderRadius:  "3px",
  fontSize:      "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor:        "pointer",
  fontFamily:    "var(--font-mono)",
};

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
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9000 }}
        onClick={onSkip}
      />
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
        <div
          ref={dialogRef}
          className="tour-dialog"
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
            fontFamily:   "var(--font-body)",
            boxShadow:    "0 12px 60px rgba(0,0,0,0.7)",
          }}
        >
          <div style={{
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            padding:      "24px",
            gap: "12px",
            flexWrap: "wrap",
            borderBottom: "1px solid #1E1E1E",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-accent)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.12em" }}>
                NOTHING BANDIT™
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              USER GUIDE
            </span>
          </div>
          <div style={{ padding: "24px" }}>
            <h2 id="guide-title" tabIndex={-1} aria-live="polite" style={{
              marginTop: 0,
              fontWeight: "normal",
              fontFamily:    "var(--font-heading)",
              fontSize:      "22px",
              color:         "#F0F0F0",
              letterSpacing: "0.01em",
              textTransform: "uppercase",
              marginBottom:  "22px",
              lineHeight:    1.3,
            }}>
              {current.title}
            </h2>
            {current.twoCol ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap: "20px", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--color-positive)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                    Real
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {current.real.map((item, i) => (
                      <li key={i} style={{ display: "flex", gap: "7px", fontSize: "14px", color: "var(--color-text-2)", lineHeight: "1.5" }}>
                        <span style={{ color: "var(--color-positive)", flexShrink: 0, marginTop: "1px" }}>·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#A0A0A0", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                    Simulated
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {current.simulated.map((item, i) => (
                      <li key={i} style={{ display: "flex", gap: "7px", fontSize: "14px", color: "var(--color-text-2)", lineHeight: "1.5" }}>
                        <span style={{ color: "#A0A0A0", flexShrink: 0, marginTop: "1px" }}>·</span>
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
                  <li key={i} style={{ display: "flex", gap: "10px", fontSize: "14px", color: "var(--color-text-2)", lineHeight: "1.6" }}>
                    <span style={{ color: "#A0A0A0", flexShrink: 0, marginTop: "1px" }}>·</span>
                    <span>
                      <strong style={{ color: "#C0C0C0", fontWeight: "600" }}>{b.bold}:</strong>
                      {" "}{b.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(current.note || current.accent) && (
              <div style={{
                padding:      "10px 14px",
                background:   "rgba(255,255,255,0.02)",
                borderLeft:   "2px solid #333",
                fontSize:     "13px",
                color:        "#A0A0A0",
                lineHeight:   "1.6",
                marginBottom: "4px",
                marginTop:    current.twoCol ? "0" : "-6px",
              }}>
                {current.note || current.accent}
              </div>
            )}
          </div>
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "16px 24px 24px",
            flexWrap:       "wrap",
            gap:            "16px",
            borderTop:      "1px solid #1A1A1A",
          }}>
            <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
              {GUIDE_SLIDES.map((_, i) => (
                <button
                  key={i}
                  className="dialog-button tour-progress"
                  onClick={() => setSlide(i)}
                  style={{
                    width:        "44px",
                    height:       "44px",
                    borderRadius: "3px",
                    background:   "transparent",
                    display:      "grid",
                    placeItems:   "center",
                    border:       "none",
                    cursor:       "pointer",
                    padding:      0,
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
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <button
                onClick={onSkip}
                className="dialog-button tour-secondary tour-skip-dashboard"
                style={{
                  ...btnSecondary,
                  borderRadius:  "3px",
                  padding:       "7px 14px",
                  fontSize:      "12px",
                }}
              >
                Skip to Dashboard
              </button>

              {slide > 0 && (
                <button
                  onClick={() => setSlide((s) => s - 1)}
                  className="dialog-button tour-secondary"
                  style={btnSecondary}
                >
                  Back
                </button>
              )}

              <button
                onClick={isLast ? onDone : () => setSlide((s) => s + 1)}
                className="dialog-button tour-primary"
                style={btnPrimary}
              >
                {isLast ? "Start Tour" : "Next"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>,
    document.body
  );
}

// The shadow masks the rest of the screen while leaving the target visible.
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
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9000 }}
        onClick={onSkip}
      />
      {rect && <div
        className="tour-spotlight-mask"
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
        }}
      />}
      <div
        ref={dialogRef}
        className="tour-dialog tour-spotlight"
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
          padding:       "24px",
          fontFamily:    "var(--font-body)",
          boxShadow:     "0 8px 40px rgba(0,0,0,0.6)",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-text-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
          {stepIndex + 1} / {totalSteps}
        </div>
        <h2 id="tour-title" aria-live="polite" style={{
          marginTop: 0,
          fontWeight: "normal",
          fontFamily:    "var(--font-heading)",
          fontSize:      "20px",
          color:         "#F0F0F0",
          letterSpacing: "0.01em",
          textTransform: "uppercase",
          marginBottom:  "10px",
          lineHeight:    1.3,
        }}>
          {step.title}
        </h2>
        <ul style={{ margin: "0 0 20px 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
          {step.bullets.map((b, i) => (
            <li key={i} style={{ fontSize: "14px", color: "var(--color-text-2)", lineHeight: "1.5", display: "flex", gap: "8px" }}>
              <span style={{ color: "#A0A0A0", flexShrink: 0 }}>·</span>
              <span>
                <strong style={{ color: "#C0C0C0", fontWeight: "600" }}>"{b.bold}"</strong>
                {" "}{b.text}
              </span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onSkip}
            className="dialog-button tour-secondary"
            style={btnSecondary}
          >
            Skip Tour
          </button>

          <button
            onClick={onNext}
            className="dialog-button tour-primary"
            style={btnPrimary}
          >
            {stepIndex < totalSteps - 1 ? "Next" : "Done"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function GuidedTour({ show, onDone }) {
  const [phase,     setPhase]     = useState("guide");  // "guide" | "spotlight"
  const [stepIndex, setStepIndex] = useState(0);
  const [rect,      setRect]      = useState(null);
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
  if (phase === "guide") {
    return (
      <UserGuide
        onDone={() => { setPhase("spotlight"); setStepIndex(0); }}
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
