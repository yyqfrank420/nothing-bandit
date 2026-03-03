/**
 * File: hooks.js
 * Language: JavaScript (React 18)
 * Purpose: Shared React hooks used across chart components.
 * Connects to: BudgetAllocationChart, BanditVsStaticChart, BanditConfidenceChart,
 *              BusinessMetricsChart
 */

import { useEffect, useRef, useState } from "react";

/**
 * useContainerWidth
 * Returns the current pixel width of a referenced container element.
 * Re-fires whenever the element is resized (via ResizeObserver).
 * This makes D3 charts responsive without a full page re-render.
 *
 * Usage:
 *   const [ref, width] = useContainerWidth();
 *   return <div ref={ref}> ... use width in D3 effect ... </div>
 */
export function useContainerWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;

    // Set initial width immediately on mount.
    setWidth(ref.current.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/**
 * useAnimatedNumber
 * Smoothly interpolates a numeric value over `duration` ms using requestAnimationFrame.
 * Returns the current interpolated value (a number).
 * Used for KPI cards to animate value changes.
 *
 * @param {number} targetValue — the value to animate toward
 * @param {number} duration    — animation duration in ms (default 600)
 */
export function useAnimatedNumber(targetValue, duration = 600) {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const startRef    = useRef(null);   // animation start timestamp
  const fromRef     = useRef(targetValue);
  const rafRef      = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const to   = targetValue;
    if (from === to) return;

    startRef.current = null;

    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: t = 1 - (1 - progress)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetValue, duration]);

  return displayValue;
}
