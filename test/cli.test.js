import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

test("CLI compare prints JSON envelope by default", () => {
  const result = runCli([
    "compare",
    "--models",
    "openai/gpt-5-mini,google/gemini-2.5-flash-lite",
    "--input-tokens",
    "1000000",
    "--output-tokens",
    "250000"
  ]);

  assert.equal(result.status, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.object, "price_comparison");
  assert.equal(parsed.data.comparisons[0].model_id, "google/gemini-2.5-flash-lite");
});

test("CLI list prints table when requested", () => {
  const result = runCli(["list", "--provider", "google", "--format", "table"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /model_id/);
  assert.match(result.stdout, /released_at/);
  assert.match(result.stdout, /status/);
  assert.match(result.stdout, /google\/gemini-2\.5-flash-lite/);
});

test("CLI list defaults to release-date ordering", () => {
  const result = runCli(["list"]);

  assert.equal(result.status, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.object, "list");
  assert.equal(parsed.data[0].id, "openai/gpt-5.4");
  assert.equal(parsed.data[0].released_at, "2026-03-05");
});

test("CLI show exits non-zero for unknown model", () => {
  const result = runCli(["show", "missing/model"]);

  assert.equal(result.status, 1);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.object, "error");
  assert.equal(parsed.error.type, "cli_error");
});

function runCli(args) {
  return spawnSync(process.execPath, ["src/cli.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}
