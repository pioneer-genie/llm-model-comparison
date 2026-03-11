export const CONTRACT_VERSION = "2026-03-12";
export const TOKEN_UNIT = 1_000_000;

export function assertCatalogShape(catalog) {
  if (!catalog || catalog.object !== "pricing_catalog") {
    throw new Error("Catalog must have object=pricing_catalog.");
  }

  if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
    throw new Error("Catalog must include at least one model.");
  }

  for (const model of catalog.models) {
    const basePath = `catalog.models.${model?.id ?? "<unknown>"}`;
    assertString(model?.id, `${basePath}.id`);
    assertString(model?.provider, `${basePath}.provider`);
    assertString(model?.model, `${basePath}.model`);

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
