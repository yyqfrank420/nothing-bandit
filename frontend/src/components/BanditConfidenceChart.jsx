/**
 * File: BanditConfidenceChart.jsx
 * Language: JavaScript (React 18 + D3 v7)
 * Purpose: Shows Beta(α, β) posterior distribution curves for all 6 channels
 *          for a single objective. Narrow peaked = confident winner.
 *          Wide flat = still exploring. Curves update as the bandit accumulates data.
 * Connects to: App.jsx
 * Inputs:
 *   banditStates — all bandit_state rows from /bandit-states
 *   objective    — 'ctr' | 'roas' | 'cac'
 * Outputs: Grid of small SVG sparklines, one per channel
 *
 * Math note:
 *   Beta PDF = x^(α-1) × (1-x)^(β-1) / B(α,β)
 *   We evaluate this at 100 points in [0,1] using d3.range.
 *   We use log-space computation to avoid overflow for large α,β values.
 */

import * as d3 from "d3";
import React, { useEffect } from "react";
import { useContainerWidth } from "../hooks.js";
import { CHANNEL_COLORS, CHANNEL_NAMES } from "../App.jsx";

const CHANNEL_IDS = [1, 2, 3, 4, 5, 6];
const N_POINTS = 120;

/**
 * Compute Beta PDF values at N_POINTS equally-spaced x in (0, 1).
 * Uses log-space to handle large alpha/beta without overflow.
 * Returns array of {x, y} objects.
 */
function betaPDF(alpha, beta) {
  const xs = d3.range(1 / N_POINTS, 1, 1 / N_POINTS);
  // logBeta(a,b) = lgamma(a) + lgamma(b) - lgamma(a+b)
  // We use a simple Stirling approximation for lgamma for large values,
  // or rely on the fact that we only need relative (unnormalised) density for display.
  // For our purposes, unnormalised PDF is fine since we normalise to fill the sparkline.
  const logNorm = logBeta(alpha, beta);
  return xs.map((x) => {
    const logPDF = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logNorm;
    return { x, y: Math.exp(logPDF) };
  });
}

function logGamma(z) {
  // Lanczos approximation — accurate to ~15 decimal places for z > 0.
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

export default function BanditConfidenceChart({ banditStates, objective }) {
  const [containerRef, totalW] = useContainerWidth();

  useEffect(() => {
    // Always clear container first — prevents stale curves persisting after reset.
    if (containerRef.current) d3.select(containerRef.current).selectAll("svg").remove();
    if (!banditStates || banditStates.length === 0 || !containerRef.current || totalW === 0) return;

    // Build lookup: {channel_id: {alpha, beta}}
    const stateMap = {};
    banditStates
      .filter((s) => s.objective === objective)
      .forEach((s) => { stateMap[s.channel_id] = { alpha: s.alpha, beta: s.beta }; });

    const container = containerRef.current;

    // 2 rows × 3 cols grid of sparklines
    const cols = 3;
    const rows = 2;
    const cellW = Math.floor(totalW / cols) - 4;
    const cellH = 70;

    // Remove existing SVGs
    d3.select(container).selectAll("svg").remove();

    CHANNEL_IDS.forEach((chId, idx) => {
      const state = stateMap[chId] ?? { alpha: 1, beta: 1 };
      const { alpha, beta } = state;

      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const color = CHANNEL_COLORS[chId];
      const name  = CHANNEL_NAMES[chId];

      // Compute PDF
      const data = betaPDF(alpha, beta);
      const maxY = d3.max(data, (d) => d.y);

      // Position using CSS grid equivalent via absolute positioning
      const svg = d3.select(container)
        .append("svg")
        .attr("width", cellW)
        .attr("height", cellH)
        .style("position", "absolute")
        .style("left", `${col * (cellW + 4)}px`)
        .style("top", `${row * (cellH + 24)}px`)
        .style("overflow", "visible");

      const margin = { top: 18, right: 6, bottom: 6, left: 6 };
      const iW = cellW - margin.left - margin.right;
      const iH = cellH - margin.top - margin.bottom;

      const xScale = d3.scaleLinear().domain([0, 1]).range([0, iW]);
      const yScale = d3.scaleLinear().domain([0, maxY]).range([iH, 0]);

      const lineGen = d3.line()
        .x((d) => xScale(d.x))
        .y((d) => yScale(d.y))
        .curve(d3.curveBasis);

      const areaGen = d3.area()
        .x((d) => xScale(d.x))
        .y0(iH)
        .y1((d) => yScale(d.y))
        .curve(d3.curveBasis);

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      // Gradient fill
      const gradId = `conf-grad-${objective}-${chId}`;
      const defs = svg.append("defs");
      const grad = defs.append("linearGradient")
        .attr("id", gradId)
        .attr("x1", "0").attr("y1", "0")
        .attr("x2", "0").attr("y2", "1");
      grad.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.3);
      grad.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.02);

      // Baseline
      g.append("line")
        .attr("x1", 0).attr("y1", iH).attr("x2", iW).attr("y2", iH)
        .attr("stroke", "#282828").attr("stroke-width", 1);

      // Fill area
      g.append("path")
        .datum(data)
        .attr("fill", `url(#${gradId})`)
        .attr("d", areaGen);

      // Distribution curve — no transition so auto-mode stays smooth.
      g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("d", lineGen);

      // Channel name label
      svg.append("text")
        .attr("x", margin.left)
        .attr("y", 12)
        .attr("fill", color)
        .attr("font-size", "9px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .attr("opacity", 0.9)
        .text(name.toUpperCase());

      // α/β values
      svg.append("text")
        .attr("x", cellW - margin.right)
        .attr("y", 12)
        .attr("text-anchor", "end")
        .attr("fill", "#555")
        .attr("font-size", "9px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .text(`α${alpha.toFixed(0)} β${beta.toFixed(0)}`);

      // Confidence indicator: highlight if this channel is the current leader.
      // The mode of Beta(α,β) = (α-1)/(α+β-2) for α,β > 1.
      const mode = alpha > 1 && beta > 1 ? (alpha - 1) / (alpha + beta - 2) : alpha / (alpha + beta);

      // Mode dashed line + "mode XX%" label above it
      if (alpha > 1) {
        g.append("line")
          .attr("x1", xScale(mode)).attr("x2", xScale(mode))
          .attr("y1", 0).attr("y2", iH)
          .attr("stroke", color)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "2,3")
          .attr("opacity", 0.5);

        // Label positioned just above the line — 3px right so it doesn't overlap
        g.append("text")
          .attr("x", xScale(mode) + 3)
          .attr("y", 7)
          .attr("fill", color)
          .attr("font-size", "7px")
          .attr("font-family", "LetteraMonoLL, monospace")
          .attr("opacity", 0.7)
          .text(`mode ${Math.round(mode * 100)}%`);
      }
    });

  }, [banditStates, objective, totalW]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "188px",   // 2 rows × (70px cell + 24px gap) = 188px
      }}
    />
  );
}
