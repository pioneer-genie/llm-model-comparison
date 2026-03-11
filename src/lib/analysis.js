import { loadCatalog } from "./catalog.js";
import {
  analyzeModelsInCatalog,
  compareModelsInCatalog,
  estimateCostForModel,
  normalizeWorkload
} from "./pricing-engine.js";

export { estimateCostForModel, normalizeWorkload };

export function compareModels(input = {}) {
  return compareModelsInCatalog(loadCatalog(), input);
}

export function analyzeModels(input = {}) {
  return analyzeModelsInCatalog(loadCatalog(), input);
}
