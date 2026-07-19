export const APP_SETTINGS_STORAGE_KEY = "md-viewer.app-settings";
export const BUILTIN_DEFAULT_PROVIDER_ID = "__builtin_default_sensenova_provider__";
export const BUILTIN_DEFAULT_MODEL_ID = "__builtin_default_sensenova_model__";
export const AI_RESPONSE_MODES = ["standard", "stream"];

export const DEFAULT_PERSISTENCE = {
  theme: true,
  zoom: true,
  viewMode: true,
  showToc: true,
  tocWidth: true,
  splitWidth: true,
};

export const DEFAULT_APP_SETTINGS = {
  persistence: DEFAULT_PERSISTENCE,
  theme: "elegant",
  zoom: 100,
  viewMode: "preview",
  showToc: true,
  tocWidth: 240,
  splitWidth: 50,
  sidebarDefaultSection: "auto",
  providers: [createBuiltinDefaultProvider()],
  models: [createBuiltinDefaultModel()],
  activeModelId: BUILTIN_DEFAULT_MODEL_ID,
};

export const VIEW_MODES = new Set(["preview", "live", "split"]);
export const SIDEBAR_DEFAULT_SECTIONS = new Set(["auto", "files", "outline"]);

export const PREFERENCE_DEFAULTS = {
  theme: DEFAULT_APP_SETTINGS.theme,
  zoom: DEFAULT_APP_SETTINGS.zoom,
  viewMode: DEFAULT_APP_SETTINGS.viewMode,
  showToc: DEFAULT_APP_SETTINGS.showToc,
  tocWidth: DEFAULT_APP_SETTINGS.tocWidth,
  splitWidth: DEFAULT_APP_SETTINGS.splitWidth,
};

function normalizeResponseMode(value) {
  return AI_RESPONSE_MODES.includes(value) ? value : "standard";
}

export function buildResolvedModelConfig(model, provider) {
  const sharedSource = provider && typeof provider === "object" ? provider : model || {};
  const modelSource = model && typeof model === "object" ? model : {};
  const name = String(modelSource.name || sharedSource.name || "").trim();

  return {
    name,
    baseUrl: String(sharedSource.baseUrl || modelSource.baseUrl || "").trim(),
    apiKey: String(sharedSource.apiKey || modelSource.apiKey || ""),
    model: String(modelSource.model || sharedSource.model || "").trim(),
    timeout: Number(sharedSource.timeout || modelSource.timeout || 60),
    formatTimeout: Number(sharedSource.formatTimeout || modelSource.formatTimeout || 300),
    requestTemplate: String(
      sharedSource.requestTemplate || modelSource.requestTemplate || ""
    ),
    responseMode: normalizeResponseMode(
      String(sharedSource.responseMode || modelSource.responseMode || "standard").trim()
    ),
    headers: (Array.isArray(sharedSource.headers)
      ? sharedSource.headers
      : Array.isArray(modelSource.headers)
      ? modelSource.headers
      : []
    ).map((header) => ({
      id: String(header?.id || ""),
      name: String(header?.name || "").trim(),
      value: String(header?.value || ""),
      enabled: header?.enabled !== false,
    })),
  };
}

export function buildModelTestFingerprint(model, provider) {
  const resolved = buildResolvedModelConfig(model, provider);
  const isBuiltinDefault =
    String(model?.id || "") === BUILTIN_DEFAULT_MODEL_ID ||
    String(provider?.id || "") === BUILTIN_DEFAULT_PROVIDER_ID;
  return JSON.stringify({
    baseUrl: resolved.baseUrl,
    apiKey: isBuiltinDefault ? "" : resolved.apiKey,
    model: resolved.model,
    timeout: Number(resolved.timeout || 60),
    formatTimeout: Number(resolved.formatTimeout || 300),
    requestTemplate: resolved.requestTemplate,
    responseMode: resolved.responseMode,
    headers: resolved.headers
      .filter((header) => header?.enabled !== false)
      .map((header) => ({
        name: String(header?.name || "").trim().toLowerCase(),
        value: String(header?.value || ""),
      })),
  });
}

export function createBuiltinDefaultProvider() {
  return {
    id: BUILTIN_DEFAULT_PROVIDER_ID,
    name: "日日新",
    baseUrl: "https://token.sensenova.cn/v1",
    apiKey: "",
    timeout: 60,
    formatTimeout: 300,
    headers: [],
    requestTemplate: "",
    responseMode: "standard",
  };
}

export function createBuiltinDefaultModel() {
  const provider = createBuiltinDefaultProvider();
  const model = {
    id: BUILTIN_DEFAULT_MODEL_ID,
    providerId: BUILTIN_DEFAULT_PROVIDER_ID,
    name: "日日新",
    model: "sensenova-6.7-flash-lite",
    enabled: true,
    verified: true,
    testStatus: "passed",
    testMessage: "内置默认模型",
    testedAt: "",
    testedFingerprint: "",
  };

  model.testedFingerprint = buildModelTestFingerprint(model, provider);
  return model;
}

export function createRequestHeader() {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `header-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: randomId,
    name: "",
    value: "",
    enabled: true,
  };
}

export function createProvider() {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `provider-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: randomId,
    name: "新供应商",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    timeout: 60,
    formatTimeout: 300,
    headers: [],
    requestTemplate: "",
    responseMode: "standard",
  };
}

export function createModel(providerId = "") {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `model-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: randomId,
    providerId: String(providerId || ""),
    name: "新模型",
    model: "",
    enabled: false,
    verified: false,
    testStatus: "untested",
    testMessage: "请先选择供应商并填写模型名称后再测试",
    testedAt: "",
    testedFingerprint: "",
  };
}
