import test from "node:test";
import assert from "node:assert/strict";

import { createRequestHandler } from "../src/server.js";

test("GET /v1/models returns filtered list envelope", async () => {
  const response = await invokeRoute({
    method: "GET",
    url: "/v1/models?provider=openai&status=active"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.object, "list");
  assert.ok(response.body.meta.count >= 5);
  assert.equal(response.body.data.every((model) => model.provider === "openai"), true);
  assert.equal(response.body.data.every((model) => model.status === "active"), true);
});

test("GET /v1/models?id=... returns one model", async () => {
  const response = await invokeRoute({
    method: "GET",
    url: "/v1/models?id=openai/gpt-5-mini"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.object, "model");
  assert.equal(response.body.data.id, "openai/gpt-5-mini");
});

test("POST /v1/compare returns ranked price comparison", async () => {
  const response = await invokeRoute({
    method: "POST",
    url: "/v1/compare",
    body: {
      model_ids: ["openai/gpt-5-mini", "google/gemini-2.5-flash-lite"],
      workload: {
        input_tokens: 1_000_000,
        output_tokens: 250_000
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.object, "price_comparison");
  assert.equal(response.body.data.comparisons[0].model_id, "google/gemini-2.5-flash-lite");
});

test("unknown route returns 404 envelope", async () => {
  const response = await invokeRoute({
    method: "GET",
    url: "/missing"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.object, "error");
  assert.equal(response.body.error.type, "not_found");
});

async function invokeRoute({ method, url, body }) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = {
    method,
    url,
    headers: {
      host: "localhost:3030"
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };

  const response = createMockResponse();
  const handler = createRequestHandler();
  await handler(request, response);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: JSON.parse(response.body)
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}
