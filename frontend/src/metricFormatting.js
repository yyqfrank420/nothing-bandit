export function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return { text: "No data", tone: "neutral" };
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return { text: "0.0%", tone: "neutral" };
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`,
    tone: rounded > 0 ? "positive" : "negative",
  };
}
