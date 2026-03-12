/**
 * File: BanditVsStaticChart.jsx
 * Language: JavaScript (React 18 + D3 v7)
 * Purpose: Dual line chart comparing bandit vs static allocator on a single objective.
 * Connects to: App.jsx
 * Inputs:
 *   results     — all daily_results rows
 *   objective   — 'ctr' | 'roas' | 'cac'
 *   shockEvents — for vertical marker lines
 *   currentDay  — x-axis upper bound
 * Outputs: SVG element
 *
 * Metric per objective:
 *   CTR  → running budget-weighted avg CTR: cumΣ(budget×ctr) / cumΣ(budget)
 *   ROAS → running ROAS ratio: cumΣ(revenue) / cumΣ(budget)
 *   CAC  → running average CAC: cumΣ(budget) / cumΣ(conversions)
 *
 * CAC Y-axis is INVERTED — lower value = top of chart = visually "winning".
 * This matches how all three objectives look: the better allocator's line
 * is always on top. Without inversion, lower-is-better metrics confuse readers.
 *
 * No D3 transitions — re-draws are instant so 1-day/150ms auto mode stays smooth.
 */

import * as d3 from "d3";
import React, { useEffect, useRef } from "react";
import { useContainerWidth } from "../hooks.js";

export default function BanditVsStaticChart({ results, objective, shockEvents = [], currentDay }) {
  const [containerRef, W] = useContainerWidth();
  const svgRef = useRef(null);

  useEffect(() => {
    // Always clear first — prevents stale chart persisting when data is reset to empty.
    if (svgRef.current) d3.select(svgRef.current).selectAll("*").remove();
    if (!results || results.length === 0 || !svgRef.current || W === 0) return;

    const H = 140;
    const margin = { top: 22, right: 12, bottom: 28, left: 50 };  // extra top margin for delta label
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const isCAC  = objective === "cac";
    const isROAS = objective === "roas";
    // CTR  objective: budget-weighted running avg CTR — y-axis reads "3.2%".
    //                 Measures whether the bandit directs budget to higher-CTR channels.
    // ROAS objective: running ROAS ratio (revenue/budget) — y-axis reads "2.5×".
    // CAC  objective: running average CAC — y-axis inverted (lower = top = better).

    // Aggregate by (day, allocator).
    const byDayAllocator = d3.rollup(
      results.filter((r) => r.objective === objective),
      (rows) => ({
        revenue:     d3.sum(rows, (r) => r.revenue),
        budget:      d3.sum(rows, (r) => r.budget_allocated),
        conversions: d3.sum(rows, (r) => r.conversions),
        // Weighted CTR: each channel contributes its CTR scaled by its budget share.
        // Summing budget*ctr here, then dividing by cumBudget in buildSeries gives
        // a running budget-weighted average — channels with more spend matter more.
        wtdCtr:      d3.sum(rows, (r) => r.observed_ctr * r.budget_allocated),
      }),
      (r) => r.day,
      (r) => r.allocator
    );

    const days = Array.from(byDayAllocator.keys()).sort((a, b) => a - b);
    if (days.length === 0) return;

    function buildSeries(allocator) {
      let cumRevenue = 0, cumBudget = 0, cumConv = 0, cumWtdCtr = 0;
      return days.map((day) => {
        const d = byDayAllocator.get(day)?.get(allocator)
          ?? { revenue: 0, budget: 0, conversions: 0, wtdCtr: 0 };
        cumRevenue += d.revenue;
        cumBudget  += d.budget;
        cumConv    += d.conversions;
        cumWtdCtr  += d.wtdCtr;
        let value;
        if (isCAC) {
          value = cumConv > 0 ? cumBudget / cumConv : 0;               // running CAC ($)
        } else if (isROAS) {
          value = cumBudget > 0 ? cumRevenue / cumBudget : 0;          // running ROAS (ratio)
        } else {
          value = cumBudget > 0 ? cumWtdCtr / cumBudget : 0;          // running budget-weighted avg CTR
        }
        return { day, value };
      });
    }

    const banditSeries = buildSeries("bandit");
    const staticSeries = buildSeries("static");

    const allValues = [...banditSeries, ...staticSeries].map((d) => d.value).filter((v) => v > 0);
    if (allValues.length === 0) return;

    const dataMin = d3.min(allValues);
    const dataMax = d3.max(allValues);
    const pad = (dataMax - dataMin) * 0.08 || dataMax * 0.05;

    // For CAC: invert so lower (better) = higher on screen.
    // domain([max, min]) with range([innerH, 0]) puts min at top.
    const yDomain = isCAC
      ? [dataMax + pad, Math.max(0, dataMin - pad)]   // inverted: high value at bottom, low at top
      : [0, dataMax + pad];

    const xScale = d3.scaleLinear()
      .domain([1, Math.max(currentDay, days[days.length - 1])])
      .range([0, innerW]);

    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .range([innerH, 0]);

    const lineGen = (series) =>
      d3.line()
        .x((d) => xScale(d.day))
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX)(series);

    // -----------------------------------------------------------------------
    // Render — no transitions
    // -----------------------------------------------------------------------
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);

    const fillColor = "#4ADE80";

    // SVG glow filter — applied to the hover dot to give the shooting-star halo effect.
    const defs = svg.append("defs");
    const glowId = `bvs-glow-${objective}`;
    const filter = defs.append("filter").attr("id", glowId).attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "3").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Grid
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(3).tickSize(-innerW).tickFormat(""))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "#1A1A1A").attr("stroke-dasharray", "1,6"));

    // Tooltip — defined before shock events so shock hit-areas can reference it
    const tooltip = d3.select("body").selectAll(".bvs-tooltip").data([null]).join("div")
      .attr("class", "bvs-tooltip")
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

    // Shock lines + transparent hit-areas for hover tooltips
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
          .attr("opacity", 0.35);

        // ±8px hit-area — full chart height
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

    // Fill between the bandit and static lines — shows the competitive gap visually.
    // y0 = static line position, y1 = bandit line position.
    // Works for both normal and inverted (CAC) axes: when bandit wins, both lines place
    // bandit higher on screen (lower y coord), so y0 > y1 regardless of axis direction,
    // and d3.area() fills between them correctly.
    const staticByDayFill = new Map(staticSeries.map((d) => [d.day, d.value]));
    g.append("path")
      .attr("fill", "rgba(74,222,128,0.07)")
      .attr("d", d3.area()
        .x((d) => xScale(d.day))
        .y0((d) => yScale(staticByDayFill.get(d.day) ?? d.value))
        .y1((d) => yScale(d.value))
        .curve(d3.curveMonotoneX)(banditSeries));

    // Static line — dashed, muted grey
    g.append("path")
      .attr("fill", "none")
      .attr("stroke", "#3A3A3A")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("d", lineGen(staticSeries));

    // Bandit line — solid, coloured
    g.append("path")
      .attr("fill", "none")
      .attr("stroke", fillColor)
      .attr("stroke-width", 2)
      .attr("d", lineGen(banditSeries));

    // Endpoint dots
    const lastBandit = banditSeries[banditSeries.length - 1];
    const lastStatic  = staticSeries[staticSeries.length - 1];

    if (lastBandit) {
      g.append("circle")
        .attr("cx", xScale(lastBandit.day)).attr("cy", yScale(lastBandit.value))
        .attr("r", 3).attr("fill", fillColor)
        .attr("stroke", "#0D0D0D").attr("stroke-width", 1.5);
    }
    if (lastStatic) {
      g.append("circle")
        .attr("cx", xScale(lastStatic.day)).attr("cy", yScale(lastStatic.value))
        .attr("r", 3).attr("fill", "#3A3A3A")
        .attr("stroke", "#0D0D0D").attr("stroke-width", 1.5);
    }

    // Delta label — top-right corner of the chart, in the top margin (y = -8).
    // Pinned to a fixed position rather than the endpoint dot to avoid overlapping the trendline.
    // Suppressed for the first 4 days: Beta(1,1) priors = random allocation,
    // so early deltas are pure noise before the bandit has learned anything.
    if (lastBandit && lastStatic && lastStatic.value > 0 && days.length >= 5) {
      const delta = isCAC
        ? ((lastStatic.value - lastBandit.value) / lastStatic.value) * 100   // lower CAC = positive
        : ((lastBandit.value - lastStatic.value) / lastStatic.value) * 100;

      const label = delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`;
      const labelColor = delta >= 0 ? "#4ADE80" : "#FF6666";

      g.append("text")
        .attr("x", innerW)
        .attr("y", -8)               // sits in the 22px top margin — well clear of the chart area
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("font-family", "Ndot55, monospace")
        .attr("fill", labelColor)
        .text(label);
    }

    // CAC "lower is better" pill badge — replaces tiny illegible text.
    // Uses --color-info (cyan) to distinguish from the brand red accent.
    if (isCAC) {
      const pillG = g.append("g").attr("transform", `translate(2, -${margin.top - 4})`);
      pillG.append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", 88).attr("height", 14)
        .attr("rx", 3)
        // style() so CSS variables resolve (SVG presentation attrs don't support var())
        .style("fill", "var(--color-info-dim)")
        .style("stroke", "var(--color-info)")
        .attr("stroke-width", 0.5)
        .attr("stroke-opacity", 0.5);
      pillG.append("text")
        .attr("x", 6).attr("y", 10)
        .style("fill", "var(--color-info)")
        .attr("font-size", "8px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .text("↓ lower is better");
    }

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale)
        .ticks(Math.min(days.length, 5))
        .tickFormat((d) => `D${d}`)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text").attr("fill", "#4A4A4A").attr("font-size", "9px").attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    // Y-axis tick format per metric type:
    //   CAC  → "$25"    (dollars, inverted axis)
    //   ROAS → "2.5×"   (ratio)
    //   CTR  → "3.2%"   (budget-weighted avg CTR)
    const yTickFmt = isCAC
      ? (d) => `$${d.toFixed(0)}`
      : isROAS
        ? (d) => `${d.toFixed(1)}×`
        : (d) => `${(d * 100).toFixed(1)}%`;

    g.append("g")
      .call(d3.axisLeft(yScale)
        .ticks(3)
        .tickFormat(yTickFmt)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text").attr("fill", "#4A4A4A").attr("font-size", "9px").attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    const banditByDay = new Map(banditSeries.map((d) => [d.day, d.value]));
    const staticByDay = new Map(staticSeries.map((d) => [d.day, d.value]));

    // Shooting-star hover dots — glow on bandit, plain on static. Hidden until mousemove.
    const hoverDotBandit = g.append("circle")
      .attr("r", 5).attr("fill", fillColor)
      .attr("stroke", "#0D0D0D").attr("stroke-width", 1.5)
      .attr("filter", `url(#${glowId})`)
      .attr("opacity", 0).attr("pointer-events", "none");

    const hoverDotStatic = g.append("circle")
      .attr("r", 3.5).attr("fill", "#5A5A5A")
      .attr("stroke", "#0D0D0D").attr("stroke-width", 1)
      .attr("opacity", 0).attr("pointer-events", "none");

    g.append("rect")
      .attr("width", innerW).attr("height", innerH)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const day = Math.round(xScale.invert(mx));
        const bv = banditByDay.get(day);
        const sv = staticByDay.get(day);
        if (bv == null) return;

        // Position dots on their respective lines.
        hoverDotBandit.attr("cx", xScale(day)).attr("cy", yScale(bv)).attr("opacity", 1);
        hoverDotStatic.attr("cx", xScale(day)).attr("cy", yScale(sv ?? bv)).attr("opacity", sv != null ? 0.85 : 0);

        const metricLabel = isCAC ? "Running CAC" : isROAS ? "Running ROAS" : "Avg CTR";
        const fmt = isCAC
          ? (v) => `$${v.toFixed(2)}`
          : isROAS
            ? (v) => `${v.toFixed(2)}×`
            : (v) => `${(v * 100).toFixed(2)}%`;

        tooltip
          .style("opacity", 1)
          .style("left", `${event.clientX + 14}px`)
          .style("top", `${event.clientY - 14}px`)
          .html(
            `<div style="color:#666;font-size:9px;margin-bottom:4px">DAY ${day} · ${metricLabel}</div>` +
            `<span style="color:#4ADE80">Bandit</span>: ${fmt(bv)}<br/>` +
            `<span style="color:#444">Static</span>: ${fmt(sv ?? 0)}`
          );
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", 0);
        hoverDotBandit.attr("opacity", 0);
        hoverDotStatic.attr("opacity", 0);
      });

  }, [results, objective, shockEvents, currentDay, W]);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden" }}>
      <svg ref={svgRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}
