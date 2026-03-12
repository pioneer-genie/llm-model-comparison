import {
  analyzeModelsInCatalog,
  listModelsInCatalog
} from "./assets/pricing-engine.js";

const elements = {
  endpointGrid: document.querySelector("#endpointGrid"),
  providerFilter: document.querySelector("#providerFilter"),
  sortBy: document.querySelector("#sortBy"),
  inputTokens: document.querySelector("#inputTokens"),
  cachedInputTokens: document.querySelector("#cachedInputTokens"),
  outputTokens: document.querySelector("#outputTokens"),
  budgetUsd: document.querySelector("#budgetUsd"),
  modelSelect: document.querySelector("#modelSelect"),
  compareForm: document.querySelector("#compareForm"),
  balancedPreset: document.querySelector("#balancedPreset"),
  clearSelection: document.querySelector("#clearSelection"),
  presetList: document.querySelector("#presetList"),
  summaryList: document.querySelector("#summaryList"),
  resultsBody: document.querySelector("#resultsBody")
};

const state = {
  catalog: null,
  apiIndex: null
};

await initialize();

async function initialize() {
  const [catalog, apiIndex] = await Promise.all([
    fetchJson("data/pricing.catalog.json"),
    fetchJson("api/index.json")
  ]);

  state.catalog = catalog;
  state.apiIndex = apiIndex;

  populateProviderFilter(catalog);
  applyQueryParams();
  bindEvents();
  renderStaticEndpoints(apiIndex);
  renderPresetCards(apiIndex);
  renderModelOptions();
  renderComparison();
}

function bindEvents() {
  elements.providerFilter.addEventListener("change", () => {
    renderModelOptions();
    renderComparison();
  });
  elements.compareForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderComparison();
  });
  elements.sortBy.addEventListener("change", renderComparison);
  elements.inputTokens.addEventListener("input", renderComparison);
  elements.cachedInputTokens.addEventListener("input", renderComparison);
  elements.outputTokens.addEventListener("input", renderComparison);
  elements.budgetUsd.addEventListener("input", renderComparison);
  elements.modelSelect.addEventListener("change", renderComparison);
  elements.clearSelection.addEventListener("click", () => {
    clearModelSelection();
    renderComparison();
  });
  elements.balancedPreset.addEventListener("click", () => {
    elements.inputTokens.value = "1000000";
    elements.cachedInputTokens.value = "0";
    elements.outputTokens.value = "250000";
    renderComparison();
  });
}

function populateProviderFilter(catalog) {
  const providers = [...new Set(catalog.models.map((model) => model.provider))].sort();
  elements.providerFilter.innerHTML = [
    `<option value="">All providers</option>`,
    ...providers.map((provider) => `<option value="${provider}">${provider}</option>`)
  ].join("");
}

function renderModelOptions() {
  const selectedValues = new Set([
    ...getInitialModelIds(),
    ...[...elements.modelSelect.selectedOptions].map((option) => option.value)
  ]);
  const models = listModelsInCatalog(state.catalog, {
    provider: elements.providerFilter.value || undefined,
    status: "active",
    sort_by: "released_at"
  });

  elements.modelSelect.innerHTML = models
    .map((model) => {
      const selected = selectedValues.has(model.id) ? " selected" : "";
      return `<option value="${model.id}"${selected}>${model.id}</option>`;
    })
    .join("");

  delete elements.modelSelect.dataset.initialModels;
}

function renderStaticEndpoints(apiIndex) {
  const byReleaseDate = findSortView(apiIndex, "by-release-date");
  const byInputPrice = findSortView(apiIndex, "by-input-price");
  const byOutputPrice = findSortView(apiIndex, "by-output-price");
  const sections = [
    {
      title: "raw catalog",
      path: apiIndex.data.raw_documents.catalog,
      description: "original pricing document"
    },
    {
      title: "raw contract",
      path: apiIndex.data.raw_documents.contract,
      description: "machine-readable contract"
    },
    {
      title: "sorted by release date",
      path: byReleaseDate?.path ?? "api/views/by-release-date.json",
      description: "default model list order"
    },
    {
      title: "sorted by input price",
      path: byInputPrice?.path ?? "api/views/by-input-price.json",
      description: "precomputed list"
    },
    {
      title: "sorted by output price",
      path: byOutputPrice?.path ?? "api/views/by-output-price.json",
      description: "precomputed list"
    }
  ];

  elements.endpointGrid.innerHTML = sections.map(renderEndpointCard).join("");
}

function renderPresetCards(apiIndex) {
  elements.presetList.innerHTML = apiIndex.data.api_documents.workload_presets
    .map((preset) => {
      const details = findPresetDetails(preset.id);
      return `
        <li>
          <a href="${escapeAttribute(preset.path)}">${escapeHtml(details.label)}</a>
          <span> - ${escapeHtml(details.description)}</span>
        </li>
      `;
    })
    .join("");
}

function renderComparison() {
  const filters = {
    provider: elements.providerFilter.value || undefined,
    status: "active"
  };
  const selectedModels = getSelectedModels();
  const input = {
    model_ids: selectedModels.length > 0 ? selectedModels : undefined,
    filters,
    workload: {
      input_tokens: numberOrZero(elements.inputTokens.value),
      cached_input_tokens: numberOrZero(elements.cachedInputTokens.value),
      output_tokens: numberOrZero(elements.outputTokens.value)
    },
    budget_usd: optionalNumber(elements.budgetUsd.value),
    sort_by: elements.sortBy.value
  };

  const analysis = analyzeModelsInCatalog(state.catalog, input);
  renderSummary(analysis, selectedModels.length);
  renderResults(analysis.comparisons);
  syncQueryParams(selectedModels);
}

function renderSummary(analysis, explicitSelectionCount) {
  const summaryRows = [
    ["models_considered", String(analysis.summary.model_count)],
    ["explicit_models_selected", explicitSelectionCount > 0 ? String(explicitSelectionCount) : "0"],
    ["cheapest_overall", analysis.summary.cheapest_overall_model_id ?? "-"],
    ["cheapest_total_usd", formatUsd(analysis.summary.cheapest_overall_cost_usd)],
    ["budget_fit_models", analysis.summary.budget_fit_model_ids.join(", ") || "-"]
  ];

  elements.summaryList.innerHTML = summaryRows
    .map(
      ([key, value]) =>
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`
    )
    .join("");
}

function renderResults(comparisons) {
  elements.resultsBody.innerHTML = comparisons
    .map((item) => `
      <tr>
        <td><code>${escapeHtml(item.model_id)}</code></td>
        <td>${escapeHtml(item.released_at ?? "-")}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${formatUsd(item.estimated_total_cost_usd)}</td>
        <td>${formatUsd(item.rates.input_usd_per_1m_tokens)}</td>
        <td>${formatUsd(item.rates.output_usd_per_1m_tokens)}</td>
        <td>${formatUsd(item.rates.cached_input_usd_per_1m_tokens)}</td>
        <td>${formatUsd(item.cost_breakdown.input_cost_usd + item.cost_breakdown.cached_input_cost_usd)}</td>
        <td>${formatUsd(item.cost_breakdown.output_cost_usd)}</td>
      </tr>
    `)
    .join("");
}

function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  elements.providerFilter.value = params.get("provider") ?? "";
  elements.sortBy.value = params.get("sort_by") ?? "estimated_total_cost_usd";
  elements.inputTokens.value = params.get("input_tokens") ?? "1000000";
  elements.cachedInputTokens.value = params.get("cached_input_tokens") ?? "0";
  elements.outputTokens.value = params.get("output_tokens") ?? "250000";
  elements.budgetUsd.value = params.get("budget_usd") ?? "";
  elements.modelSelect.dataset.initialModels = params.get("models") ?? "";
}

function syncQueryParams(selectedModels) {
  const params = new URLSearchParams();

  if (elements.providerFilter.value) {
    params.set("provider", elements.providerFilter.value);
  }

  if (selectedModels.length > 0) {
    params.set("models", selectedModels.join(","));
  }

  params.set("sort_by", elements.sortBy.value);
  params.set("input_tokens", elements.inputTokens.value);
  params.set("cached_input_tokens", elements.cachedInputTokens.value);
  params.set("output_tokens", elements.outputTokens.value);

  if (elements.budgetUsd.value) {
    params.set("budget_usd", elements.budgetUsd.value);
  }

  const query = params.toString();
  const nextUrl = query ? `?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function getSelectedModels() {
  return [...elements.modelSelect.selectedOptions].map((option) => option.value);
}

function clearModelSelection() {
  for (const option of elements.modelSelect.options) {
    option.selected = false;
  }
}

function getInitialModelIds() {
  const initialModels = elements.modelSelect.dataset.initialModels;
  return initialModels ? initialModels.split(",").filter(Boolean) : [];
}

function renderEndpointCard(item) {
  return `
    <li>
      <a href="${escapeAttribute(item.path)}">${escapeHtml(item.title)}</a>
      <span> - ${escapeHtml(item.description)}</span>
    </li>
  `;
}

function findSortView(apiIndex, viewId) {
  return apiIndex.data.api_documents.sort_views.find((view) => view.id === viewId) ?? null;
}

function findPresetDetails(presetId) {
  return {
    balanced: {
      label: "Balanced",
      description: "1M input and 250K output tokens."
    },
    "cache-heavy": {
      label: "Cache heavy",
      description: "1M input with 500K cached input and 250K output tokens."
    },
    "output-heavy": {
      label: "Output heavy",
      description: "500K input and 1M output tokens."
    }
  }[presetId];
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json();
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalNumber(value) {
  if (value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toFixed(4);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
