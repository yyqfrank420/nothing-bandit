import test from "node:test";
import assert from "node:assert/strict";
import { analyzeShock, formatPercent, shockStatus } from "./shockAnalysis.js";

const shock = { start_day: 8, end_day: 10, triggered_on_day: 7 };
const row = (day, allocator = "bandit", revenue = 200, spend = 100, channelId = 1, objective = "roas") => ({
  day, allocator, revenue, budget_allocated: spend, channel_id: channelId, objective,
});
const pair = (day, banditRevenue = 200, staticRevenue = 100) => [row(day, "bandit", banditRevenue), row(day, "static", staticRevenue)];

test("inclusive authoritative bounds determine status, including the last active day", () => {
  assert.equal(shockStatus(shock, 7), "scheduled");
  assert.equal(shockStatus(shock, 8), "active");
  assert.equal(shockStatus(shock, 10), "active");
  assert.equal(shockStatus(shock, 11), "completed");
});

test("day-one shocks have no before baseline", () => {
  const analysis = analyzeShock({ start_day: 1, end_day: 2 }, [1], [...pair(1), ...pair(2)], 2);
  assert.deepEqual(analysis.periods.before, { edge: null, observedDays: 0 });
  assert.deepEqual(analysis.channels[0].before, { days: 0, revenue: null, spend: null });
  assert.equal(analysis.periods.during.edge, 100);
});

test("scheduled replay excludes future before, during and after rows", () => {
  const results = [...pair(1), ...pair(7, 10000), ...pair(8, 20000), ...pair(11, 30000)];
  const analysis = analyzeShock(shock, [1], results, 1);
  assert.equal(analysis.channels[0].before.revenue, 200);
  assert.equal(analysis.channels[0].before.days, 1);
  assert.equal(analysis.periods.before.edge, 100);
  assert.deepEqual(analysis.periods.during, { edge: null, observedDays: 0 });
  assert.deepEqual(analysis.periods.after, { edge: null, observedDays: 0 });
});

test("partial replay clamps event observations and averages distinct observed days", () => {
  const results = [...pair(8), ...pair(10, 400), ...pair(11, 10000), row(8, "bandit", 100, 50, 2), row(8, "bandit", 99999, 100, 1, "ctr")];
  const partial = analyzeShock(shock, [1, 1, 2], results, 8);
  assert.equal(partial.channels.length, 2);
  assert.deepEqual(partial.channels[0].during, { days: 1, revenue: 200, spend: 100 });
  assert.equal(partial.periods.during.observedDays, 1);
  assert.equal(partial.periods.after.edge, null);
  const completed = analyzeShock(shock, [1], results, 10);
  assert.deepEqual(completed.channels[0].during, { days: 2, revenue: 300, spend: 100 });
  assert.equal(completed.periods.after.edge, null);
});

test("before and after comparisons stay within seven and fourteen days", () => {
  const event = { start_day: 10, end_day: 12 };
  const analysis = analyzeShock(event, [1], [...pair(2, 9000), ...pair(3, 200), ...pair(9, 400), ...pair(12, 200), ...pair(13, 300), ...pair(26, 500), ...pair(27, 9000)], 100);
  assert.equal(analysis.channels[0].before.revenue, 300);
  assert.equal(analysis.periods.before.observedDays, 2);
  assert.equal(analysis.periods.during.observedDays, 1);
  assert.equal(analysis.periods.after.observedDays, 2);
  assert.equal(analysis.periods.after.edge, 300);
});

test("ROAS edge rejects absent, nonpositive and nonfinite denominators", () => {
  for (const results of [
    [row(8)],
    [row(8, "bandit", 200, 0), row(8, "static")],
    [row(8, "bandit", 200, -1), row(8, "static")],
    [row(8), row(8, "static", 100, 0)],
    [row(8), row(8, "static", 0)],
    [row(8), row(8, "static", -100)],
    [row(8, "bandit", Infinity), row(8, "static")],
    [row(8), row(8, "static", 100, NaN)],
    [row(8, "bandit", Number.MAX_VALUE, Number.MIN_VALUE), row(8, "static")],
  ]) assert.equal(analyzeShock(shock, [1], results, 8).periods.during.edge, null);
});

test("zero observed revenue and spend remain factual means without a numeric edge", () => {
  const analysis = analyzeShock(shock, [1], [row(8, "bandit", 0, 0), row(8, "static", 0, 0)], 8);
  assert.deepEqual(analysis.channels[0].during, { days: 1, revenue: 0, spend: 0 });
  assert.equal(analysis.periods.during.edge, null);
});

test("percentage sign and tone follow one-decimal rounding", () => {
  assert.deepEqual(formatPercent(12.34), { text: "+12.3%", tone: "positive" });
  assert.deepEqual(formatPercent(-12.34), { text: "-12.3%", tone: "negative" });
  assert.deepEqual(formatPercent(-0.04), { text: "0.0%", tone: "neutral" });
  assert.deepEqual(formatPercent(0.04), { text: "0.0%", tone: "neutral" });
  for (const value of [null, undefined, NaN, Infinity]) assert.deepEqual(formatPercent(value), { text: "No data", tone: "neutral" });
});

test("positive and negative observed edges reflect the data", () => {
  assert.equal(analyzeShock(shock, [], pair(8, 150, 100), 8).periods.during.edge, 50);
  assert.equal(analyzeShock(shock, [], pair(8, 50, 100), 8).periods.during.edge, -50);
});

test("overlapping events report shared observations without attributing recovery", () => {
  const results = [...pair(8, 50), ...pair(9, 150), ...pair(10, 250)];
  const first = analyzeShock(shock, [1], results, 10);
  const second = analyzeShock({ start_day: 9, end_day: 11 }, [1], results, 10);
  assert.equal(first.channels[0].during.revenue, 150);
  assert.equal(second.channels[0].during.revenue, 200);
  assert.deepEqual(Object.keys(first).sort(), ["channels", "periods"]);
  assert.deepEqual(Object.keys(second).sort(), ["channels", "periods"]);
});
