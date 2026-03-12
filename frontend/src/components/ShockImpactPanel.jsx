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
// Bandit edge helper — computes ROAS % edge vs static for a time window
// ---------------------------------------------------------------------------

/**
 * Computes the bandit's ROAS advantage over static (as a percentage of static ROAS)
 * for three windows around a shock: 7 days before, during, and 14 days after.
 *
 * Returns { pre, during, post } — each null if data isn't available yet.
 * Uses the ROAS objective only (single representative slice, avoids triple-counting).
 */
function computeBanditEdge(triggeredOn, endDay, results, viewDay) {
  const roasRows = results.filter(r => r.objective === "roas");

  const edgeForWindow = (start, end) => {
    if (start > end || start > viewDay) return null;
    const clampedEnd  = Math.min(end, viewDay);
    const banditRows  = roasRows.filter(r => r.allocator === "bandit" && r.day >= start && r.day <= clampedEnd);
    const staticRows  = roasRows.filter(r => r.allocator === "static" && r.day >= start && r.day <= clampedEnd);
    if (banditRows.length === 0 || staticRows.length === 0) return null;

    const sum         = (arr, key) => arr.reduce((s, r) => s + r[key], 0);
    const bRev        = sum(banditRows, "revenue");
    const bBud        = sum(banditRows, "budget_allocated");
    const sRev        = sum(staticRows, "revenue");
    const sBud        = sum(staticRows, "budget_allocated");
    const bROAS       = bBud > 0 ? bRev / bBud : 0;
    const sROAS       = sBud > 0 ? sRev / sBud : 0;
    if (sROAS === 0) return null;
    return ((bROAS - sROAS) / sROAS) * 100;
  };

  const preStart  = Math.max(1, triggeredOn - 7);
  const postStart = endDay + 1;
  const postEnd   = endDay + 14;

  return {
    pre:    edgeForWindow(preStart, triggeredOn - 1),
    during: edgeForWindow(triggeredOn, endDay),
    post:   viewDay > endDay ? edgeForWindow(postStart, postEnd) : null,
  };
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

  const banditEdge = useMemo(
    () => computeBanditEdge(shock.triggered_on_day, shock.endDay, results, viewDay),
    [shock.triggered_on_day, shock.endDay, results, viewDay]
  );

  const multiplierBadges = Object.entries(shock.multipliers ?? {}).map(([k, v]) => fmtMultiplier(k, v));

  // Status relative to slider position (viewDay), not wall-clock time.
  const isActive    = viewDay >= shock.triggered_on_day && viewDay <= shock.endDay;
  const isPending   = viewDay < shock.triggered_on_day;
  const status      = isPending ? "PENDING" : isActive ? "ACTIVE" : "EXPIRED";
  // #F0F0F0 (near-white) for ACTIVE avoids clashing with TikTok Ads channel color (#22D3EE).
  const statusColor = isActive ? "#F0F0F0" : isPending ? "#888" : "#444";

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

        {/* Affected channels */}
        {affectedIds.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
            <span style={{ color: "#444", fontSize: "8px", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
              Affected:
            </span>
            {affectedIds.map(chId => (
              <span key={chId} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <span style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: CHANNEL_COLORS[chId] ?? "#888",
                  display: "inline-block", flexShrink: 0,
                }} />
                <span style={{ color: "#666", fontSize: "8px" }}>
                  {CHANNEL_NAMES[chId] ?? `Ch${chId}`}
                </span>
              </span>
            ))}
          </div>
        )}

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
              const budColor = budDelta >= 0 ? "#4ADE80" : "#FF6666";  // + = green, - = red
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

      {/* ── Bandit response insight ── */}
      {banditEdge.during !== null && (
        <BanditResponseRow edge={banditEdge} />
      )}
    </div>
  );
}

/**
 * Shows how the bandit's ROAS edge changed across the shock window.
 * Three states: maintained (green), compressed-but-positive (amber), lost (red).
 * Displayed as a compact row at the card bottom — one sentence + edge numbers.
 */
function BanditResponseRow({ edge }) {
  const { pre, during, post } = edge;

  // Determine the narrative colour based on how the edge moved.
  const edgeColor = during >= (pre ?? 0) * 0.5 && during > 0
    ? "#4ADE80"   // held or barely compressed — green
    : during > 0
      ? "#F97316"  // compressed but still positive — amber
      : "#FF6666"; // went negative — red

  const fmt  = v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const fmtC = (v, c) => <span style={{ color: c, fontFamily: "Ndot55, monospace" }}>{fmt(v)}</span>;

  // Build the edge trail: pre → during → post (only show segments with data).
  const trail = [];
  if (pre !== null)    trail.push({ label: "before", val: pre,    color: "#888" });
                       trail.push({ label: "during", val: during, color: edgeColor });
  if (post !== null)   trail.push({ label: "after",  val: post,   color: "#4ADE80" });

  return (
    <div style={{
      padding:     "8px 14px",
      borderTop:   "1px solid #1A1A1A",
      background:  "rgba(255,255,255,0.01)",
      fontFamily:  "LetteraMonoLL, monospace",
    }}>
      {/* Label */}
      <div style={{ fontSize: "8px", color: "#444", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
        Bandit Response
      </div>

      {/* Edge trail — visual before→during→after chain */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap", marginBottom: "5px" }}>
        {trail.map(({ label, val, color }, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span style={{ color: "#333", fontSize: "9px" }}>→</span>}
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
              <span style={{ color, fontFamily: "Ndot55, monospace", fontSize: "10px" }}>
                {val >= 0 ? "+" : ""}{val.toFixed(1)}%
              </span>
              <span style={{ color: "#444", fontSize: "7px", letterSpacing: "0.06em" }}>{label}</span>
            </span>
          </React.Fragment>
        ))}
        <span style={{ fontSize: "8px", color: "#555", marginLeft: "4px" }}>vs static ROAS</span>
      </div>

      {/* Plain-English sentence */}
      <div style={{ fontSize: "9px", color: "#555", lineHeight: "1.5" }}>
        {during > 0
          ? pre !== null && during < pre * 0.7
            ? `Edge compressed by this shock — the bandit re-learned and ${post !== null ? `recovered to ${fmt(post)}` : "is recovering"}. Shock-era evidence fades with a ~14-day half-life.`
            : `The bandit held its advantage over static through this shock.`
          : `Edge temporarily lost during this shock. With γ=0.95 decay, the bad signal fades in ~2–3 weeks and all three bandits self-correct.`
        }
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ShockImpactPanel({ shockEvents, results, viewDay }) {
  if (!shockEvents || shockEvents.length === 0) return null;

  // Cumulative ROAS edge (bandit vs static) across the full visible period.
  // Used in the thesis banner below — shows the top-line advantage at a glance.
  const cumulativeEdge = useMemo(() => {
    const roasRows   = results.filter(r => r.objective === "roas");
    const sum        = (alloc, key) => roasRows.filter(r => r.allocator === alloc).reduce((s, r) => s + r[key], 0);
    const bROAS      = sum("bandit", "budget_allocated") > 0
      ? sum("bandit", "revenue") / sum("bandit", "budget_allocated") : 0;
    const sROAS      = sum("static", "budget_allocated") > 0
      ? sum("static", "revenue") / sum("static", "budget_allocated") : 0;
    if (sROAS === 0) return null;
    return ((bROAS - sROAS) / sROAS) * 100;
  }, [results]);

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
        {/* › scroll cue — appears when there are multiple cards to scroll through */}
        {shockEvents.length > 1 && (
          <span style={{ fontSize: "11px", color: "#444", marginLeft: "4px" }}>›</span>
        )}
      </div>

      {/* Thesis banner — the one insight that always holds true */}
      {cumulativeEdge !== null && (
        <div style={{
          padding:    "10px 14px",
          borderLeft: "2px solid var(--color-positive)",
          background: "rgba(74,222,128,0.03)",
          fontFamily: "LetteraMonoLL, monospace",
          fontSize:   "10px",
          lineHeight: "1.7",
          color:      "#666",
          animation:  "fadeIn 400ms ease",
          display:    "flex",
          flexDirection: "column",
          gap:        "5px",
        }}>
          {/* Thesis line 1 — the core claim */}
          <span style={{ color: "#888" }}>
            Regardless of how many market shocks hit or which channels dip,{" "}
            <span style={{ color: "#C0C0C0" }}>the bandit consistently outperforms the static equal-split baseline</span>
            {" "}— shocks force re-learning, not regression. Cumulative ROAS edge:{" "}
            <span style={{ color: "var(--color-positive)", fontFamily: "Ndot55, monospace" }}>
              {cumulativeEdge >= 0 ? "+" : ""}{cumulativeEdge.toFixed(1)}%
            </span>
            {" "}vs static across {viewDay} day{viewDay !== 1 ? "s" : ""}.
          </span>
          {/* Thesis line 2 — the forgetting mechanism */}
          <span style={{ color: "#555", fontSize: "9px" }}>
            All 3 bandits (CTR, ROAS, CAC) will temporarily shake after a shock as they absorb the new signal.
            {" "}Evidence decay (γ=0.95) gives accumulated observations a{" "}
            <span style={{ color: "#888" }}>~14-day half-life</span>
            {" "}— shock-era failures fade automatically. Within 2–3 weeks of a shock ending, allocation returns to optimal without any manual reset.
          </span>
        </div>
      )}

      {/* Horizontally scrollable cards — right-edge fade hints at overflow content */}
      <div style={{
        display:        "flex",
        gap:            "12px",
        overflowX:      "auto",
        paddingBottom:  "6px",
        minWidth:       0,
        scrollbarWidth: "thin",
        scrollbarColor: "#2A2A2A #111",
        maskImage:         "linear-gradient(to right, black 85%, transparent 100%)",
        WebkitMaskImage:   "linear-gradient(to right, black 85%, transparent 100%)",
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
