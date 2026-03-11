import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildStaticSite } from "../src/lib/static-site.js";

test("buildStaticSite writes raw documents and generated views", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "llm-model-comparison-"));
  const result = await buildStaticSite({ outDir });

  assert.equal(result.modelCount >= 7, true);

  const [catalogJson, apiIndexJson, balancedJson] = await Promise.all([
    readFile(join(outDir, "data/pricing.catalog.json"), "utf8"),
    readFile(join(outDir, "api/index.json"), "utf8"),
    readFile(join(outDir, "api/views/workloads/balanced.json"), "utf8")
  ]);

  const catalog = JSON.parse(catalogJson);
  const apiIndex = JSON.parse(apiIndexJson);
  const balanced = JSON.parse(balancedJson);

  assert.equal(catalog.object, "pricing_catalog");
  assert.equal(apiIndex.object, "api_index");
  assert.equal(
    balanced.data.analysis.summary.cheapest_overall_model_id,
    "google/gemini-2.0-flash"
  );
});
