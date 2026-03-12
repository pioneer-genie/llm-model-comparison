import test from "node:test";
import assert from "node:assert/strict";

import { analyzeModels, compareModels, estimateCostForModel } from "../src/lib/analysis.js";
import { getModelById, listModels, loadCatalog } from "../src/lib/catalog.js";
import { assertCatalogShape } from "../src/lib/contract.js";

test("catalog loads official provider pricing data", () => {
  const catalog = loadCatalog();

  assert.equal(catalog.object, "pricing_catalog");
  assert.ok(catalog.models.length >= 20);
  assert.equal(catalog.catalog_name, "official-text-model-pricing-curated");
  assert.equal(new Set(catalog.models.map((model) => model.provider)).size, 3);
  assert.equal(new Set(catalog.models.map((model) => model.status)).size, 3);
  assert.equal(catalog.models.every((model) => model.pricing_mode === "text_tokens"), true);
  assert.equal(catalog.models.every((model) => typeof model.last_verified_at === "string"), true);
});

test("estimateCostForModel uses cached input pricing when available", () => {
  const model = getModelById("openai/gpt-5-mini");
  const result = estimateCostForModel(model, {
    input_tokens: 1_000_000,
    cached_input_tokens: 500_000,
    output_tokens: 250_000
  });

  assert.equal(result.cost_breakdown.input_cost_usd, 0.125);
  assert.equal(result.cost_breakdown.cached_input_cost_usd, 0.0125);
  assert.equal(result.cost_breakdown.output_cost_usd, 0.5);
  assert.equal(result.estimated_total_cost_usd, 0.6375);
});

test("compareModels sorts by estimated total cost", () => {
  const result = compareModels({
    model_ids: [
      "openai/gpt-5-mini",
      "google/gemini-2.5-flash-lite",
      "anthropic/claude-haiku-4.5"
    ],
    workload: {
      input_tokens: 1_000_000,
      output_tokens: 250_000
    }
  });

  assert.equal(result.comparisons[0].model_id, "google/gemini-2.5-flash-lite");
  assert.equal(result.comparisons.at(-1).model_id, "anthropic/claude-haiku-4.5");
});

test("analyzeModels returns budget-fit ids", () => {
  const result = analyzeModels({
    filters: {
      tag: "cost",
      status: "active"
    },
    workload: {
      input_tokens: 1_000_000,
      output_tokens: 250_000
    },
    budget_usd: 1
  });

  assert.ok(result.summary.budget_fit_model_ids.includes("openai/gpt-5-mini"));
  assert.ok(result.summary.budget_fit_model_ids.includes("openai/gpt-5-nano"));
  assert.ok(result.summary.budget_fit_model_ids.includes("google/gemini-2.5-flash-lite"));
});

test("listModels filters by provider", () => {
  const models = listModels({
    provider: "google"
  });

  assert.equal(models.every((model) => model.provider === "google"), true);
});

test("catalog includes OpenAI Codex models", () => {
  const activeCodex = getModelById("openai/gpt-5.1-codex");
  const deprecatedCodex = getModelById("openai/codex-mini-latest");

  assert.equal(activeCodex?.status, "active");
  assert.ok(activeCodex?.tags.includes("codex"));
  assert.equal(deprecatedCodex?.status, "deprecated");
});

test("listModels filters by status", () => {
  const models = listModels({
    status: "deprecated"
  });

  assert.ok(models.length > 0);
  assert.equal(models.every((model) => model.status === "deprecated"), true);
});

test("compareModels respects status filters", () => {
  const result = compareModels({
    filters: {
      tag: "cost",
      status: "active"
    },
    workload: {
      input_tokens: 1_000_000,
      output_tokens: 250_000
    }
  });

  assert.equal(result.comparisons.every((item) => item.status === "active"), true);
  assert.equal(result.comparisons[0].model_id, "openai/gpt-5-nano");
});

test("assertCatalogShape rejects duplicate model ids", () => {
  assert.throws(
    () =>
      assertCatalogShape({
        object: "pricing_catalog",
        models: [
          {
            id: "duplicate/model",
            provider: "openai",
            model: "m1",
            status: "active",
            pricing_mode: "text_tokens",
            last_verified_at: "2026-03-12",
            source_url: "https://example.com/pricing",
            pricing: {
              input_usd_per_1m_tokens: 1,
              output_usd_per_1m_tokens: 2
            }
          },
          {
            id: "duplicate/model",
            provider: "openai",
            model: "m2",
            status: "active",
            pricing_mode: "text_tokens",
            last_verified_at: "2026-03-12",
            source_url: "https://example.com/pricing",
            pricing: {
              input_usd_per_1m_tokens: 1,
              output_usd_per_1m_tokens: 2
            }
          }
        ]
      }),
    /must be unique/
  );
});

test("assertCatalogShape rejects missing verification metadata", () => {
  assert.throws(
    () =>
      assertCatalogShape({
        object: "pricing_catalog",
        models: [
          {
            id: "openai/test-model",
            provider: "openai",
            model: "test-model",
            status: "active",
            pricing_mode: "text_tokens",
            source_url: "https://example.com/pricing",
            pricing: {
              input_usd_per_1m_tokens: 1,
              output_usd_per_1m_tokens: 2
            }
          }
        ]
      }),
    /last_verified_at/
  );
});
