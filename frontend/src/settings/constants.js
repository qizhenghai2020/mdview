export const APP_SETTINGS_STORAGE_KEY = "md-viewer.app-settings";

export const DEFAULT_PERSISTENCE = {
  theme: true,
  zoom: true,
  viewMode: true,
  tocWidth: true,
  splitWidth: true,
};

export const DEFAULT_APP_SETTINGS = {
  persistence: DEFAULT_PERSISTENCE,
  theme: "elegant",
  zoom: 100,
  viewMode: "preview",
  tocWidth: 240,
  splitWidth: 50,
  models: [],
  activeModelId: "",
};

export const VIEW_MODES = new Set(["preview", "live", "split"]);

export const PREFERENCE_DEFAULTS = {
  theme: DEFAULT_APP_SETTINGS.theme,
  zoom: DEFAULT_APP_SETTINGS.zoom,
  viewMode: DEFAULT_APP_SETTINGS.viewMode,
  tocWidth: DEFAULT_APP_SETTINGS.tocWidth,
  splitWidth: DEFAULT_APP_SETTINGS.splitWidth,
};

export function buildModelTestFingerprint(model) {
  return JSON.stringify({
    baseUrl: String(model?.baseUrl || "").trim(),
    apiKey: String(model?.apiKey || "").trim(),
    model: String(model?.model || "").trim(),
    timeout: Number(model?.timeout || 60),
    formatTimeout: Number(model?.formatTimeout || 300),
    headers: (Array.isArray(model?.headers) ? model.headers : [])
      .filter((header) => header?.enabled !== false)
      .map((header) => ({
        name: String(header?.name || "").trim().toLowerCase(),
        value: String(header?.value || ""),
      })),
  });
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

export function createModel() {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `model-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: randomId,
    name: "新模型",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    enabled: false,
    verified: false,
    testStatus: "untested",
    testMessage: "请填写配置后点击测试",
    testedAt: "",
    testedFingerprint: "",
    timeout: 60,
    formatTimeout: 300,
    headers: [],
  };
}
