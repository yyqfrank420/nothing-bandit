/**
 * File: ShockImpactPanel.jsx
 * Language: JavaScript (React 18 + D3 v7)
 * Purpose: Persistent strip of shock event cards between the channel legend
 *          and the main dashboard grids. Each card shows the shock name, day range,
 *          affected channels, multipliers, and a D3 grouped bar chart comparing
 *          avg daily revenue before vs during the shock per affected channel.
 *
 *          Cards persist from trigger until Reset. Multiple overlapping shocks each get
 *          their own card. Status badge (ACTIVE / EXPIRED) updates relative to viewDay.
 *
 * Connects to: App.jsx (receives shockEvents, results, viewDay)
 * Inputs:
 *   shockEvents — array of shock objects, each enriched with `endDay` by App.jsx:
 *                   { id, name, description, affected_channels|affected_channel_ids,
 *                     multipliers, duration_days, triggered_on_day, endDay }
 *   results     — visibleResults filtered to viewDay in App.jsx
 *   viewDay     — current slider position (upper bound of visible data)
 * Outputs: React element (null when no shocks)
 */

import React, { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { CHANNEL_COLORS, CHANNEL_NAMES } from "../App.jsx";
import { useContainerWidth } from "../hooks.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRIC_LABELS = { ctr: "CTR", roas: "ROAS", cac: "CAC" };

// Days before the shock to use as the "before" baseline window.
const PRE_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Convert a shock multiplier value to a human-readable string and color.
 * CAC: lower is better → multiplier < 1 is green. CTR/ROAS: higher is better.
 */
function fmtMultiplier(metricKey, value) {
  const pct  = Math.round((value - 1) * 100);
  const sign = pct > 0 ? "+" : "";
  const label = METRIC_LABELS[metricKey] ?? metricKey.toUpperCase();
  const isGood = metricKey === "cac" ? pct < 0 : pct > 0;
  return {
    text:  `${label} ${sign}${pct}%`,
    color: isGood ? "#4ADE80" : "#FF6666",
  };
}

/**
 * Extract a normalised affected channel ID list from a shock object.
 * Handles both fresh-trigger shape (affected_channels = name strings)
 * and the DB-restore shape (affected_channel_ids = integers).
 *
 * NAME_TO_ID is computed here (not at module level) to avoid circular import
 * evaluation order issues: App.jsx imports this file, so CHANNEL_NAMES would be
 * undefined if we tried to use it in top-level module code.
 */
function getAffectedIds(shock) {
  if (Array.isArray(shock.affected_channel_ids)) return shock.affected_channel_ids;
  const nameToId = Object.fromEntries(
    Object.entries(CHANNEL_NAMES).map(([id, name]) => [name, Number(id)])
  );
  const nameList = shock.affected_channels ?? shock.affected_channel_names ?? [];
  return nameList.map(n => nameToId[n]).filter(id => id != null);
}

/**
 * For a single shock, compute avg daily revenue and budget per affected channel,
 * split into pre-shock and during-shock windows, using the ROAS-objective bandit only.
 *
 * Using ROAS as the single representative slice prevents triple-counting
 * (3 objectives × same channel = 3 identical rows in the data).
 *
 * Returns array of: { chId, preRevDay, durRevDay, revDelta, preBudDay, durBudDay, budDelta }
 */
function computeStats(affectedIds, triggeredOn, endDay, results, viewDay) {
  const preStart = Math.max(1, triggeredOn - PRE_WINDOW_DAYS);
  const preEnd   = triggeredOn - 1;
  const preDays  = Math.max(0, preEnd - preStart + 1);

  const durStart = triggeredOn;
  const durEnd   = Math.min(endDay, viewDay);
  const durDays  = Math.max(0, durEnd - durStart + 1);

  return affectedIds.map(chId => {
    const pre = results.filter(r =>
      r.allocator  === "bandit" &&
      r.objective  === "roas"  &&
      r.channel_id === chId    &&
      r.day >= preStart && r.day <= preEnd
    );
    const dur = results.filter(r =>
      r.allocator  === "bandit" &&
      r.objective  === "roas"  &&
      r.channel_id === chId    &&
      r.day >= durStart && r.day <= durEnd
    );

    const sum = (arr, key) => arr.reduce((s, r) => s + r[key], 0);

    const preRevDay = preDays > 0 && pre.length > 0 ? sum(pre, "revenue")          / preDays : null;
    const durRevDay = durDays > 0 && dur.length > 0 ? sum(dur, "revenue")          / durDays : null;
    const preBudDay = preDays > 0 && pre.length > 0 ? sum(pre, "budget_allocated") / preDays : null;
    const durBudDay = durDays > 0 && dur.length > 0 ? sum(dur, "budget_allocated") / durDays : null;

    const revDelta = preRevDay != null && durRevDay != null
      ? ((durRevDay - preRevDay) / preRevDay) * 100 : null;
    const budDelta = preBudDay != null && durBudDay != null
      ? ((durBudDay - preBudDay) / preBudDay) * 100 : null;

    return { chId, preRevDay, durRevDay, revDelta, preBudDay, durBudDay, budDelta };
  });
}

// ---------------------------------------------------------------------------
// D3 grouped bar chart — before vs during revenue per channel
// ---------------------------------------------------------------------------

/**
 * ImpactBarChart
 * Draws a compact grouped bar chart:
 *   - One group per affected channel
 *   - Two bars per group: before (dark grey) and during (channel color)
 *   - Δ% label above each group (green = better, red = worse)
 *   - Colored circle dots on the x-axis as channel identifiers
 *   - Y-axis with smart $k formatting
 *
 * Props:
 *   stats       — output of computeStats()
 *   preHasData  — bool: whether any pre-window data exists
 */
function ImpactBarChart({ stats, preHasData }) {
  const [containerRef, W] = useContainerWidth();
  const svgRef = useRef(null);

  useEffect(() => {
    // Always clear first — prevents stale chart on state changes.
    if (svgRef.current) d3.select(svgRef.current).selectAll("*").remove();

    const chartData = stats.filter(s => s.preRevDay != null || s.durRevDay != null);
    if (chartData.length === 0 || !svgRef.current || W === 0) return;

    const H      = 100;
    const margin = { top: 24, right: 10, bottom: 26, left: 38 };
    const iW     = W - margin.left - margin.right;
    const iH     = H - margin.top - margin.bottom;

    // ── Scales ──────────────────────────────────────────────────────────────

    // One band per channel.
    const xGroup = d3.scaleBand()
      .domain(chartData.map(s => String(s.chId)))
      .range([0, iW])
      .paddingInner(0.35)
      .paddingOuter(0.1);

    // Inner band: "before" and "during" bars within each group.
    // When pre-window has no data, only the "during" bar is rendered.
    const barKeys = preHasData ? ["before", "during"] : ["during"];
    const xBar = d3.scaleBand()
      .domain(barKeys)
      .range([0, xGroup.bandwidth()])
      .padding(0.08);

    const maxRev = d3.max(chartData, s => Math.max(s.preRevDay ?? 0, s.durRevDay ?? 0)) || 1;
    const yScale = d3.scaleLinear()
      .domain([0, maxRev * 1.3])
      .range([iH, 0]);

    // ── Render ───────────────────────────────────────────────────────────────

    const svg = d3.select(svgRef.current)
      .attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Subtle horizontal grid lines — just 2 ticks.
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(2).tickSize(-iW).tickFormat(""))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line")
        .attr("stroke", "#1A1A1A")
        .attr("stroke-dasharray", "1,5"));

    // ── Bars ──────────────────────────────────────────────────────────────

    chartData.forEach(s => {
      const chId    = s.chId;
      const chColor = CHANNEL_COLORS[chId] ?? "#888";
      const gx      = xGroup(String(chId));
      const group   = g.append("g").attr("transform", `translate(${gx},0)`);

      // Before bar — dark grey, subtle border.
      if (preHasData && s.preRevDay != null) {
        group.append("rect")
          .attr("x",      xBar("before"))
          .attr("y",      yScale(s.preRevDay))
          .attr("width",  xBar.bandwidth())
          .attr("height", iH - yScale(s.preRevDay))
          .attr("fill",   "#1E1E1E")
          .attr("stroke", "#2E2E2E")
          .attr("stroke-width", 0.5)
          .attr("rx", 1);
      }

      // During bar — channel color, semi-transparent.
      if (s.durRevDay != null) {
        group.append("rect")
          .attr("x",      xBar("during"))
          .attr("y",      yScale(s.durRevDay))
          .attr("width",  xBar.bandwidth())
          .attr("height", iH - yScale(s.durRevDay))
          .attr("fill",   chColor)
          .attr("opacity", 0.75)
          .attr("rx", 1);
      }

      // Δ% label above the taller bar (or during bar if no pre-data).
      if (s.revDelta != null && preHasData) {
        const topY = Math.min(
          s.preRevDay != null ? yScale(s.preRevDay) : iH,
          s.durRevDay != null ? yScale(s.durRevDay) : iH
        );
        const deltaColor = s.revDelta >= 0 ? "#4ADE80" : "#FF6666";
        const sign       = s.revDelta >= 0 ? "+" : "";

        group.append("text")
          .attr("x",           xGroup.bandwidth() / 2)
          .attr("y",           Math.max(2, topY - 5))
          .attr("text-anchor", "middle")
          .attr("font-size",   "8px")
          .attr("font-family", "Ndot55, monospace")
          .attr("fill",        deltaColor)
          .text(`${sign}${s.revDelta.toFixed(0)}%`);
      } else if (s.durRevDay != null && !preHasData) {
        // No pre-window: label shows absolute during value instead of delta.
        const fmtd = s.durRevDay >= 1000
          ? `$${(s.durRevDay / 1000).toFixed(1)}k`
          : `$${s.durRevDay.toFixed(0)}`;
        group.append("text")
          .attr("x",           xGroup.bandwidth() / 2)
          .attr("y",           Math.max(2, yScale(s.durRevDay) - 5))
          .attr("text-anchor", "middle")
          .attr("font-size",   "8px")
          .attr("font-family", "LetteraMonoLL, monospace")
          .attr("fill",        "#666")
          .text(fmtd);
      }

      // Channel color dot on the x-axis — acts as compact label.
      group.append("circle")
        .attr("cx",   xGroup.bandwidth() / 2)
        .attr("cy",   iH + 10)
        .attr("r",    3)
        .attr("fill", chColor);
    });

    // ── Y axis ───────────────────────────────────────────────────────────────

    // Smart format: $k if any value ≥ 1000, else plain $N.
    const yFmt = maxRev >= 1000
      ? d => `$${(d / 1000).toFixed(0)}k`
      : d => `$${d.toFixed(0)}`;

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(2).tickFormat(yFmt).tickSize(3))
      .call(ax => ax.select(".domain").attr("stroke", "#222"))
      .call(ax => ax.selectAll("text")
        .attr("fill",        "#5A5A5A")
        .attr("font-size",   "8px")
        .attr("font-family", "LetteraMonoLL, monospace"))
      .call(ax => ax.selectAll("line").attr("stroke", "#222"));

    // ── Legend ───────────────────────────────────────────────────────────────

    // "□ before  ■ during" — top-right corner of the chart.
    if (preHasData) {
      const leg = g.append("g").attr("transform", `translate(${iW}, -16)`);

      leg.append("rect")
        .attr("x", -88).attr("y", -5).attr("width", 7).attr("height", 7)
        .attr("fill", "#1E1E1E").attr("stroke", "#333").attr("stroke-width", 0.5).attr("rx", 1);
      leg.append("text")
        .attr("x", -78).attr("y", 2).attr("font-size", "8px")
        .attr("fill", "#555").attr("font-family", "LetteraMonoLL, monospace")
        .text("before");

      leg.append("rect")
        .attr("x", -34).attr("y", -5).attr("width", 7).attr("height", 7)
        .attr("fill", "#555").attr("rx", 1);
      leg.append("text")
        .attr("x", -24).attr("y", 2).attr("font-size", "8px")
        .attr("fill", "#555").attr("font-family", "LetteraMonoLL, monospace")
        .text("during");
    }

  }, [stats, preHasData, W]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg ref={svgRef} style={{ display: "block", width: "100%" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

function ShockImpactCard({ shock, results, viewDay }) {
  const affectedIds = useMemo(() => getAffectedIds(shock), [shock]);

  const stats = useMemo(
    () => computeStats(affectedIds, shock.triggered_on_day, shock.endDay, results, viewDay),
    [affectedIds, shock.triggered_on_day, shock.endDay, results, viewDay]
  );

  const multiplierBadges = Object.entries(shock.multipliers ?? {}).map(([k, v]) => fmtMultiplier(k, v));

  // Status relative to slider position (viewDay), not wall-clock time.
  const isActive    = viewDay >= shock.triggered_on_day && viewDay <= shock.endDay;
  const isPending   = viewDay < shock.triggered_on_day;
  const status      = isPending ? "PENDING" : isActive ? "ACTIVE" : "EXPIRED";
  const statusColor = isActive ? "#22D3EE" : isPending ? "#888" : "#444";

  // Pre-window: days before the shock used as baseline.
  const preStart   = Math.max(1, shock.triggered_on_day - PRE_WINDOW_DAYS);
  const preHasData = preStart < shock.triggered_on_day;

  // Visible during-window upper bound.
  const durEnd = Math.min(shock.endDay, viewDay);

  // Whether any data is available to show in the chart at all.
  const hasAnyData = stats.some(s => s.preRevDay != null || s.durRevDay != null);

  return (
    <div style={{
      minWidth: "260px",
      maxWidth: "300px",
      flexShrink: 0,
      background: "#111",
      border: "1px solid #2A2A2A",
      borderRadius: "4px",
      overflow: "hidden",
      fontSize: "10px",
      fontFamily: "LetteraMonoLL, monospace",
      animation: "fadeIn 350ms ease",
    }}>

      {/* ── Card header ── */}
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}>
        {/* Name + status badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            <span style={{ color: "#FF4444", fontSize: "12px", flexShrink: 0 }}>⚡</span>
            <span style={{
              fontFamily: "Ndot55, monospace",
              fontSize: "10px",
              color: "#E0E0E0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {shock.name}
            </span>
          </div>
          <span style={{
            fontSize: "8px",
            color: statusColor,
            border: `1px solid ${statusColor}44`,
            padding: "1px 5px",
            borderRadius: "2px",
            letterSpacing: "0.1em",
            flexShrink: 0,
          }}>
            {status}
          </span>
        </div>

        {/* Day range */}
        <div style={{ color: "#555", fontSize: "9px", letterSpacing: "0.06em" }}>
          D{shock.triggered_on_day} → D{shock.endDay}
          {" · "}
          {shock.endDay - shock.triggered_on_day} days
        </div>

        {/* Multiplier pills */}
        {multiplierBadges.length > 0 && (
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {multiplierBadges.map(({ text, color }, i) => (
              <span key={i} style={{
                color,
                border: `1px solid ${color}33`,
                borderRadius: "2px",
                padding: "1px 5px",
                fontSize: "9px",
                letterSpacing: "0.06em",
              }}>
                {text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Description ── */}
      <div style={{
        padding: "8px 14px",
        borderBottom: "1px solid #222",
        color: "#555",
        fontSize: "9px",
        lineHeight: "1.6",
      }}>
        {shock.description}
      </div>

      {/* ── Revenue impact chart ── */}
      <div style={{ padding: "8px 14px 10px" }}>
        <div style={{
          fontSize: "8px",
          color: "#555",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "4px",
        }}>
          Avg Daily Revenue
        </div>

        {hasAnyData ? (
          <ImpactBarChart stats={stats} preHasData={preHasData} />
        ) : (
          <div style={{ color: "#555", fontSize: "9px", padding: "10px 0" }}>
            Data will appear as simulation advances
          </div>
        )}

        {/* Budget deltas — compact text row below the chart */}
        {hasAnyData && (
          <div style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "4px",
          }}>
            {stats.filter(s => s.budDelta != null).map(({ chId, preBudDay, durBudDay, budDelta }) => {
              const budColor = budDelta >= 0 ? "#555" : "#4ADE80";  // less budget = green (efficient)
              const sign     = budDelta >= 0 ? "+" : "";
              const fmt      = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
              return (
                <div key={chId} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{
                    width: "4px", height: "4px", borderRadius: "50%",
                    background: CHANNEL_COLORS[chId] ?? "#888",
                    flexShrink: 0,
                  }} />
                  <span style={{ color: "#5A5A5A", fontSize: "8px" }}>
                    {CHANNEL_NAMES[chId] ?? `Ch${chId}`}
                  </span>
                  <span style={{ color: budColor, fontSize: "8px", fontFamily: "Ndot55, monospace" }}>
                    {sign}{budDelta.toFixed(0)}% bud
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Window labels */}
        <div style={{
          color: "#5A5A5A",
          fontSize: "8px",
          marginTop: "6px",
          borderTop: "1px solid #222",
          paddingTop: "6px",
        }}>
          {preHasData
            ? `Pre D${preStart}–D${shock.triggered_on_day - 1} · Shock D${shock.triggered_on_day}–D${durEnd} · ROAS obj`
            : `Shock from D${shock.triggered_on_day} · no pre-shock baseline`
          }
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ShockImpactPanel({ shockEvents, results, viewDay }) {
  if (!shockEvents || shockEvents.length === 0) return null;

  return (
    // Flex column: single horizontal label row on top, scrollable cards below.
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           "10px",
      marginBottom:  "28px",
      animation:     "fadeIn 400ms ease",
      minWidth:      0,
    }}>
      {/* Section label — single horizontal line */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        "8px",
        fontFamily: "LetteraMonoLL, monospace",
      }}>
        <span style={{ color: "#FF4444", fontSize: "11px" }}>⚡</span>
        <span style={{ fontSize: "9px", color: "#5A5A5A", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Shock Events
        </span>
        <span style={{ fontSize: "9px", color: "#333" }}>·</span>
        <span style={{ fontSize: "8px", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Impact Analysis
        </span>
        <span style={{ fontSize: "9px", color: "#333" }}>·</span>
        <span style={{ fontSize: "8px", color: "#444" }}>
          {shockEvents.length} event{shockEvents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Horizontally scrollable cards */}
      <div style={{
        display:        "flex",
        gap:            "12px",
        overflowX:      "auto",
        paddingBottom:  "6px",
        minWidth:       0,
        scrollbarWidth: "thin",
        scrollbarColor: "#2A2A2A #111",
      }}>
        {shockEvents.map((shock, i) => (
          <ShockImpactCard
            key={shock.id ?? `${shock.triggered_on_day}-${i}`}
            shock={shock}
            results={results}
            viewDay={viewDay}
          />
        ))}
      </div>
    </div>
  );
}
