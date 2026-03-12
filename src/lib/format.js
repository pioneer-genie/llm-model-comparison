export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

export function formatModelTable(models) {
  const rows = models.map((model) => [
    model.id,
    model.released_at,
    model.provider,
    model.status,
    toPrice(model.pricing.input_usd_per_1m_tokens),
    toPrice(model.pricing.output_usd_per_1m_tokens),
    toPrice(model.pricing.cached_input_usd_per_1m_tokens ?? model.pricing.input_usd_per_1m_tokens)
  ]);

  return renderTable(
    ["model_id", "released_at", "provider", "status", "input", "output", "cached_input"],
    rows
  );
}

export function formatComparisonTable(comparisons) {
  const rows = comparisons.map((item) => [
    item.model_id,
    item.released_at ?? "-",
    item.status,
    toPrice(item.estimated_total_cost_usd),
    toPrice(item.rates.input_usd_per_1m_tokens),
    toPrice(item.rates.output_usd_per_1m_tokens),
    toPrice(item.cost_breakdown.input_cost_usd),
    toPrice(item.cost_breakdown.output_cost_usd)
  ]);

  return renderTable(
    ["model_id", "released_at", "status", "total_usd", "input_rate", "output_rate", "input_cost", "output_cost"],
    rows
  );
}

export function formatAnalysisTable(analysis) {
  const summary = [
    `cheapest_overall_model_id: ${analysis.summary.cheapest_overall_model_id ?? "-"}`,
    `cheapest_overall_cost_usd: ${analysis.summary.cheapest_overall_cost_usd ?? "-"}`,
    `cheapest_input_model_id: ${analysis.summary.cheapest_input_model_id ?? "-"}`,
    `cheapest_output_model_id: ${analysis.summary.cheapest_output_model_id ?? "-"}`,
    `budget_fit_model_ids: ${analysis.summary.budget_fit_model_ids.join(", ") || "-"}`
  ].join("\n");

  return `${summary}\n\n${formatComparisonTable(analysis.comparisons)}`;
}

function renderTable(headers, rows) {
  const widths = headers.map((header, columnIndex) => {
    const rowWidth = rows.reduce((max, row) => Math.max(max, String(row[columnIndex]).length), 0);
    return Math.max(header.length, rowWidth);
  });

  const headerLine = headers.map((header, index) => pad(header, widths[index])).join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => row.map((cell, index) => pad(String(cell), widths[index])).join("  "));

  return [headerLine, divider, ...body].join("\n");
}

function pad(value, width) {
  return value.padEnd(width, " ");
}

function toPrice(value) {
  return Number(value).toFixed(4);
}
