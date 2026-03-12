export const CONTRACT_VERSION = "2026-03-12";
export const TOKEN_UNIT = 1_000_000;
export const MODEL_STATUSES = new Set(["active", "preview", "deprecated"]);
export const PRICING_MODES = new Set(["text_tokens", "embeddings", "image", "audio"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/;

export function assertCatalogShape(catalog) {
  if (!catalog || catalog.object !== "pricing_catalog") {
    throw new Error("Catalog must have object=pricing_catalog.");
  }

  if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
    throw new Error("Catalog must include at least one model.");
  }

  if (catalog.snapshot_date !== undefined) {
    assertIsoDate(catalog.snapshot_date, "catalog.snapshot_date");
  }

  const seenIds = new Set();

  for (const model of catalog.models) {
    const basePath = `catalog.models.${model?.id ?? "<unknown>"}`;
    assertString(model?.id, `${basePath}.id`);
    assertString(model?.provider, `${basePath}.provider`);
    assertString(model?.model, `${basePath}.model`);
    assertString(model?.status, `${basePath}.status`);
    assertEnum(model.status, MODEL_STATUSES, `${basePath}.status`);
    assertString(model?.pricing_mode, `${basePath}.pricing_mode`);
    assertEnum(model.pricing_mode, PRICING_MODES, `${basePath}.pricing_mode`);
    assertString(model?.source_url, `${basePath}.source_url`);
    assertHttpUrl(model.source_url, `${basePath}.source_url`);
    assertString(model?.last_verified_at, `${basePath}.last_verified_at`);
    assertIsoDate(model.last_verified_at, `${basePath}.last_verified_at`);

    if (seenIds.has(model.id)) {
      throw new Error(`${basePath}.id must be unique.`);
    }
    seenIds.add(model.id);

    const pricing = model?.pricing;
    if (!pricing || typeof pricing !== "object") {
      throw new Error(`${basePath}.pricing must be an object.`);
    }

    assertNumber(pricing.input_usd_per_1m_tokens, `${basePath}.pricing.input_usd_per_1m_tokens`);
    assertNumber(pricing.output_usd_per_1m_tokens, `${basePath}.pricing.output_usd_per_1m_tokens`);
  }
}

export function buildEnvelope(object, data, meta = undefined) {
  const payload = {
    contract_version: CONTRACT_VERSION,
    object,
    data
  };

  if (meta) {
    payload.meta = meta;
  }

  return payload;
}

export function buildErrorEnvelope(type, message, status = 400, details = undefined) {
  const payload = {
    contract_version: CONTRACT_VERSION,
    object: "error",
    error: {
      type,
      message,
      status
    }
  };

  if (details) {
    payload.error.details = details;
  }

  return payload;
}

function assertString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertNumber(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.has(value)) {
    throw new Error(`${fieldName} must be one of: ${[...allowedValues].join(", ")}.`);
  }
}

function assertIsoDate(value, fieldName) {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }
}

function assertHttpUrl(value, fieldName) {
  if (!HTTP_URL_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be an absolute http(s) URL.`);
  }
}
