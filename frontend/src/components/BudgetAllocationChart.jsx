/**
 * File: BudgetAllocationChart.jsx
 * Language: JavaScript (React 18 + D3 v7)
 * Purpose: Stacked area chart showing bandit budget reallocation over time.
 *          As the bandit converges, the dominant channel expands to fill the canvas.
 * Connects to: App.jsx
 * Inputs:
 *   results     — all daily_results rows (filtered to this objective + bandit)
 *   objective   — 'ctr' | 'roas' | 'cac'
 *   shockEvents — array of shock objects with triggered_on_day field
 *   currentDay  — highest simulated day (for x-axis domain)
 * Outputs: SVG element managed entirely by D3
 *
 * Design notes:
 *   - No D3 transitions on re-renders — smoothness comes from 1-day/150ms update frequency
 *   - Low fill opacity (0.40) prevents 6 saturated colours from clashing on dark bg
 *   - Thin 1px stroke on each band top edge gives definition without visual noise
 */

import * as d3 from "d3";
import React, { useEffect } from "react";
import { useContainerWidth } from "../hooks.js";
import { CHANNEL_COLORS, CHANNEL_NAMES } from "../App.jsx";

const CHANNEL_IDS = [1, 2, 3, 4, 5, 6];

export default function BudgetAllocationChart({ results, objective, shockEvents = [], currentDay }) {
  const [containerRef, W] = useContainerWidth();
  const svgRef = React.useRef(null);

  useEffect(() => {
    // Always clear first — prevents stale chart persisting when data is reset to empty.
    if (svgRef.current) d3.select(svgRef.current).selectAll("*").remove();
    if (!results || results.length === 0 || !svgRef.current || W === 0) return;

    const H = 170;
    const margin = { top: 8, right: 38, bottom: 28, left: 42 };  // right margin for $ axis
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    // Filter to bandit allocator for this objective only.
    const filtered = results.filter(
      (r) => r.objective === objective && r.allocator === "bandit"
    );
    if (filtered.length === 0) return;

    // Pivot: group by day → {day, [chId]: budget}
    const byDay = d3.rollup(
      filtered,
      (rows) => {
        const obj = {};
        rows.forEach((r) => { obj[r.channel_id] = r.budget_allocated; });
        return obj;
      },
      (r) => r.day
    );

    const days = Array.from(byDay.keys()).sort((a, b) => a - b);
    const stackData = days.map((day) => {
      const entry = { day };
      CHANNEL_IDS.forEach((id) => { entry[id] = byDay.get(day)?.[id] ?? 0; });
      return entry;
    });

    const stack = d3.stack().keys(CHANNEL_IDS).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const series = stack(stackData);

    // Derive total daily budget from data — use the maximum observed across all
    // days so the axis stays correct even if the user changed the budget slider
    // mid-simulation (later days would overflow a day-1-based scale).
    const totalBudget = Math.max(
      1,
      ...days.map((d) => CHANNEL_IDS.reduce((s, id) => s + (byDay.get(d)?.[id] ?? 0), 0))
    );

    const xScale = d3.scaleLinear()
      .domain([1, Math.max(currentDay, days[days.length - 1] ?? 1)])
      .range([0, innerW]);

    const yScale = d3.scaleLinear()
      .domain([0, totalBudget])
      .range([innerH, 0]);

    // Smooth interpolation along x but flat along y — gives a cleaner "stream" feel
    // than curveCatmullRom which can create bulges.
    const area = d3.area()
      .x((d) => xScale(d.data.day))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    const line = d3.line()
      .x((d) => xScale(d.data.day))
      .y((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    // -----------------------------------------------------------------------
    // Render — full clear + redraw, no transitions (avoids mid-animation jitter)
    // -----------------------------------------------------------------------
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Subtle horizontal grid lines only
    g.append("g")
      .call(
        d3.axisLeft(yScale)
          .tickValues([0.25, 0.5, 0.75].map(p => p * totalBudget))
          .tickSize(-innerW)
          .tickFormat("")
      )
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line")
        .attr("stroke", "#1C1C1C")
        .attr("stroke-dasharray", "1,6"));

    // Stacked fill areas — muted opacity so 6 colours don't overwhelm
    series.forEach((s) => {
      g.append("path")
        .datum(s)
        .attr("fill", CHANNEL_COLORS[s.key])
        .attr("fill-opacity", 0.38)
        .attr("d", area);
    });

    // Thin band-boundary stroke on top of each layer — defines the stacks clearly
    series.forEach((s) => {
      g.append("path")
        .datum(s)
        .attr("fill", "none")
        .attr("stroke", CHANNEL_COLORS[s.key])
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.75)
        .attr("d", line);
    });

    // Tooltip — set up before shock events so shock hit-areas can reference it
    const tooltip = d3.select("body").selectAll(".ba-tooltip").data([null]).join("div")
      .attr("class", "ba-tooltip")
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
      .style("z-index", 200)
      .style("line-height", "1.8")
      .style("transition", "opacity 80ms");

    // Shock event vertical lines + transparent hit-areas for hover tooltips
    shockEvents.forEach((shock) => {
      const shockDay = shock.triggered_on_day ?? shock.day;
      if (shockDay > 0 && shockDay <= (currentDay || 183)) {
        const sx = xScale(shockDay);

        g.append("line")
          .attr("x1", sx).attr("x2", sx)
          .attr("y1", 0).attr("y2", innerH)
          // style() — not attr() — so CSS variable resolves correctly
          .style("stroke", "var(--color-accent)")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3,4")
          .attr("opacity", 0.45);

        g.append("text")
          .attr("x", sx + 3).attr("y", 8)
          .attr("fill", "#FF4444")
          .attr("font-size", "8px")
          .attr("font-family", "LetteraMonoLL, monospace")
          .text("⚡");

        // ±8px wide hit-area — full chart height — triggers tooltip on hover
        g.append("rect")
          .attr("x", sx - 8).attr("y", 0)
          .attr("width", 16).attr("height", innerH)
          .attr("fill", "transparent")
          .on("mouseenter", function (event) {
            tooltip
              .style("opacity", 1)
              .style("left", `${event.clientX + 14}px`)
              .style("top", `${event.clientY - 14}px`)
              .html(
                `<div style="color:#FF4444;font-size:9px;margin-bottom:5px;letter-spacing:0.1em">⚡ ${shock.name}</div>` +
                `<div style="color:#C0C0C0;font-size:10px;margin-bottom:6px;max-width:200px;white-space:normal;line-height:1.5">${shock.description}</div>` +
                `<div style="color:#555;font-size:9px">Day ${shockDay} · ${shock.duration_days ?? shock.days_remaining ?? "?"} days</div>`
              );
          })
          .on("mouseleave", () => tooltip.style("opacity", 0));
      }
    });

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(Math.min(days.length, 5))
          .tickFormat((d) => `D${d}`)
          .tickSize(3)
      )
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text")
        .attr("fill", "#4A4A4A")
        .attr("font-size", "9px")
        .attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    const pctFmt  = d => `${Math.round(d / totalBudget * 100)}%`;
    const dolFmt  = d => d >= 1000 ? `$${(d / 1000).toFixed(0)}k` : `$${d}`;
    const axisTicks = [0, 0.5, 1.0].map(p => p * totalBudget);

    // Left Y axis — percentage of daily budget (budget-relative, not hardcoded)
    g.append("g")
      .call(
        d3.axisLeft(yScale)
          .tickValues(axisTicks)
          .tickFormat(pctFmt)
          .tickSize(3)
      )
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text")
        .attr("fill", "#4A4A4A")
        .attr("font-size", "9px")
        .attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    // Right Y axis — actual $ amounts (smart $k formatting above $1,000)
    g.append("g")
      .attr("transform", `translate(${innerW},0)`)
      .call(
        d3.axisRight(yScale)
          .tickValues(axisTicks)
          .tickFormat(dolFmt)
          .tickSize(3)
      )
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text")
        .attr("fill", "#333")
        .attr("font-size", "9px")
        .attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    // Inline legend — top-right, shows top 3 channels by final-day allocation share.
    // Helps readers identify dominant channels without needing the global legend.
    const lastDay = days[days.length - 1];
    const lastEntry = byDay.get(lastDay) ?? {};
    const sortedByAlloc = CHANNEL_IDS
      .map((id) => ({ id, alloc: lastEntry[id] ?? 0 }))
      .filter((c) => c.alloc > 0.5)
      .sort((a, b) => b.alloc - a.alloc);

    const legendTop3 = sortedByAlloc.slice(0, 3);
    const legendExtra = sortedByAlloc.length - 3;

    if (legendTop3.length > 0) {
      const legendG = g.append("g").attr("transform", `translate(${innerW - 2}, 2)`);
      legendTop3.forEach(({ id }, i) => {
        const y = i * 13;
        legendG.append("circle")
          .attr("cx", -5).attr("cy", y + 3).attr("r", 3)
          .attr("fill", CHANNEL_COLORS[id]);
        legendG.append("text")
          .attr("x", -10).attr("y", y + 7)
          .attr("text-anchor", "end")
          .attr("fill", "#888")
          .attr("font-size", "8px")
          .attr("font-family", "LetteraMonoLL, monospace")
          .text(CHANNEL_NAMES[id]);
      });
      if (legendExtra > 0) {
        legendG.append("text")
          .attr("x", -10).attr("y", legendTop3.length * 13 + 7)
          .attr("text-anchor", "end")
          .attr("fill", "#555")
          .attr("font-size", "8px")
          .attr("font-family", "LetteraMonoLL, monospace")
          .text(`+${legendExtra} more`);
      }
    }

    // Hit-area rect for the channel breakdown tooltip (separate from shock tooltips above)
    g.append("rect")
      .attr("width", innerW).attr("height", innerH)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const day = Math.round(xScale.invert(mx));
        const entry = byDay.get(day);
        if (!entry) return;

        const sorted = CHANNEL_IDS
          .filter((id) => (entry[id] ?? 0) > 0.5)
          .sort((a, b) => (entry[b] || 0) - (entry[a] || 0));

        const lines = sorted
          .map((id) => {
            const amt = entry[id] || 0;
            const pct = Math.round(amt / totalBudget * 100);
            const dol = amt >= 1000 ? `$${(amt / 1000).toFixed(1)}k` : `$${amt.toFixed(0)}`;
            return `<span style="color:${CHANNEL_COLORS[id]}">${CHANNEL_NAMES[id]}</span>: ${pct}% <span style="color:#555">(${dol})</span>`;
          })
          .join("<br/>");

        tooltip
          .style("opacity", 1)
          .style("left", `${event.clientX + 14}px`)
          .style("top", `${event.clientY - 14}px`)
          .html(`<div style="color:#666;font-size:9px;margin-bottom:4px">DAY ${day}</div>${lines}`);
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

  }, [results, objective, shockEvents, currentDay, W]);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden" }}>
      <svg ref={svgRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}
