export const CONTRACT_VERSION = "2026-03-12";
export const TOKEN_UNIT = 1_000_000;
export const MODEL_STATUSES = new Set(["active", "preview", "deprecated"]);
export const PRICING_MODES = new Set(["text_tokens", "embeddings", "image", "audio"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/;
const OPTIONAL_PRICING_NUMBER_FIELDS = [
  "cached_input_usd_per_1m_tokens",
  "batch_input_usd_per_1m_tokens",
  "batch_cached_input_usd_per_1m_tokens",
  "batch_output_usd_per_1m_tokens",
  "cache_write_5m_usd_per_1m_tokens",
  "cache_write_1h_usd_per_1m_tokens",
  "cache_storage_usd_per_1m_tokens_per_hour"
];

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
    assertString(model?.released_at, `${basePath}.released_at`);
    assertIsoDate(model.released_at, `${basePath}.released_at`);
    assertString(model?.release_source_url, `${basePath}.release_source_url`);
    assertHttpUrl(model.release_source_url, `${basePath}.release_source_url`);
    assertString(model?.source_url, `${basePath}.source_url`);
    assertHttpUrl(model.source_url, `${basePath}.source_url`);
    assertString(model?.last_verified_at, `${basePath}.last_verified_at`);
    assertIsoDate(model.last_verified_at, `${basePath}.last_verified_at`);
    assertOptionalString(model?.comparison_pricing_basis, `${basePath}.comparison_pricing_basis`);
    assertOptionalString(model?.release_source_note, `${basePath}.release_source_note`);
    assertOptionalString(model?.source_note, `${basePath}.source_note`);
    assertOptionalString(model?.availability_note, `${basePath}.availability_note`);

    if (seenIds.has(model.id)) {
      throw new Error(`${basePath}.id must be unique.`);
    }
    seenIds.add(model.id);

    assertPricingShape(model?.pricing, `${basePath}.pricing`);

    if (model.pricing_tiers !== undefined) {
      if (!Array.isArray(model.pricing_tiers) || model.pricing_tiers.length === 0) {
        throw new Error(`${basePath}.pricing_tiers must be a non-empty array when present.`);
      }

      for (const tier of model.pricing_tiers) {
        const tierPath = `${basePath}.pricing_tiers.${tier?.id ?? "<unknown>"}`;
        assertString(tier?.id, `${tierPath}.id`);
        assertString(tier?.when, `${tierPath}.when`);
        assertPricingShape(tier?.pricing, `${tierPath}.pricing`);
      }
    }
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

function assertOptionalString(value, fieldName) {
  if (value === undefined) {
    return;
  }

  assertString(value, fieldName);
}

function assertNumber(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
}

function assertPricingShape(pricing, fieldName) {
  if (!pricing || typeof pricing !== "object") {
    throw new Error(`${fieldName} must be an object.`);
  }

  assertNumber(pricing.input_usd_per_1m_tokens, `${fieldName}.input_usd_per_1m_tokens`);
  assertNumber(pricing.output_usd_per_1m_tokens, `${fieldName}.output_usd_per_1m_tokens`);

  for (const optionalField of OPTIONAL_PRICING_NUMBER_FIELDS) {
    if (pricing[optionalField] !== undefined) {
      assertNumber(pricing[optionalField], `${fieldName}.${optionalField}`);
    }
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
