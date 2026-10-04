import React, { useMemo } from "react";
import { CHANNEL_COLORS, CHANNEL_NAMES } from "../App.jsx";
import { analyzeShock, shockStatus } from "./shockAnalysis.js";
import { formatPercent } from "../metricFormatting.js";
import "./ShockImpactPanel.css";

const METRIC_LABELS = { ctr: "CTR", roas: "ROAS", cac: "CAC" };
const PERIOD_LABELS = { before: "Before", during: "During", after: "After" };

function affectedChannelIds(shock) {
  if (Array.isArray(shock.affected_channel_ids)) return [...new Set(shock.affected_channel_ids)];
  const nameToId = Object.fromEntries(Object.entries(CHANNEL_NAMES).map(([id, name]) => [name, Number(id)]));
  return [...new Set((shock.affected_channels ?? shock.affected_channel_names ?? [])
    .map((name) => nameToId[name]).filter((id) => id != null))];
}

function formatCurrency(value) {
  if (value == null || !Number.isFinite(value)) return "No data";
  const amount = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (amount >= 1_000_000) return `${sign}$${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1_000) return `${sign}$${(amount / 1_000).toFixed(1)}k`;
  return `${sign}$${amount.toFixed(0)}`;
}

function ChannelName({ id }) {
  return (
    <span className="shock-channel-name">
      <span className="shock-channel-dot" aria-hidden="true" style={{ background: CHANNEL_COLORS[id] ?? "var(--color-muted)" }} />
      {CHANNEL_NAMES[id] ?? `Channel ${id}`}
    </span>
  );
}

function ChannelObservations({ stats }) {
  return (
    <table className="shock-channel-table">
      <caption><ChannelName id={stats.channelId} /></caption>
      <thead><tr><th scope="col">Period</th><th scope="col">Daily revenue</th><th scope="col">Daily spend</th></tr></thead>
      <tbody>
        {["before", "during"].map((period) => (
          <tr key={period}>
            <th scope="row">{PERIOD_LABELS[period]}</th>
            <td>{formatCurrency(stats[period].revenue)}</td>
            <td>{formatCurrency(stats[period].spend)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ShockReport({ shock, results, viewDay }) {
  const affectedIds = useMemo(() => affectedChannelIds(shock), [shock]);
  const analysis = useMemo(() => analyzeShock(shock, affectedIds, results, viewDay), [shock, affectedIds, results, viewDay]);
  const status = shockStatus(shock, viewDay);
  const duration = shock.end_day - shock.start_day + 1;
  return (
    <article className="shock-report">
      <header className="shock-report-header">
        <h3>{shock.name}</h3>
        <span className={`shock-status shock-status-${status}`}>{status}</span>
      </header>
      <div className="shock-report-body">
        <div className="shock-details">
          <dl className="shock-facts">
            <div><dt>Day range</dt><dd>Day {shock.start_day} to {shock.end_day}</dd></div>
            <div><dt>Duration</dt><dd>{duration} day{duration === 1 ? "" : "s"}</dd></div>
            <div>
              <dt>Affected channels</dt>
              <dd className="shock-channel-list">
                {affectedIds.length ? affectedIds.map((id) => <ChannelName key={id} id={id} />) : "None specified"}
              </dd>
            </div>
            {Object.entries(shock.multipliers ?? {}).length > 0 && (
              <div>
                <dt>Scenario multipliers</dt>
                <dd className="shock-multipliers">
                  {Object.entries(shock.multipliers).map(([metric, value]) => (
                    <span key={metric}>{METRIC_LABELS[metric] ?? metric.toUpperCase()}: {Number.isFinite(value) ? `${value}x` : "Unavailable"}</span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {shock.description && <p className="shock-description">{shock.description}</p>}
        </div>
        <div className="shock-observations">
          <h4>ROAS vs static</h4>
          <div className="shock-periods">
            {Object.entries(analysis.periods).map(([period, data]) => {
              const percent = formatPercent(data.edge);
              return (
                <div className="shock-period" key={period}>
                  <span className="shock-period-label">{PERIOD_LABELS[period]}</span>
                  <span className={`shock-period-value shock-value-${percent.tone}`}>{percent.text}</span>
                  <span className="shock-period-days">
                    {data.observedDays > 0
                      ? `${data.observedDays} observed day${data.observedDays === 1 ? "" : "s"}`
                      : period === "before" ? "No earlier data"
                        : period === "after" ? "Not available yet"
                          : status === "scheduled" ? "Not started" : "No observations yet"}
                  </span>
                </div>
              );
            })}
          </div>
          {shock.start_day === 1 && (
            <p className="shock-description">This event began on day 1, so there is no before-event baseline.</p>
          )}
          {analysis.channels.length > 0 && (
            <div className="shock-channel-observations">
              <h4>Bandit channel averages</h4>
              {analysis.channels.map((stats) => <ChannelObservations key={stats.channelId} stats={stats} />)}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ShockImpactPanel({ shockEvents, results, viewDay }) {
  if (!shockEvents?.length) return null;
  return (
    <section className="shock-impact-panel" aria-label="Shock events">
      <header className="shock-section-header">
        <h2>Shock events</h2>
        <span>{shockEvents.length} event{shockEvents.length === 1 ? "" : "s"}</span>
      </header>
      <p className="shock-comparison-note">
        Comparisons use the ROAS objective: up to 7 days before, the event period, and up to 14 days after.
        Overlapping events and allocation changes can affect these observations.
      </p>
      {shockEvents.map((shock, index) => (
        <ShockReport key={shock.id ?? `${shock.start_day}-${index}`} shock={shock} results={results} viewDay={viewDay} />
      ))}
    </section>
  );
}
