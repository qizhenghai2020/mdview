function normalizeAIResponseMode(value) {
  return String(value || "").trim().toLowerCase() === "stream" ? "stream" : "standard";
}

export function sanitizeAITextInput(value, maxLength = 1000) {
  const numericLimit = Number(maxLength);
  const limit = Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : 1000;
  return String(value || "").trim().slice(0, limit);
}

export function buildAIModelPayload(model) {
  const source = model && typeof model === "object" ? model : {};

  return {
    name: String(source.name || "").trim(),
    baseUrl: String(source.baseUrl || "").trim(),
    apiKey: String(source.apiKey || ""),
    model: String(source.model || "").trim(),
    timeout: Number(source.timeout || 60),
    formatTimeout: Number(source.formatTimeout || 300),
    headers: (Array.isArray(source.headers) ? source.headers : []).map((header) => ({
      name: String(header?.name || "").trim(),
      value: String(header?.value || ""),
      enabled: header?.enabled !== false,
    })),
    requestTemplate: String(source.requestTemplate || ""),
    responseMode: normalizeAIResponseMode(source.responseMode),
  };
}
