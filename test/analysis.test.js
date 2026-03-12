import test from "node:test";
import assert from "node:assert/strict";

import { analyzeModels, compareModels, estimateCostForModel } from "../src/lib/analysis.js";
import { getModelById, listModels, loadCatalog } from "../src/lib/catalog.js";
import { assertCatalogShape } from "../src/lib/contract.js";

test("catalog loads with starter data", () => {
  const catalog = loadCatalog();

  assert.equal(catalog.object, "pricing_catalog");
  assert.ok(catalog.models.length >= 5);
  assert.equal(catalog.models.every((model) => model.status === "active"), true);
  assert.equal(catalog.models.every((model) => model.pricing_mode === "text_tokens"), true);
  assert.equal(catalog.models.every((model) => typeof model.last_verified_at === "string"), true);
});

test("estimateCostForModel uses cached input pricing when available", () => {
  const model = getModelById("openai/gpt-4.1-mini");
  const result = estimateCostForModel(model, {
    input_tokens: 1_000_000,
    cached_input_tokens: 500_000,
    output_tokens: 250_000
  });

  assert.equal(result.cost_breakdown.input_cost_usd, 0.2);
  assert.equal(result.cost_breakdown.cached_input_cost_usd, 0.05);
  assert.equal(result.cost_breakdown.output_cost_usd, 0.4);
  assert.equal(result.estimated_total_cost_usd, 0.65);
});

test("compareModels sorts by estimated total cost", () => {
  const result = compareModels({
    model_ids: ["openai/gpt-4.1", "google/gemini-2.0-flash", "anthropic/claude-3-7-sonnet"],
    workload: {
      input_tokens: 1_000_000,
      output_tokens: 250_000
    }
  });

  assert.equal(result.comparisons[0].model_id, "google/gemini-2.0-flash");
  assert.equal(result.comparisons.at(-1).model_id, "anthropic/claude-3-7-sonnet");
});

test("analyzeModels returns budget-fit ids", () => {
  const result = analyzeModels({
    filters: {
      tag: "cost"
    },
    workload: {
      input_tokens: 1_000_000,
      output_tokens: 250_000
    },
    budget_usd: 1
  });

  assert.ok(result.summary.budget_fit_model_ids.includes("openai/gpt-4.1-mini"));
  assert.ok(result.summary.budget_fit_model_ids.includes("openai/gpt-4.1-nano"));
});

test("listModels filters by provider", () => {
  const models = listModels({
    provider: "google"
  });

  assert.equal(models.every((model) => model.provider === "google"), true);
});

test("listModels filters by status", () => {
  const models = listModels({
    status: "active"
  });

  assert.ok(models.length > 0);
  assert.equal(models.every((model) => model.status === "active"), true);
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
