/**
 * File: BusinessMetricsChart.jsx
 * Language: JavaScript (React 18 + D3 v7)
 * Purpose: Full-width business analytics panel showing 4 KPI charts in a 2×2 grid,
 *          each comparing the bandit vs static allocator on the ROAS objective.
 *          Includes summary KPI cards showing the final-day delta.
 * Connects to: App.jsx
 * Inputs:
 *   results    — all daily_results rows (filtered to objective='roas' internally)
 *   currentDay — for x-axis scaling
 * Outputs: KPI cards + 2×2 SVG chart grid
 *
 * KPIs displayed:
 *   1. Cumulative Revenue   — sum(revenue) per allocator over time
 *   2. Running CAC          — sum(budget) / sum(conversions) per allocator
 *   3. Running ROAS         — sum(revenue) / sum(budget) per allocator
 *   4. Total Conversions    — sum(conversions) per allocator over time
 *
 * All computed client-side from the results array — no extra API call needed.
 */

import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAnimatedNumber, useContainerWidth } from "../hooks.js";

const ALL_OBJECTIVES = ["ctr", "roas", "cac"];

const OBJECTIVE_LABELS = {
  all:  "All Objectives (avg)",
  ctr:  "CTR — Click Through Rate",
  roas: "ROAS — Return on Ad Spend",
  cac:  "CAC — Customer Acquisition Cost",
};

// Scale-aware revenue formatter: avoids "$1300k" at large cumulative values.
const fmtRevenue = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};

// Configuration for each KPI chart panel.
const KPIS = [
  {
    key:       "revenue",
    label:     "Cumulative Revenue",
    format:    fmtRevenue,
    shortFmt:  fmtRevenue,
    higherBetter: true,
    color:     "#4ADE80",
  },
  {
    key:       "cac",
    label:     "Running CAC",
    format:    (v) => `$${v.toFixed(2)}`,
    shortFmt:  (v) => `$${v.toFixed(2)}`,
    higherBetter: false,
    color:     "#22D3EE",
  },
  {
    key:       "roas",
    label:     "Running ROAS",
    format:    (v) => `${v.toFixed(2)}×`,
    shortFmt:  (v) => `${v.toFixed(2)}×`,
    higherBetter: true,
    color:     "#A78BFA",
  },
  {
    key:       "conversions",
    label:     "Total Conversions",
    format:    (v) => v.toFixed(0),
    shortFmt:  (v) => v.toFixed(0),
    higherBetter: true,
    color:     "#F97316",
  },
];

// Build series for a given objective filter ("all" = average across all three).
function useSeries(results, activeObjective) {
  return useMemo(() => {
    if (!results || results.length === 0) return { bandit: [], static: [] };

    // When filtering to one objective, the rows are already scoped — no averaging needed.
    // When showing "all", we average across 3 objectives so each objective counts equally
    // regardless of daily budget (budget is consistent across objectives by design).
    const filtered = activeObjective === "all"
      ? results
      : results.filter((r) => r.objective === activeObjective);
    const divisor  = activeObjective === "all" ? ALL_OBJECTIVES.length : 1;

    const byDayAlloc = d3.rollup(
      filtered,
      (rows) => ({
        revenue:     d3.sum(rows, (r) => r.revenue)           / divisor,
        budget:      d3.sum(rows, (r) => r.budget_allocated)  / divisor,
        conversions: d3.sum(rows, (r) => r.conversions)       / divisor,
      }),
      (r) => r.day,
      (r) => r.allocator
    );

    const days = Array.from(byDayAlloc.keys()).sort((a, b) => a - b);

    function buildSeries(allocator) {
      let cumRevenue = 0, cumBudget = 0, cumConv = 0;
      return days.map((day) => {
        const d = byDayAlloc.get(day)?.get(allocator) ?? { revenue: 0, budget: 0, conversions: 0 };
        cumRevenue += d.revenue;
        cumBudget  += d.budget;
        cumConv    += d.conversions;
        return {
          day,
          revenue:     cumRevenue,
          cac:         cumConv > 0 ? cumBudget / cumConv : 0,
          roas:        cumBudget > 0 ? cumRevenue / cumBudget : 0,
          conversions: cumConv,
        };
      });
    }

    return {
      bandit: buildSeries("bandit"),
      static: buildSeries("static"),
    };
  }, [results, activeObjective]);
}

// Shown on day 0 — values at zero, prompts user to simulate.
function ZeroKpiCard({ kpi }) {
  return (
    <div style={{
      padding: "16px 20px",
      background: "#111",
      border: "1px solid #282828",
      borderRadius: "4px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      minWidth: "140px",
    }}>
      <div style={{ fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {kpi.label}
      </div>
      <div style={{ fontFamily: "Ndot55, monospace", fontSize: "22px", color: "#282828", lineHeight: 1 }}>
        {kpi.shortFmt(0)}
      </div>
      {/* Replaced "0.0% vs static" — avoids "is this broken?" reaction on day 0 */}
      <div style={{ fontSize: "9px", color: "#333", fontStyle: "italic" }}>
        simulate to populate
      </div>
    </div>
  );
}

function KpiCard({ kpi, banditSeries, staticSeries }) {
  const [tooltipPos, setTooltipPos] = useState(null);

  const lastBandit = banditSeries[banditSeries.length - 1];
  const lastStatic = staticSeries[staticSeries.length - 1];
  if (!lastBandit || !lastStatic) return null;

  const bv = lastBandit[kpi.key];
  const sv = lastStatic[kpi.key];

  // Delta: positive = bandit wins, negative = bandit loses.
  const rawDelta = kpi.higherBetter ? bv - sv : sv - bv;
  const pctDelta = sv !== 0 ? (rawDelta / Math.abs(sv)) * 100 : 0;
  const isPositive = pctDelta >= 0;
  const deltaColor = isPositive ? "#4ADE80" : "#FF6666";
  const deltaStr = `${isPositive ? "+" : ""}${pctDelta.toFixed(1)}%`;

  // Animate the primary value smoothly when it changes.
  const animatedBv = useAnimatedNumber(bv, 500);

  const absDiff = Math.abs(bv - sv);
  const betterLabel = kpi.higherBetter ? "higher is better" : "lower is better";

  return (
    <div
      style={{
        padding: "16px 20px",
        background: "#111",
        border: `1px solid ${isPositive ? "rgba(74,222,128,0.15)" : "#282828"}`,
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "140px",
        transition: "border-color 400ms ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.bottom + 10 });
      }}
      onMouseLeave={() => setTooltipPos(null)}
    >
      <div style={{ fontSize: "10px", color: "#555", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {kpi.label}
      </div>
      <div style={{
        fontFamily: "Ndot55, monospace",
        fontSize: "22px",
        color: kpi.color,
        letterSpacing: "0.04em",
        lineHeight: 1,
        transition: "color 300ms",
      }}>
        {kpi.shortFmt(animatedBv)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{
          fontFamily: "Ndot55, monospace",
          fontSize: "13px",
          color: deltaColor,
          transition: "color 300ms",
        }}>
          {deltaStr}
        </span>
        <span style={{ fontSize: "10px", color: "#555" }}>vs static</span>
      </div>

      {/* Hover pane — rendered at fixed viewport position to escape card overflow bounds */}
      {tooltipPos && (
        <div style={{
          position: "fixed",
          left: `${tooltipPos.x}px`,
          top: `${tooltipPos.y}px`,
          transform: "translateX(-50%)",
          zIndex: 500,
          background: "#161616",
          border: "1px solid #2A2A2A",
          borderRadius: "4px",
          padding: "12px 14px",
          minWidth: "190px",
          fontFamily: "LetteraMonoLL, monospace",
          fontSize: "10px",
          lineHeight: "1.8",
          color: "#C0C0C0",
          pointerEvents: "none",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}>
          <div style={{ color: "#555", fontSize: "9px", marginBottom: "8px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {kpi.label} · {betterLabel}
          </div>
          <div><span style={{ color: "#4ADE80" }}>Bandit</span>: {kpi.format(bv)}</div>
          <div><span style={{ color: "#555" }}>Static</span>: {kpi.format(sv)}</div>
          <div style={{ marginTop: "6px", borderTop: "1px solid #1E1E1E", paddingTop: "6px" }}>
            <span style={{ color: deltaColor }}>{deltaStr}</span>
            <span style={{ color: "#555", marginLeft: "8px" }}>vs static baseline</span>
          </div>
          <div style={{ color: "#5A5A5A", marginTop: "2px" }}>
            {kpi.format(absDiff)} absolute difference
          </div>
        </div>
      )}
    </div>
  );
}

// Single KPI line chart panel.
function KpiChart({ kpi, banditSeries, staticSeries, currentDay }) {
  const [containerRef, W] = useContainerWidth();
  const svgRef = useRef(null);

  useEffect(() => {
    if (!banditSeries.length || !svgRef.current || W === 0) return;
    const H = 160;
    const margin = { top: 12, right: 12, bottom: 28, left: 52 };
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top - margin.bottom;

    const allValues = [
      ...banditSeries.map((d) => d[kpi.key]),
      ...staticSeries.map((d) => d[kpi.key]),
    ].filter((v) => v > 0);

    if (allValues.length === 0) return;

    const days = banditSeries.map((d) => d.day);
    const yMin = kpi.higherBetter ? 0 : d3.min(allValues) * 0.9;
    const yMax = d3.max(allValues) * 1.05;

    const xScale = d3.scaleLinear()
      .domain([1, Math.max(currentDay, days[days.length - 1] ?? 1)])
      .range([0, iW]);

    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([iH, 0]);

    const lineGen = (series) =>
      d3.line()
        .x((d) => xScale(d.day))
        .y((d) => yScale(d[kpi.key]))
        .curve(d3.curveCatmullRom.alpha(0.5))(series);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);

    const defs = svg.append("defs");

    const gradId = `bm-grad-${kpi.key}`;
    const grad = defs.append("linearGradient")
      .attr("id", gradId).attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
    grad.append("stop").attr("offset", "0%").attr("stop-color", kpi.color).attr("stop-opacity", 0.2);
    grad.append("stop").attr("offset", "100%").attr("stop-color", kpi.color).attr("stop-opacity", 0);

    // Glow filter — applied to hover dot for shooting-star halo.
    const glowId = `bm-glow-${kpi.key}`;
    const glowFilter = defs.append("filter").attr("id", glowId).attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glowFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "3").attr("result", "blur");
    const glowMerge = glowFilter.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "blur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Grid
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(3).tickSize(-iW).tickFormat(""))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "#1A1A1A").attr("stroke-dasharray", "2,4"));

    // Area under bandit
    g.append("path")
      .datum(banditSeries)
      .attr("fill", `url(#${gradId})`)
      .attr("d", d3.area()
        .x((d) => xScale(d.day))
        .y0(iH)
        .y1((d) => yScale(d[kpi.key]))
        .curve(d3.curveCatmullRom.alpha(0.5)));

    // Static line
    g.append("path")
      .attr("fill", "none")
      .attr("stroke", "#333")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("d", lineGen(staticSeries));

    // Bandit line — no transition so 1-day-step replay stays smooth.
    g.append("path")
      .attr("fill", "none")
      .attr("stroke", kpi.color)
      .attr("stroke-width", 2)
      .attr("d", lineGen(banditSeries));

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xScale)
        .ticks(Math.min(days.length, 5))
        .tickFormat((d) => `D${d}`)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text").attr("fill", "#555").attr("font-size", "9px").attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    g.append("g")
      .call(d3.axisLeft(yScale)
        .ticks(3)
        .tickFormat(kpi.format)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text").attr("fill", "#555").attr("font-size", "9px").attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    // -----------------------------------------------------------------------
    // Tooltip + crosshair — follows mouse across the chart.
    // Uses the same pattern as BanditVsStaticChart for consistency.
    // -----------------------------------------------------------------------

    // Shooting-star hover dots — positioned on their lines during mousemove.
    const hoverDotBandit = g.append("circle")
      .attr("r", 5).attr("fill", kpi.color)
      .attr("stroke", "#0D0D0D").attr("stroke-width", 1.5)
      .attr("filter", `url(#${glowId})`)
      .attr("opacity", 0).attr("pointer-events", "none");

    const hoverDotStatic = g.append("circle")
      .attr("r", 3.5).attr("fill", "#5A5A5A")
      .attr("stroke", "#0D0D0D").attr("stroke-width", 1)
      .attr("opacity", 0).attr("pointer-events", "none");

    // Reuse a single tooltip div per chart type (data([null]).join avoids duplicates).
    const tooltipClass = `bm-tooltip-${kpi.key}`;
    const tooltip = d3.select("body").selectAll(`.${tooltipClass}`).data([null]).join("div")
      .attr("class", tooltipClass)
      .style("position", "fixed")
      .style("background", "#161616")
      .style("border", "1px solid #2A2A2A")
      .style("border-radius", "3px")
      .style("padding", "8px 10px")
      .style("font-size", "11px")
      .style("font-family", "LetteraMonoLL, monospace")
      .style("color", "#C0C0C0")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", 600)
      .style("line-height", "1.8")
      .style("transition", "opacity 80ms")
      .style("white-space", "nowrap");

    // Lookup maps: day → value for fast O(1) access in mousemove.
    const banditByDay = new Map(banditSeries.map((d) => [d.day, d[kpi.key]]));
    const staticByDay = new Map(staticSeries.map((d) => [d.day, d[kpi.key]]));

    // Vertical crosshair line — initially invisible, shown on hover.
    const crosshair = g.append("line")
      .attr("y1", 0).attr("y2", iH)
      .attr("stroke", "#333")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,3")
      .attr("opacity", 0)
      .attr("pointer-events", "none");

    // Invisible hit-area rect to capture mouse events across the whole chart.
    g.append("rect")
      .attr("width", iW).attr("height", iH)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const day = Math.round(xScale.invert(mx));
        const bv  = banditByDay.get(day);
        const sv  = staticByDay.get(day);
        if (bv == null) return;

        // Move crosshair and shooting-star dots to the snapped day.
        const snappedX = xScale(day);
        crosshair.attr("x1", snappedX).attr("x2", snappedX).attr("opacity", 0.7);
        hoverDotBandit.attr("cx", snappedX).attr("cy", yScale(bv)).attr("opacity", 1);
        hoverDotStatic.attr("cx", snappedX).attr("cy", yScale(sv ?? bv)).attr("opacity", sv != null ? 0.85 : 0);

        // Delta % at this day (same direction logic as KpiCard).
        const rawDelta = kpi.higherBetter ? bv - sv : sv - bv;
        const pctDelta = sv !== 0 ? (rawDelta / Math.abs(sv)) * 100 : 0;
        const deltaStr = `${pctDelta >= 0 ? "+" : ""}${pctDelta.toFixed(1)}%`;
        const deltaColor = pctDelta >= 0 ? "#4ADE80" : "#FF6666";

        tooltip
          .style("opacity", 1)
          .style("left", `${event.clientX + 14}px`)
          .style("top",  `${event.clientY - 14}px`)
          .html(
            `<div style="color:#666;font-size:9px;margin-bottom:4px;letter-spacing:0.1em">` +
            `DAY ${day} · ${kpi.label.toUpperCase()}</div>` +
            `<span style="color:#4ADE80">Bandit</span>: ${kpi.format(bv)}<br/>` +
            `<span style="color:#555">Static</span>: ${kpi.format(sv ?? 0)}` +
            `<div style="margin-top:5px;border-top:1px solid #1E1E1E;padding-top:5px">` +
            `<span style="color:${deltaColor}">${deltaStr}</span>` +
            `<span style="color:#444;margin-left:6px">vs static</span></div>`
          );
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", 0);
        crosshair.attr("opacity", 0);
        hoverDotBandit.attr("opacity", 0);
        hoverDotStatic.attr("opacity", 0);
      });

  }, [banditSeries, staticSeries, currentDay, kpi, W]);

  return (
    <div style={{ background: "#111", border: "1px solid #1E1E1E", borderRadius: "4px", padding: "14px 14px 8px" }}>
      <div style={{ fontSize: "10px", color: "#666", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
        {kpi.label}
      </div>
      <div ref={containerRef} style={{ width: "100%" }}>
        <svg ref={svgRef} style={{ display: "block", width: "100%" }} />
      </div>
    </div>
  );
}

// Toggle button for objective filter.
// Active tab uses red border + red-tinted bg so the selected state is unmistakable.
function ObjTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: "3px",
        border: `1px solid ${active ? "var(--color-accent)" : "#222"}`,
        background: active ? "var(--color-accent-tint)" : "transparent",
        color: active ? "#E0E0E0" : "#444",
        fontSize: "10px",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        cursor: "pointer",
        fontFamily: "LetteraMonoLL, monospace",
        transition: "all 180ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "#333";
          e.currentTarget.style.color = "#888";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "#222";
          e.currentTarget.style.color = "#444";
        }
      }}
    >
      {label}
    </button>
  );
}

export default function BusinessMetricsChart({ results, currentDay }) {
  // Internal toggle: "all" averages across all 3 objectives; specific obj filters to just that one.
  const [activeObjective, setActiveObjective] = useState("all");

  const { bandit: banditSeries, static: staticSeries } = useSeries(results, activeObjective);

  // Day 0 zero-state: show KPI cards at 0 so the dashboard is never blank.
  const isEmpty = banditSeries.length === 0;

  return (
    <div style={{
      background: "#0F0F0F",
      border: "1px solid var(--color-border)",
      borderRadius: "4px",
      padding: "24px",
    }}>
      {/* Header: objective toggle tabs */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "20px",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{
            fontSize: "12px",
            color: "#888",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: "LetteraMonoLL, monospace",
          }}>
            {OBJECTIVE_LABELS[activeObjective]}
          </span>
          {/* Sub-label confirms the tab click actually did something */}
          <span style={{
            fontSize: "9px",
            color: "#555",
            fontFamily: "LetteraMonoLL, monospace",
            letterSpacing: "0.06em",
          }}>
            Filtering: {activeObjective === "all" ? "all objectives (avg)" : activeObjective.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {["all", "ctr", "roas", "cac"].map((obj) => (
            <ObjTab
              key={obj}
              label={obj === "all" ? "All Avg" : obj.toUpperCase()}
              active={activeObjective === obj}
              onClick={() => setActiveObjective(obj)}
            />
          ))}
        </div>
      </div>

      {/* CTR caveat — filtering by CTR shows click-optimised results, not revenue */}
      {activeObjective === "ctr" && (
        <div style={{
          padding:     "8px 12px",
          marginBottom: "16px",
          borderLeft:  "2px solid #F97316",
          background:  "rgba(249,115,22,0.04)",
          fontSize:    "10px",
          color:       "#888",
          lineHeight:  "1.5",
          fontFamily:  "LetteraMonoLL, monospace",
          animation:   "fadeIn 300ms ease",
        }}>
          <span style={{ color: "#F97316" }}>⚠ You're viewing CTR-objective results.</span>{" "}
          Maximising click-through rate can attract high-volume but low-quality traffic — wrong audience segments that don't convert.
          {" "}<span style={{ color: "#555" }}>ROAS and CAC tabs show objectives that directly track revenue and acquisition efficiency.</span>
        </div>
      )}

      {/* Summary KPI cards — show zeroes on day 0 for realism */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "12px",
        marginBottom: "24px",
      }}>
        {KPIS.map((kpi) => (
          isEmpty
            ? <ZeroKpiCard key={kpi.key} kpi={kpi} />
            : <KpiCard key={kpi.key} kpi={kpi} banditSeries={banditSeries} staticSeries={staticSeries} />
        ))}
      </div>

      {/* 2×2 chart grid — hidden on day 0 (nothing to plot) */}
      {!isEmpty && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "auto auto",
          gap: "16px",
        }}>
          {KPIS.map((kpi) => (
            <KpiChart
              key={kpi.key}
              kpi={kpi}
              banditSeries={banditSeries}
              staticSeries={staticSeries}
              currentDay={currentDay}
            />
          ))}
        </div>
      )}
    </div>
  );
}
