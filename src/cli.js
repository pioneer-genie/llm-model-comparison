#!/usr/bin/env node

import { analyzeModels, compareModels } from "./lib/analysis.js";
import { loadCatalog, loadContract, getModelById, listModels } from "./lib/catalog.js";
import { buildEnvelope, buildErrorEnvelope } from "./lib/contract.js";
import { formatAnalysisTable, formatComparisonTable, formatJson, formatModelTable } from "./lib/format.js";
import { startServer } from "./server.js";

async function main(argv) {
  const [command = "help", ...rest] = argv;
  const parsed = parseArgs(rest);

  try {
    switch (command) {
      case "list":
        return printList(parsed);
      case "show":
        return printShow(parsed, rest[0]);
      case "compare":
        return printCompare(parsed);
      case "analyze":
        return printAnalyze(parsed);
      case "catalog":
        return printOutput(parsed, buildEnvelope("pricing_catalog", loadCatalog()));
      case "contract":
        return printOutput(parsed, buildEnvelope("contract", loadContract()));
      case "serve":
        return startServer({
          port: Number(parsed.port ?? 3030),
          host: parsed.host ?? "127.0.0.1"
        });
      case "help":
      default:
        return printHelp();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printOutput(parsed, buildErrorEnvelope("cli_error", message, 1));
    process.exitCode = 1;
  }
}

function printList(parsed) {
  const models = listModels({
    provider: parsed.provider,
    status: parsed.status,
    tag: parsed.tag,
    modality: parsed.modality,
    sort_by: parsed.sortBy ?? "id"
  });

  const response = buildEnvelope("list", models, {
    count: models.length,
    filters: collectFilters(parsed)
  });

  printOutput(parsed, response, () => formatModelTable(models));
}

function printShow(parsed, maybeModelId) {
  const modelId = maybeModelId && !maybeModelId.startsWith("--") ? maybeModelId : parsed.id;
  if (!modelId) {
    throw new Error("show requires a model id.");
  }

  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelId}`);
  }

  printOutput(parsed, buildEnvelope("model", model));
}

function printCompare(parsed) {
  const input = {
    model_ids: splitCsv(parsed.models),
    filters: collectFilters(parsed),
    workload: {
      input_tokens: parsed.inputTokens,
      cached_input_tokens: parsed.cachedInputTokens,
      output_tokens: parsed.outputTokens
    },
    sort_by: parsed.sortBy ?? "estimated_total_cost_usd"
  };

  const comparison = compareModels(input);
  printOutput(parsed, buildEnvelope("price_comparison", comparison), () =>
    formatComparisonTable(comparison.comparisons)
  );
}

function printAnalyze(parsed) {
  const input = {
    filters: collectFilters(parsed),
    workload: {
      input_tokens: parsed.inputTokens,
      cached_input_tokens: parsed.cachedInputTokens,
      output_tokens: parsed.outputTokens
    },
    budget_usd: parsed.budgetUsd,
    top_k: parsed.topK,
    sort_by: parsed.sortBy ?? "estimated_total_cost_usd"
  };

  const analysis = analyzeModels(input);
  printOutput(parsed, buildEnvelope("price_analysis", analysis), () => formatAnalysisTable(analysis));
}

function printOutput(parsed, payload, renderTable) {
  const format = parsed.format ?? "json";
  if (format === "table" && renderTable) {
    process.stdout.write(`${renderTable()}\n`);
    return;
  }

  process.stdout.write(`${formatJson(payload)}\n`);
}

function printHelp() {
  const lines = [
    "llm-pricing <command> [options]",
    "",
    "Commands:",
    "  list [--provider openai] [--status active] [--tag cost] [--format json|table]",
    "  show <model_id>",
    "  compare --models id1,id2 --input-tokens 1000000 --output-tokens 250000",
    "  analyze --input-tokens 1000000 --output-tokens 250000 [--budget-usd 2]",
    "  catalog",
    "  contract",
    "  serve [--port 3030] [--host 127.0.0.1]"
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const nextValue = inlineValue ?? argv[index + 1];
    const consumesNext = inlineValue === undefined && argv[index + 1] && !argv[index + 1].startsWith("--");
    const value = inlineValue ?? (consumesNext ? nextValue : "true");

    if (consumesNext) {
      index += 1;
    }

    parsed[toCamelCase(rawKey)] = value;
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function splitCsv(value) {
  if (!value) {
    return undefined;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectFilters(parsed) {
  return {
    provider: parsed.provider,
    status: parsed.status,
    tag: parsed.tag,
    modality: parsed.modality
  };
}

main(process.argv.slice(2));
