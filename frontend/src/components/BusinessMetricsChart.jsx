import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useContainerWidth } from "../hooks.js";
import { formatPercent } from "../metricFormatting.js";
import "./BusinessMetricsChart.css";

const ALL_OBJECTIVES = ["ctr", "roas", "cac"];

const OBJECTIVE_LABELS = {
  all:  "All objectives (avg)",
  ctr:  "CTR: Click-through rate",
  roas: "ROAS: Return on ad spend",
  cac:  "CAC: Customer acquisition cost",
};

// Scale-aware revenue formatter: avoids "$1300k" at large cumulative values.
const fmtRevenue = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};

const KPIS = [
  {
    key:       "revenue",
    label:     "Cumulative revenue",
    format:    fmtRevenue,
    higherBetter: true,
    color:     "var(--color-positive)",
  },
  {
    key:       "cac",
    label:     "Running CAC",
    format:    (v) => `$${v.toFixed(2)}`,
    higherBetter: false,
    color:     "var(--color-info)",
  },
  {
    key:       "roas",
    label:     "Running ROAS",
    format:    (v) => `${v.toFixed(2)}×`,
    higherBetter: true,
    color:     "var(--ch-2)",
  },
  {
    key:       "conversions",
    label:     "Total conversions",
    format:    (v) => v.toFixed(0),
    higherBetter: true,
    color:     "var(--color-warning)",
  },
];

function useSeries(results, activeObjective) {
  return useMemo(() => {
    if (!results || results.length === 0) return { bandit: [], static: [] };

    // When filtering to one objective, the rows are already scoped: no averaging needed.
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

function ZeroKpiCard({ kpi }) {
  return (
    <div className="business-kpi-card">
      <div className="business-kpi-label">
        {kpi.label}
      </div>
      <div className="business-kpi-value business-kpi-value-empty">
        {kpi.key === "cac" || kpi.key === "roas" ? "No data" : kpi.format(0)}
      </div>
      <div className="business-kpi-comparison">
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

  const rawDelta = kpi.higherBetter ? bv - sv : sv - bv;
  const percent = formatPercent(sv > 0 ? (rawDelta / Math.abs(sv)) * 100 : null);
  const deltaColor = percent.tone === "neutral" ? "var(--color-text-2)" : `var(--color-${percent.tone})`;
  const deltaStr = percent.text;

  const absDiff = Math.abs(bv - sv);
  const betterLabel = kpi.higherBetter ? "higher is better" : "lower is better";
  const showTooltip = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 32);
    const above = rect.bottom + 240 > window.innerHeight && rect.top >= 240;
    setTooltipPos({
      x: Math.max(16 + width / 2, Math.min(rect.left + rect.width / 2, window.innerWidth - 16 - width / 2)),
      y: above ? rect.top - 12 : Math.max(16, Math.min(rect.bottom + 12, window.innerHeight - 240)),
      above,
      width,
    });
  };

  return (
    <div
      className="business-kpi-card"
      tabIndex={0}
      role="group"
      aria-label={`${kpi.label}: Bandit ${kpi.format(bv)}, static ${kpi.format(sv)}. ${deltaStr} vs static. ${betterLabel}. ${kpi.format(absDiff)} absolute difference.`}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltipPos(null)}
      onFocus={showTooltip}
      onBlur={() => setTooltipPos(null)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTooltipPos(null);
      }}
    >
      <div className="business-kpi-label">
        {kpi.label}
      </div>
      <div className="business-kpi-value" style={{ color: kpi.color }}>
        {kpi.format(bv)}
      </div>
      <div className="business-kpi-comparison">
        <span style={{ color: deltaColor }}>
          {deltaStr}
        </span>
        <span>vs static</span>
      </div>

      {/* Fixed positioning keeps the tooltip outside chart overflow bounds. */}
      {tooltipPos && (
        <div className="business-kpi-tooltip" aria-hidden="true" style={{
          left: `${tooltipPos.x}px`,
          top: `${tooltipPos.y}px`,
          transform: tooltipPos.above ? "translate(-50%, -100%)" : "translateX(-50%)",
          width: `${tooltipPos.width}px`,
        }}>
          <div className="business-kpi-tooltip-title">
            {kpi.label} · {betterLabel}
          </div>
          <div><span style={{ color: "var(--color-positive)" }}>Bandit</span>: {kpi.format(bv)}</div>
          <div>Static: {kpi.format(sv)}</div>
          <div className="business-kpi-tooltip-comparison">
            <span style={{ color: deltaColor }}>{deltaStr}</span>
            <span> vs static baseline</span>
          </div>
          <div>
            {kpi.format(absDiff)} absolute difference
          </div>
        </div>
      )}
    </div>
  );
}

function KpiChart({ kpi, banditSeries, staticSeries, currentDay }) {
  const [containerRef, W] = useContainerWidth();
  const svgRef = useRef(null);

  useEffect(() => {
    if (!banditSeries.length || !svgRef.current || W === 0) return;
    const H = 190;
    // CAC currency ticks need extra space to preserve the dollar sign on mobile.
    const margin = { top: 12, right: 12, bottom: 28, left: kpi.key === "cac" ? 72 : 52 };
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

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(3).tickSize(-iW).tickFormat(""))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "var(--color-surface-2)").attr("stroke-dasharray", "2,4"));

    g.append("path")
      .datum(banditSeries)
      .attr("fill", `url(#${gradId})`)
      .attr("d", d3.area()
        .x((d) => xScale(d.day))
        .y0(iH)
        .y1((d) => yScale(d[kpi.key]))
        .curve(d3.curveCatmullRom.alpha(0.5)));

    g.append("path")
      .attr("fill", "none")
      .attr("stroke", "var(--color-muted)")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("d", lineGen(staticSeries));

    g.append("path")
      .attr("fill", "none")
      .attr("stroke", kpi.color)
      .attr("stroke-width", 2)
      .attr("d", lineGen(banditSeries));

    g.append("g")
      .attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xScale)
        .ticks(Math.min(days.length, 5))
        .tickFormat((d) => `D${d}`)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "var(--color-border)"))
      .call((g) => g.selectAll("text").attr("fill", "var(--color-text-2)").attr("font-size", "11px").attr("font-family", "var(--font-mono)"))
      .call((g) => g.selectAll("line").attr("stroke", "var(--color-border)"));

    g.append("g")
      .call(d3.axisLeft(yScale)
        .ticks(3)
        .tickFormat(kpi.format)
        .tickSize(3))
      .call((g) => g.select(".domain").attr("stroke", "var(--color-border)"))
      .call((g) => g.selectAll("text").attr("fill", "var(--color-text-2)").attr("font-size", "11px").attr("font-family", "var(--font-mono)"))
      .call((g) => g.selectAll("line").attr("stroke", "var(--color-border)"));

    const hoverDotBandit = g.append("circle")
      .attr("r", 5).attr("fill", kpi.color)
      .attr("stroke", "var(--color-bg)").attr("stroke-width", 1.5)
      .attr("opacity", 0).attr("pointer-events", "none");

    const hoverDotStatic = g.append("circle")
      .attr("r", 3.5).attr("fill", "var(--color-muted)")
      .attr("stroke", "var(--color-bg)").attr("stroke-width", 1)
      .attr("opacity", 0).attr("pointer-events", "none");

    // Reuse a single tooltip div per chart type (data([null]).join avoids duplicates).
    const tooltipClass = `bm-tooltip-${kpi.key}`;
    const tooltip = d3.select("body").selectAll(`.${tooltipClass}`).data([null]).join("div")
      .attr("class", tooltipClass)
      .style("position", "fixed")
      .style("background", "var(--color-surface-2)")
      .style("border", "1px solid var(--color-border-2)")
      .style("border-radius", "3px")
      .style("padding", "8px 10px")
      .style("font-size", "11px")
      .style("font-family", "var(--font-mono)")
      .style("color", "var(--color-text)")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", 600)
      .style("line-height", "1.8")
      .style("transition", "opacity 80ms")
      .style("white-space", "nowrap");

    const banditByDay = new Map(banditSeries.map((d) => [d.day, d[kpi.key]]));
    const staticByDay = new Map(staticSeries.map((d) => [d.day, d[kpi.key]]));

    const crosshair = g.append("line")
      .attr("y1", 0).attr("y2", iH)
      .attr("stroke", "var(--color-border-2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,3")
      .attr("opacity", 0)
      .attr("pointer-events", "none");

    g.append("rect")
      .attr("width", iW).attr("height", iH)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const day = Math.round(xScale.invert(mx));
        const bv  = banditByDay.get(day);
        const sv  = staticByDay.get(day);
        if (bv == null) return;

        const snappedX = xScale(day);
        crosshair.attr("x1", snappedX).attr("x2", snappedX).attr("opacity", 0.7);
        hoverDotBandit.attr("cx", snappedX).attr("cy", yScale(bv)).attr("opacity", 1);
        hoverDotStatic.attr("cx", snappedX).attr("cy", yScale(sv ?? bv)).attr("opacity", sv != null ? 0.85 : 0);

        const rawDelta = kpi.higherBetter ? bv - sv : sv - bv;
        const percent = formatPercent(sv > 0 ? (rawDelta / Math.abs(sv)) * 100 : null);
        const deltaStr = percent.text;
        const deltaColor = percent.tone === "neutral" ? "var(--color-text-2)" : `var(--color-${percent.tone})`;

        tooltip
          .style("opacity", 1)
          .style("left", `${event.clientX + 14}px`)
          .style("top",  `${event.clientY - 14}px`)
          .html(
            `<div style="color:var(--color-text-2);font-size:11px;margin-bottom:4px">` +
            `DAY ${day} · ${kpi.label.toUpperCase()}</div>` +
            `<span style="color:var(--color-positive)">Bandit</span>: ${kpi.format(bv)}<br/>` +
            `<span style="color:var(--color-text-2)">Static</span>: ${sv == null ? "No data" : kpi.format(sv)}` +
            `<div style="margin-top:5px;border-top:1px solid var(--color-border);padding-top:5px">` +
            `<span style="color:${deltaColor}">${deltaStr}</span>` +
            `<span style="color:var(--color-text-2);margin-left:6px">vs static</span></div>`
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
    <div className="business-chart-panel">
      <h3 className="business-chart-title">
        {kpi.label}
      </h3>
      <div ref={containerRef} style={{ width: "100%" }}>
        <svg ref={svgRef} role="img" aria-label={`${kpi.label}, bandit compared with static allocation over time`} style={{ display: "block", width: "100%" }} />
      </div>
    </div>
  );
}

function ObjTab({ label, description, active, onClick }) {
  return (
    <button
      className="business-objective-tab"
      type="button"
      aria-label={description}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function BusinessMetricsChart({ results, currentDay }) {
  const [activeObjective, setActiveObjective] = useState("all");

  const { bandit: banditSeries, static: staticSeries } = useSeries(results, activeObjective);

  const isEmpty = banditSeries.length === 0;

  return (
    <div className="business-metrics">
      <div className="business-metrics-filter">
        <span className="business-metrics-filter-label">Objective</span>
        <div className="business-objectives" role="group" aria-label="Filter business metrics by objective">
          {["all", "ctr", "roas", "cac"].map((obj) => (
            <ObjTab
              key={obj}
              label={obj === "all" ? "All (avg)" : obj.toUpperCase()}
              description={OBJECTIVE_LABELS[obj]}
              active={activeObjective === obj}
              onClick={() => setActiveObjective(obj)}
            />
          ))}
        </div>
      </div>

      {activeObjective === "ctr" && (
        <p className="business-metrics-note">
          Maximising click-through rate can attract high-volume but low-quality traffic: wrong audience segments that don't convert.
          {" "}ROAS and CAC tabs show objectives that directly track revenue and acquisition efficiency.
        </p>
      )}

      <div className="business-kpi-grid">
        {KPIS.map((kpi) => (
          isEmpty
            ? <ZeroKpiCard key={kpi.key} kpi={kpi} />
            : <KpiCard key={kpi.key} kpi={kpi} banditSeries={banditSeries} staticSeries={staticSeries} />
        ))}
      </div>

      {!isEmpty && (
        <div className="business-chart-grid">
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
