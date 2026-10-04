export function shockStatus(shock, viewDay) {
  if (viewDay < shock.start_day) return "scheduled";
  return viewDay <= shock.end_day ? "active" : "completed";
}

function total(rows, key) {
  const value = rows.reduce((sum, row) => sum + row[key], 0);
  return Number.isFinite(value) ? value : null;
}

function observedMeans(rows) {
  const days = new Set(rows.map((row) => row.day)).size;
  const revenue = total(rows, "revenue");
  const spend = total(rows, "budget_allocated");
  return {
    days,
    revenue: days > 0 && revenue != null ? revenue / days : null,
    spend: days > 0 && spend != null ? spend / days : null,
  };
}

function roasEdge(rows) {
  const bandit = rows.filter((row) => row.allocator === "bandit");
  const baseline = rows.filter((row) => row.allocator === "static");
  if (!bandit.length || !baseline.length) return null;
  const banditSpend = total(bandit, "budget_allocated");
  const staticSpend = total(baseline, "budget_allocated");
  const banditRevenue = total(bandit, "revenue");
  const staticRevenue = total(baseline, "revenue");
  if (!(banditSpend > 0) || !(staticSpend > 0) || banditRevenue == null || staticRevenue == null) return null;
  const staticRoas = staticRevenue / staticSpend;
  const banditRoas = banditRevenue / banditSpend;
  if (!(staticRoas > 0) || !Number.isFinite(staticRoas) || !Number.isFinite(banditRoas)) return null;
  const edge = (banditRoas - staticRoas) / staticRoas * 100;
  return Number.isFinite(edge) ? edge : null;
}

export function analyzeShock(shock, affectedIds, results, viewDay) {
  const windows = {
    before: [Math.max(1, shock.start_day - 7), shock.start_day - 1],
    during: [shock.start_day, shock.end_day],
    after: [shock.end_day + 1, shock.end_day + 14],
  };
  const visibleRows = (results ?? []).filter((row) => row.objective === "roas" && row.day <= viewDay);
  const periodRows = Object.fromEntries(Object.entries(windows).map(([period, [start, end]]) => [
    period, visibleRows.filter((row) => row.day >= start && row.day <= end),
  ]));
  const periods = Object.fromEntries(Object.entries(periodRows).map(([period, rows]) => [period, {
    edge: roasEdge(rows),
    observedDays: new Set(rows.map((row) => row.day)).size,
  }]));
  const channels = [...new Set(affectedIds)].map((channelId) => ({
    channelId,
    before: observedMeans(periodRows.before.filter((row) => row.allocator === "bandit" && row.channel_id === channelId)),
    during: observedMeans(periodRows.during.filter((row) => row.allocator === "bandit" && row.channel_id === channelId)),
  }));
  return { periods, channels };
}
