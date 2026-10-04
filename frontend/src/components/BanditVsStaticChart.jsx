import * as d3 from "d3";
import React, { useEffect, useRef } from "react";
import { useContainerWidth } from "../hooks.js";
import { formatPercent } from "../metricFormatting.js";

export default function BanditVsStaticChart({ results, objective, shockEvents = [], currentDay }) {
  const [containerRef, W] = useContainerWidth();
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current) d3.select(svgRef.current).selectAll("*").remove();
    if (!results || results.length === 0 || !svgRef.current || W === 0) return;

    // Narrow CAC charts need two caption rows; the extra height preserves plot space.
    const compactCACCaption = objective === "cac" && W - 78 < 240;
    const H = compactCACCaption ? 156 : 140;
    const margin = { top: compactCACCaption ? 44 : 28, right: 18, bottom: 32, left: 60 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const isCAC  = objective === "cac";
    const isROAS = objective === "roas";

    const byDayAllocator = d3.rollup(
      results.filter((r) => r.objective === objective),
      (rows) => ({
        revenue:     d3.sum(rows, (r) => r.revenue),
        budget:      d3.sum(rows, (r) => r.budget_allocated),
        conversions: d3.sum(rows, (r) => r.conversions),
        // Weighted CTR: each channel contributes its CTR scaled by its budget share.
        // Summing budget*ctr here, then dividing by cumBudget in buildSeries gives
        // a running budget-weighted average: channels with more spend matter more.
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
          value = cumConv > 0 ? cumBudget / cumConv : 0;
        } else if (isROAS) {
          value = cumBudget > 0 ? cumRevenue / cumBudget : 0;
        } else {
          value = cumBudget > 0 ? cumWtdCtr / cumBudget : 0;
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
      ? [dataMax + pad, Math.max(0, dataMin - pad)]
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

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);

    const fillColor = "#4ADE80";

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(3).tickSize(-innerW).tickFormat(""))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "#1A1A1A").attr("stroke-dasharray", "1,6"));

    const tooltip = d3.select("body").selectAll(".bvs-tooltip").data([null]).join("div")
      .attr("class", "bvs-tooltip")
      .style("position", "fixed")
      .style("background", "#161616")
      .style("border", "1px solid #2A2A2A")
      .style("border-radius", "3px")
      .style("padding", "8px 10px")
      .style("font-size", "12px")
      .style("font-family", "LetteraMonoLL, monospace")
      .style("color", "var(--color-text)")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", 200)
      .style("line-height", "1.6")
      .style("box-sizing", "border-box")
      .style("width", "max-content")
      .style("max-width", "min(320px, calc(100vw - 16px))")
      .style("max-height", "calc(100vh - 16px)")
      .style("overflow", "auto")
      .style("overflow-wrap", "anywhere")
      .style("transition", "opacity 80ms");

    function showTooltip(event, content) {
      tooltip.html(content).style("opacity", 1);
      const { width, height } = tooltip.node().getBoundingClientRect();
      const left = Math.max(8, Math.min(event.clientX + 14, window.innerWidth - width - 8));
      const top = Math.max(8, Math.min(event.clientY - 14, window.innerHeight - height - 8));
      tooltip.style("left", `${left}px`).style("top", `${top}px`);
    }

    shockEvents.forEach((shock) => {
      const shockDay = shock.start_day;
      if (shockDay > 0 && shockDay <= (currentDay || 183)) {
        const sx = xScale(shockDay);

        g.append("line")
          .attr("x1", sx).attr("x2", sx)
          .attr("y1", 0).attr("y2", innerH)
          .style("stroke", "var(--color-accent)")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3,4")
          .attr("opacity", 0.35);

        g.append("rect")
          .attr("class", "shock-hit-area")
          .attr("x", sx - 8).attr("y", 0)
          .attr("width", 16).attr("height", innerH)
          .attr("fill", "transparent")
          .on("mouseenter", function (event) {
            showTooltip(event,
              `<div style="color:var(--color-negative);margin-bottom:5px">${shock.name}</div>` +
              `<div style="color:var(--color-text);margin-bottom:6px">${shock.description}</div>` +
              `<div style="color:var(--color-text-2)">Days ${shockDay}-${shock.end_day}</div>`
            );
          })
          .on("mouseleave", () => tooltip.style("opacity", 0));
      }
    });

    const staticByDayFill = new Map(staticSeries.map((d) => [d.day, d.value]));
    g.append("path")
      .attr("fill", "var(--color-text-2)")
      .attr("fill-opacity", 0.07)
      .attr("d", d3.area()
        .x((d) => xScale(d.day))
        .y0((d) => yScale(staticByDayFill.get(d.day) ?? d.value))
        .y1((d) => yScale(d.value))
        .curve(d3.curveMonotoneX)(banditSeries));

    g.append("path")
      .attr("fill", "none")
      .attr("stroke", "#3A3A3A")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("d", lineGen(staticSeries));

    g.append("path")
      .attr("fill", "none")
      .attr("stroke", fillColor)
      .attr("stroke-width", 2)
      .attr("d", lineGen(banditSeries));

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

    // Delay the relative label until five observed days to avoid emphasizing early allocation noise.
    if (lastBandit && lastStatic && days.length >= 5) {
      const delta = !(lastStatic.value > 0) ? null : isCAC
        ? ((lastStatic.value - lastBandit.value) / lastStatic.value) * 100
        : ((lastBandit.value - lastStatic.value) / lastStatic.value) * 100;

      const percent = formatPercent(delta);
      const labelColor = percent.tone === "neutral"
        ? "var(--color-text-2)"
        : `var(--color-${percent.tone})`;

      g.append("text")
        .attr("x", innerW)
        .attr("y", -8)
        .attr("text-anchor", "end")
        .attr("font-size", "12px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .style("fill", labelColor)
        .text(percent.text);
    }

    if (isCAC) {
      g.append("text")
        .attr("x", 0)
        .attr("y", compactCACCaption ? -24 : -8)
        .style("fill", "var(--color-text-2)")
        .attr("font-size", "11px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .text("Lower is better");
    }

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale)
        .tickValues(xScale.ticks(Math.max(2, Math.min(days.length, 5, Math.floor(innerW / 48)))).filter(Number.isInteger))
        .tickFormat((d) => `D${d}`)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "#282828"))
      .call((g) => g.selectAll("text").style("fill", "var(--color-text-2)").attr("font-size", "11px").attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

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
      .call((g) => g.selectAll("text").style("fill", "var(--color-text-2)").attr("font-size", "11px").attr("font-family", "LetteraMonoLL, monospace"))
      .call((g) => g.selectAll("line").attr("stroke", "#282828"));

    const banditByDay = new Map(banditSeries.map((d) => [d.day, d.value]));
    const staticByDay = new Map(staticSeries.map((d) => [d.day, d.value]));

    const hoverDotBandit = g.append("circle")
      .attr("r", 5).attr("fill", fillColor)
      .attr("stroke", "#0D0D0D").attr("stroke-width", 1.5)
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

        hoverDotBandit.attr("cx", xScale(day)).attr("cy", yScale(bv)).attr("opacity", 1);
        hoverDotStatic.attr("cx", xScale(day)).attr("cy", yScale(sv ?? bv)).attr("opacity", sv != null ? 0.85 : 0);

        const metricLabel = isCAC ? "Running CAC" : isROAS ? "Running ROAS" : "Avg CTR";
        const fmt = isCAC
          ? (v) => `$${v.toFixed(2)}`
          : isROAS
            ? (v) => `${v.toFixed(2)}×`
            : (v) => `${(v * 100).toFixed(2)}%`;

        showTooltip(event,
          `<div style="color:var(--color-text-2);margin-bottom:4px">DAY ${day} · ${metricLabel}</div>` +
          `<span style="color:var(--color-positive)">Bandit</span>: ${fmt(bv)}<br/>` +
          `<span style="color:var(--color-text-2)">Static</span>: ${sv == null ? "No data" : fmt(sv)}`
        );
      })
      .on("mouseleave", () => {
        tooltip.style("opacity", 0);
        hoverDotBandit.attr("opacity", 0);
        hoverDotStatic.attr("opacity", 0);
      });

    g.selectAll(".shock-hit-area").raise();

  }, [results, objective, shockEvents, currentDay, W]);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden" }}>
      <svg ref={svgRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}
