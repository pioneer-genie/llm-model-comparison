const TOKEN_UNIT = 1_000_000;

export function listModelsInCatalog(catalog, filters = {}) {
  const models = filterModels(catalog.models, filters);
  return sortModels(models, filters.sort_by);
}

export function getModelByIdInCatalog(catalog, modelId) {
  if (!modelId) {
    return null;
  }

  return catalog.models.find((model) => model.id === modelId) ?? null;
}

export function filterModels(models, filters = {}) {
  const provider = normalizeOptionalString(filters.provider);
  const tag = normalizeOptionalString(filters.tag);
  const modality = normalizeOptionalString(filters.modality);
  const ids = Array.isArray(filters.model_ids) ? new Set(filters.model_ids) : null;

  return models.filter((model) => {
    if (provider && model.provider !== provider) {
      return false;
    }

    if (tag && !model.tags?.includes(tag)) {
      return false;
    }

    if (modality && !model.modalities?.includes(modality)) {
      return false;
    }

    if (ids && !ids.has(model.id)) {
      return false;
    }

    return true;
  });
}

export function sortModels(models, sortBy = "id") {
  const list = [...models];

  list.sort((left, right) => {
    switch (sortBy) {
      case "input_price":
        return compareNumbers(
          left.pricing.input_usd_per_1m_tokens,
          right.pricing.input_usd_per_1m_tokens,
          left.id,
          right.id
        );
      case "output_price":
        return compareNumbers(
          left.pricing.output_usd_per_1m_tokens,
          right.pricing.output_usd_per_1m_tokens,
          left.id,
          right.id
        );
      case "provider":
        return compareStrings(left.provider, right.provider, left.id, right.id);
      case "id":
      default:
        return left.id.localeCompare(right.id);
    }
  });

  return list;
}

export function normalizeWorkload(input = {}) {
  return {
    input_tokens: normalizeNonNegativeNumber(input.input_tokens),
    cached_input_tokens: normalizeNonNegativeNumber(input.cached_input_tokens),
    output_tokens: normalizeNonNegativeNumber(input.output_tokens)
  };
}

export function estimateCostForModel(model, workloadInput = {}) {
  const workload = normalizeWorkload(workloadInput);
  const cachedInputTokens = Math.min(workload.cached_input_tokens, workload.input_tokens);
  const uncachedInputTokens = Math.max(workload.input_tokens - cachedInputTokens, 0);
  const cachedRate =
    model.pricing.cached_input_usd_per_1m_tokens ?? model.pricing.input_usd_per_1m_tokens;

  const inputCostUsd = roundUsd(
    (uncachedInputTokens / TOKEN_UNIT) * model.pricing.input_usd_per_1m_tokens
  );
  const cachedInputCostUsd = roundUsd((cachedInputTokens / TOKEN_UNIT) * cachedRate);
  const outputCostUsd = roundUsd(
    (workload.output_tokens / TOKEN_UNIT) * model.pricing.output_usd_per_1m_tokens
  );
  const estimatedTotalCostUsd = roundUsd(inputCostUsd + cachedInputCostUsd + outputCostUsd);

  return {
    model_id: model.id,
    provider: model.provider,
    model: model.model,
    workload,
    rates: {
      input_usd_per_1m_tokens: model.pricing.input_usd_per_1m_tokens,
      cached_input_usd_per_1m_tokens: cachedRate,
      output_usd_per_1m_tokens: model.pricing.output_usd_per_1m_tokens
    },
    token_breakdown: {
      input_tokens: workload.input_tokens,
      uncached_input_tokens: uncachedInputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: workload.output_tokens
    },
    cost_breakdown: {
      input_cost_usd: inputCostUsd,
      cached_input_cost_usd: cachedInputCostUsd,
      output_cost_usd: outputCostUsd
    },
    estimated_total_cost_usd: estimatedTotalCostUsd
  };
}

export function compareModelsInCatalog(catalog, input = {}) {
  const targetModels = resolveTargetModels(catalog, input);
  const workload = normalizeWorkload(input.workload);
  const comparisons = targetModels
    .map((model) => estimateCostForModel(model, workload))
    .sort((left, right) => sortComparisons(left, right, input.sort_by));

  return {
    workload,
    comparisons
  };
}

export function analyzeModelsInCatalog(catalog, input = {}) {
  const workload = normalizeWorkload(input.workload);
  const comparison = compareModelsInCatalog(catalog, { ...input, workload });
  const comparisons = comparison.comparisons;
  const budgetUsd = normalizeOptionalNumber(input.budget_usd);
  const topK = normalizePositiveInteger(input.top_k) ?? comparisons.length;
  const ranked = comparisons.slice(0, topK);
  const cheapestOverall = comparisons[0] ?? null;
  const cheapestInput = findExtreme(comparisons, "input_usd_per_1m_tokens");
  const cheapestOutput = findExtreme(comparisons, "output_usd_per_1m_tokens");
  const withinBudget = budgetUsd === undefined
    ? []
    : comparisons.filter((item) => item.estimated_total_cost_usd <= budgetUsd);

  return {
    workload,
    budget_usd: budgetUsd,
    summary: {
      model_count: comparisons.length,
      cheapest_overall_model_id: cheapestOverall?.model_id ?? null,
      cheapest_overall_cost_usd: cheapestOverall?.estimated_total_cost_usd ?? null,
      cheapest_input_model_id: cheapestInput?.model_id ?? null,
      cheapest_input_rate_usd_per_1m_tokens: cheapestInput?.rates.input_usd_per_1m_tokens ?? null,
      cheapest_output_model_id: cheapestOutput?.model_id ?? null,
      cheapest_output_rate_usd_per_1m_tokens: cheapestOutput?.rates.output_usd_per_1m_tokens ?? null,
      budget_fit_model_ids: withinBudget.map((item) => item.model_id)
    },
    comparisons: ranked
  };
}

function resolveTargetModels(catalog, input) {
  if (Array.isArray(input.model_ids) && input.model_ids.length > 0) {
    const models = input.model_ids
      .map((modelId) => getModelByIdInCatalog(catalog, modelId))
      .filter(Boolean);

    if (models.length === 0) {
      throw new Error("No models matched model_ids.");
    }

    return models;
  }

  const models = listModelsInCatalog(catalog, {
    provider: input.filters?.provider,
    tag: input.filters?.tag,
    modality: input.filters?.modality,
    sort_by: "id"
  });

  if (models.length === 0) {
    throw new Error("No models matched the provided filters.");
  }

  return models;
}

function sortComparisons(left, right, sortBy = "estimated_total_cost_usd") {
  switch (sortBy) {
    case "input_price":
      return compareMetric(
        left.rates.input_usd_per_1m_tokens,
        right.rates.input_usd_per_1m_tokens,
        left.model_id,
        right.model_id
      );
    case "output_price":
      return compareMetric(
        left.rates.output_usd_per_1m_tokens,
        right.rates.output_usd_per_1m_tokens,
        left.model_id,
        right.model_id
      );
    case "model_id":
      return left.model_id.localeCompare(right.model_id);
    case "estimated_total_cost_usd":
    default:
      return compareMetric(
        left.estimated_total_cost_usd,
        right.estimated_total_cost_usd,
        left.model_id,
        right.model_id
      );
  }
}

function findExtreme(comparisons, metric) {
  return comparisons
    .slice()
    .sort((left, right) =>
      compareMetric(left.rates[metric], right.rates[metric], left.model_id, right.model_id)
    )[0] ?? null;
}

function compareMetric(left, right, leftId, rightId) {
  if (left !== right) {
    return left - right;
  }

  return leftId.localeCompare(rightId);
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compareNumbers(left, right, leftId, rightId) {
  if (left !== right) {
    return left - right;
  }

  return leftId.localeCompare(rightId);
}

function compareStrings(left, right, leftId, rightId) {
  const value = left.localeCompare(right);
  if (value !== 0) {
    return value;
  }

  return leftId.localeCompare(rightId);
}

function normalizeNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Workload values must be non-negative numbers.");
  }

  return parsed;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("budget_usd must be a non-negative number.");
  }

  return parsed;
}

function normalizePositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("top_k must be a positive integer.");
  }

  return parsed;
}

function roundUsd(value) {
  return Number(value.toFixed(6));
}
