import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog, loadContract } from "./catalog.js";
import { CONTRACT_VERSION } from "./contract.js";
import { analyzeModelsInCatalog, listModelsInCatalog } from "./pricing-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const PUBLIC_DIR = join(REPO_ROOT, "public");
const DATA_DIR = join(REPO_ROOT, "data");
const CONTRACTS_DIR = join(REPO_ROOT, "contracts");
const DIST_DIR = join(REPO_ROOT, "dist");

export const WORKLOAD_PRESETS = [
  {
    id: "balanced",
    label: "Balanced",
    description: "1M input and 250K output tokens for a general chat workload.",
    workload: {
      input_tokens: 1_000_000,
      output_tokens: 250_000
    }
  },
  {
    id: "cache-heavy",
    label: "Cache heavy",
    description: "1M input with 500K cached input and 250K output tokens.",
    workload: {
      input_tokens: 1_000_000,
      cached_input_tokens: 500_000,
      output_tokens: 250_000
    }
  },
  {
    id: "output-heavy",
    label: "Output heavy",
    description: "500K input and 1M output tokens for generation-heavy use cases.",
    workload: {
      input_tokens: 500_000,
      output_tokens: 1_000_000
    }
  }
];

export async function buildStaticSite(options = {}) {
  const outDir = options.outDir ?? DIST_DIR;
  const catalog = loadCatalog();
  const contract = loadContract();
  const providers = uniqueSorted(catalog.models.map((model) => model.provider));
  const tags = uniqueSorted(catalog.models.flatMap((model) => model.tags ?? []));
  const modalities = uniqueSorted(catalog.models.flatMap((model) => model.modalities ?? []));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "assets"), { recursive: true });

  await cp(PUBLIC_DIR, outDir, { recursive: true });
  await cp(DATA_DIR, join(outDir, "data"), { recursive: true });
  await cp(CONTRACTS_DIR, join(outDir, "contracts"), { recursive: true });
  await cp(join(__dirname, "pricing-engine.js"), join(outDir, "assets/pricing-engine.js"));
  await writeFile(join(outDir, ".nojekyll"), "");

  await writeJson(outDir, "api/contract.json", contract);
  await writeJson(outDir, "api/catalog.json", catalog);
  await writeJson(outDir, "api/models/index.json", {
    contract_version: CONTRACT_VERSION,
    object: "list",
    data: listModelsInCatalog(catalog, { sort_by: "id" }),
    meta: {
      count: catalog.models.length
    }
  });

  for (const model of catalog.models) {
    await writeJson(outDir, `api/models/${model.provider}/${model.model}.json`, {
      contract_version: CONTRACT_VERSION,
      object: "model",
      data: model
    });
  }

  await writeJson(outDir, "api/views/by-input-price.json", createModelView(catalog, {
    title: "Models sorted by input token price",
    filters: {},
    sort_by: "input_price"
  }));
  await writeJson(outDir, "api/views/by-output-price.json", createModelView(catalog, {
    title: "Models sorted by output token price",
    filters: {},
    sort_by: "output_price"
  }));

  for (const provider of providers) {
    await writeJson(outDir, `api/views/providers/${provider}.json`, createModelView(catalog, {
      title: `Models for provider ${provider}`,
      filters: { provider },
      sort_by: "input_price"
    }));
  }

  for (const tag of tags) {
    await writeJson(outDir, `api/views/tags/${tag}.json`, createModelView(catalog, {
      title: `Models tagged ${tag}`,
      filters: { tag },
      sort_by: "input_price"
    }));
  }

  for (const modality of modalities) {
    await writeJson(outDir, `api/views/modalities/${modality}.json`, createModelView(catalog, {
      title: `Models supporting modality ${modality}`,
      filters: { modality },
      sort_by: "input_price"
    }));
  }

  for (const preset of WORKLOAD_PRESETS) {
    await writeJson(outDir, `api/views/workloads/${preset.id}.json`, {
      contract_version: CONTRACT_VERSION,
      object: "static_workload_view",
      data: {
        preset,
        analysis: analyzeModelsInCatalog(catalog, {
          workload: preset.workload,
          top_k: catalog.models.length
        })
      }
    });
  }

  await writeJson(outDir, "api/index.json", {
    contract_version: CONTRACT_VERSION,
    object: "api_index",
    generated_at: new Date().toISOString(),
    data: {
      raw_documents: {
        catalog: "data/pricing.catalog.json",
        contract: "contracts/llm-price-api.contract.json"
      },
      api_documents: {
        catalog: "api/catalog.json",
        contract: "api/contract.json",
        model_index: "api/models/index.json",
        sort_views: [
          {
            id: "by-input-price",
            path: "api/views/by-input-price.json"
          },
          {
            id: "by-output-price",
            path: "api/views/by-output-price.json"
          }
        ],
        provider_views: providers.map((provider) => ({
          id: provider,
          path: `api/views/providers/${provider}.json`
        })),
        tag_views: tags.map((tag) => ({
          id: tag,
          path: `api/views/tags/${tag}.json`
        })),
        modality_views: modalities.map((modality) => ({
          id: modality,
          path: `api/views/modalities/${modality}.json`
        })),
        workload_presets: WORKLOAD_PRESETS.map((preset) => ({
          id: preset.id,
          label: preset.label,
          path: `api/views/workloads/${preset.id}.json`
        }))
      },
      summary: {
        model_count: catalog.models.length,
        provider_count: providers.length,
        providers,
        tags,
        modalities
      }
    }
  });

  return {
    outDir,
    modelCount: catalog.models.length,
    providerCount: providers.length
  };
}

function createModelView(catalog, config) {
  const models = listModelsInCatalog(catalog, {
    ...config.filters,
    sort_by: config.sort_by
  });

  return {
    contract_version: CONTRACT_VERSION,
    object: "list",
    data: models,
    meta: {
      title: config.title,
      count: models.length,
      filters: config.filters,
      sort_by: config.sort_by
    }
  };
}

async function writeJson(outDir, relativePath, value) {
  const fullPath = join(outDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
