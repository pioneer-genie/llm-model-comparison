import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertCatalogShape } from "./contract.js";
import { getModelByIdInCatalog, listModelsInCatalog } from "./pricing-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "../../data/pricing.catalog.json");
const CONTRACT_PATH = join(__dirname, "../../contracts/llm-price-api.contract.json");

let catalogCache;
let contractCache;

export function loadCatalog() {
  if (!catalogCache) {
    const raw = readFileSync(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    assertCatalogShape(parsed);
    catalogCache = parsed;
  }

  return structuredClone(catalogCache);
}

export function loadContract() {
  if (!contractCache) {
    const raw = readFileSync(CONTRACT_PATH, "utf8");
    contractCache = JSON.parse(raw);
  }

  return structuredClone(contractCache);
}

export function listModels(filters = {}) {
  return listModelsInCatalog(loadCatalog(), filters);
}

export function getModelById(modelId) {
  return getModelByIdInCatalog(loadCatalog(), modelId);
}
