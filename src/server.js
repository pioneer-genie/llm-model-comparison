import http from "node:http";

import { analyzeModels, compareModels } from "./lib/analysis.js";
import { loadCatalog, loadContract, getModelById, listModels } from "./lib/catalog.js";
import { buildEnvelope, buildErrorEnvelope } from "./lib/contract.js";

export function createRequestHandler() {
  return async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, buildEnvelope("health", { status: "ok" }));
      }

      if (request.method === "GET" && url.pathname === "/v1/catalog") {
        return sendJson(response, 200, buildEnvelope("pricing_catalog", loadCatalog()));
      }

      if (request.method === "GET" && url.pathname === "/v1/contract") {
        return sendJson(response, 200, buildEnvelope("contract", loadContract()));
      }

      if (request.method === "GET" && url.pathname === "/v1/models") {
        const modelId = url.searchParams.get("id");
        if (modelId) {
          const model = getModelById(modelId);
          if (!model) {
            return sendJson(response, 404, buildErrorEnvelope("not_found", `Model not found: ${modelId}`, 404));
          }

          return sendJson(response, 200, buildEnvelope("model", model));
        }

        const models = listModels({
          provider: url.searchParams.get("provider") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
          tag: url.searchParams.get("tag") ?? undefined,
          modality: url.searchParams.get("modality") ?? undefined,
          sort_by: url.searchParams.get("sort_by") ?? "released_at"
        });

        return sendJson(response, 200, buildEnvelope("list", models, { count: models.length }));
      }

      if (request.method === "POST" && url.pathname === "/v1/compare") {
        const input = await readJson(request);
        const comparison = compareModels(input);
        return sendJson(response, 200, buildEnvelope("price_comparison", comparison));
      }

      if (request.method === "POST" && url.pathname === "/v1/analyze") {
        const input = await readJson(request);
        const analysis = analyzeModels(input);
        return sendJson(response, 200, buildEnvelope("price_analysis", analysis));
      }

      return sendJson(response, 404, buildErrorEnvelope("not_found", "Route not found.", 404));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendJson(response, 400, buildErrorEnvelope("bad_request", message, 400));
    }
  };
}

export function startServer(options = {}) {
  const port = Number(options.port ?? 3030);
  const host = options.host ?? "127.0.0.1";
  const server = http.createServer(createRequestHandler());

  server.listen(port, host, () => {
    process.stdout.write(`llm-pricing server listening on http://${host}:${port}\n`);
  });

  return server;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer({
    port: Number(process.env.PORT ?? 3030),
    host: process.env.HOST ?? "127.0.0.1"
  });
}
