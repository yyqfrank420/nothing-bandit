import * as d3 from "d3";
import React, { useEffect } from "react";
import { useContainerWidth } from "../hooks.js";
import { CHANNEL_COLORS, CHANNEL_NAMES } from "../App.jsx";

const CHANNEL_IDS = [1, 2, 3, 4, 5, 6];
const N_POINTS = 120;

function betaPDF(alpha, beta) {
  const xs = d3.range(1 / N_POINTS, 1, 1 / N_POINTS);
  // Evaluate in log space to avoid intermediate overflow for large parameters.
  const logNorm = logBeta(alpha, beta);
  return xs.map((x) => {
    const logPDF = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logNorm;
    return { x, y: Math.exp(logPDF) };
  });
}

function logGamma(z) {
  // Lanczos approximation for positive parameters.
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

// Positive Beta parameters can have one boundary mode or peaks at both boundaries.
function posteriorModes(alpha, beta) {
  if (alpha === 1 && beta === 1) return [];
  if (alpha < 1 && beta < 1) return [0, 1];
  if (alpha <= 1 && beta >= 1) return [0];
  if (alpha >= 1 && beta <= 1) return [1];
  return [(alpha - 1) / (alpha + beta - 2)];
}

export default function BanditConfidenceChart({ banditStates, objective }) {
  const [containerRef, totalW] = useContainerWidth();
  const cols = totalW >= 420 ? 3 : totalW >= 240 ? 2 : 1;
  const rows = Math.ceil(CHANNEL_IDS.length / cols);
  const cellH = 112;
  const gap = 12;

  useEffect(() => {
    if (containerRef.current) d3.select(containerRef.current).selectAll("svg").remove();
    if (!banditStates || banditStates.length === 0 || !containerRef.current || totalW === 0) return;

    const stateMap = {};
    banditStates
      .filter((s) => s.objective === objective)
      .forEach((s) => { stateMap[s.channel_id] = { alpha: s.alpha, beta: s.beta }; });

    const container = containerRef.current;

    const cellW = Math.floor((totalW - gap * (cols - 1)) / cols);

    CHANNEL_IDS.forEach((chId, idx) => {
      const state = stateMap[chId] ?? { alpha: 1, beta: 1 };
      const { alpha, beta } = state;

      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const color = CHANNEL_COLORS[chId];
      const name  = CHANNEL_NAMES[chId];
      const modes = posteriorModes(alpha, beta);
      const modeLabel = modes.length === 0
        ? "Uniform"
        : `${modes.length === 1 ? "Mode" : "Modes"} ${modes.map((mode) => `${Math.round(mode * 100)}%`).join(", ")}`;

      const data = betaPDF(alpha, beta);
      const maxY = d3.max(data, (d) => d.y);

      const svg = d3.select(container)
        .append("svg")
        .attr("width", cellW)
        .attr("height", cellH)
        .style("position", "absolute")
        .style("left", `${col * (cellW + gap)}px`)
        .style("top", `${row * (cellH + gap)}px`)
        .style("overflow", "hidden")
        .attr("role", "img");
      svg.append("title").text(
        `${name}, ${objective.toUpperCase()} posterior: alpha ${alpha.toFixed(1)}, beta ${beta.toFixed(1)}. ` +
        (modes.length === 0 ? "Uniform distribution with no unique mode." : `${modeLabel}.`)
      );

      const margin = { top: 38, right: 6, bottom: 22, left: 6 };
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

      const gradId = `conf-grad-${objective}-${chId}`;
      const defs = svg.append("defs");
      const grad = defs.append("linearGradient")
        .attr("id", gradId)
        .attr("x1", "0").attr("y1", "0")
        .attr("x2", "0").attr("y2", "1");
      grad.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.3);
      grad.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.02);

      g.append("line")
        .attr("x1", 0).attr("y1", iH).attr("x2", iW).attr("y2", iH)
        .attr("stroke", "#282828").attr("stroke-width", 1);

      g.append("path")
        .datum(data)
        .attr("fill", `url(#${gradId})`)
        .attr("d", areaGen);

      g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("d", lineGen);

      // Labels have separate rows so curve position never affects text placement.
      svg.append("text")
        .attr("x", margin.left)
        .attr("y", 12)
        .style("fill", color)
        .attr("font-size", "11px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .text(name.toUpperCase());

      svg.append("text")
        .attr("x", margin.left)
        .attr("y", 28)
        .style("fill", "var(--color-text-2)")
        .attr("font-size", "10px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .text(`α ${alpha.toFixed(0)}   β ${beta.toFixed(0)}`);

      for (const mode of modes) {
        g.append("line")
          .attr("x1", xScale(mode)).attr("x2", xScale(mode))
          .attr("y1", 0).attr("y2", iH)
          .attr("stroke", color)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "2,3")
          .attr("opacity", 0.5);
      }

      svg.append("text")
        .attr("x", margin.left)
        .attr("y", cellH - 4)
        .style("fill", "var(--color-text-2)")
        .attr("font-size", "10px")
        .attr("font-family", "LetteraMonoLL, monospace")
        .text(modeLabel);
    });

  }, [banditStates, objective, totalW, cols]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `${rows * cellH + (rows - 1) * gap}px`,
      }}
    />
  );
}
