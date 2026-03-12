import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildStaticSite } from "../src/lib/static-site.js";

test("buildStaticSite writes raw documents and generated views", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "llm-model-comparison-"));
  const result = await buildStaticSite({ outDir });

  assert.equal(result.modelCount >= 20, true);

  const [catalogJson, apiIndexJson, balancedJson, modelsIndexJson, byReleaseDateJson] = await Promise.all([
    readFile(join(outDir, "data/pricing.catalog.json"), "utf8"),
    readFile(join(outDir, "api/index.json"), "utf8"),
    readFile(join(outDir, "api/views/workloads/balanced.json"), "utf8"),
    readFile(join(outDir, "api/models/index.json"), "utf8"),
    readFile(join(outDir, "api/views/by-release-date.json"), "utf8")
  ]);

  const catalog = JSON.parse(catalogJson);
  const apiIndex = JSON.parse(apiIndexJson);
  const balanced = JSON.parse(balancedJson);
  const modelsIndex = JSON.parse(modelsIndexJson);
  const byReleaseDate = JSON.parse(byReleaseDateJson);

  assert.equal(catalog.object, "pricing_catalog");
  assert.equal(apiIndex.object, "api_index");
  assert.equal(apiIndex.data.api_documents.snapshot_index, "api/snapshots/index.json");
  assert.ok(apiIndex.data.api_documents.status_views.some((view) => view.id === "active"));
  assert.ok(apiIndex.data.api_documents.pricing_mode_views.some((view) => view.id === "text_tokens"));
  assert.ok(apiIndex.data.api_documents.sort_views.some((view) => view.id === "by-release-date"));
  assert.equal(apiIndex.data.summary.default_model_sort_by, "released_at");
  assert.equal(apiIndex.data.summary.default_model_sort_direction, "desc");
  assert.equal(apiIndex.data.summary.latest_verified_at, "2026-03-12");
  assert.equal(apiIndex.data.summary.latest_released_at, "2026-03-05");
  assert.equal(
    balanced.data.analysis.summary.cheapest_overall_model_id,
    "openai/gpt-5-nano"
  );
  assert.equal(modelsIndex.meta.sort_by, "released_at");
  assert.equal(modelsIndex.data[0].id, "openai/gpt-5.4");
  assert.equal(byReleaseDate.meta.sort_by, "released_at");
  assert.equal(byReleaseDate.data[0].id, "openai/gpt-5.4");

  const [snapshotIndexJson, activeStatusJson, pricingModeJson, snapshotCatalogJson] = await Promise.all([
    readFile(join(outDir, "api/snapshots/index.json"), "utf8"),
    readFile(join(outDir, "api/views/status/active.json"), "utf8"),
    readFile(join(outDir, "api/views/pricing-modes/text_tokens.json"), "utf8"),
    readFile(join(outDir, "snapshots/2026-03-12.pricing.catalog.json"), "utf8")
  ]);

  const snapshotIndex = JSON.parse(snapshotIndexJson);
  const activeStatus = JSON.parse(activeStatusJson);
  const pricingMode = JSON.parse(pricingModeJson);
  const snapshotCatalog = JSON.parse(snapshotCatalogJson);

  assert.equal(snapshotIndex.object, "snapshot_index");
  assert.equal(activeStatus.meta.filters.status, "active");
  assert.equal(activeStatus.meta.sort_by, "released_at");
  assert.equal(activeStatus.data[0].id, "openai/gpt-5.4");
  assert.equal(pricingMode.meta.pricing_mode, "text_tokens");
  assert.equal(pricingMode.meta.sort_by, "released_at");
  assert.equal(snapshotCatalog.snapshot_date, "2026-03-12");
});
