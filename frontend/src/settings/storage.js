import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  DEFAULT_PERSISTENCE,
  PREFERENCE_DEFAULTS,
  VIEW_MODES,
  buildModelTestFingerprint,
} from "./constants";

const LEGACY_STORAGE_KEYS = {
  tocWidth: "tocWidth",
  splitWidth: "md-viewer.split-editor-width",
};

function readNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function normalizeModel(rawModel, index) {
  const model = rawModel && typeof rawModel === "object" ? rawModel : {};
  const modelId = String(model.id || `model-${Date.now()}-${index}`);
  const testedFingerprint = String(model.testedFingerprint || "");
  const currentFingerprint = buildModelTestFingerprint(model);
  const rawStatus =
    model.testStatus === "passed" || model.testStatus === "failed"
      ? model.testStatus
      : "untested";
  const isCurrentConfig = testedFingerprint !== "" && testedFingerprint === currentFingerprint;
  const verified = model.verified === true && rawStatus === "passed" && isCurrentConfig;
  const testStatus = verified
    ? "passed"
    : rawStatus === "failed" && isCurrentConfig
    ? "failed"
    : "untested";

  return {
    id: modelId,
    name: String(model.name || `模型 ${index + 1}`),
    baseUrl: String(model.baseUrl || ""),
    apiKey: String(model.apiKey || ""),
    model: String(model.model || ""),
    enabled: verified ? model.enabled !== false : false,
    verified,
    testStatus,
    testMessage: isCurrentConfig
      ? String(model.testMessage || (verified ? "测试通过" : ""))
      : "",
    testedAt: isCurrentConfig ? String(model.testedAt || "") : "",
    testedFingerprint: verified || testStatus === "failed" ? testedFingerprint : "",
    timeout: readNumber(model.timeout, 60, 5, 300),
    formatTimeout: readNumber(model.formatTimeout, 300, 30, 1800),
    headers: (Array.isArray(model.headers) ? model.headers : []).map((header, headerIndex) => ({
      id: String(header?.id || `${modelId}-header-${headerIndex}`),
      name: String(header?.name || ""),
      value: String(header?.value || ""),
      enabled: header?.enabled !== false,
    })),
  };
}

export function mergeAppSettings(rawSettings) {
  const raw = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const rawPersistence =
    raw.persistence && typeof raw.persistence === "object" ? raw.persistence : {};

  const persistence = {
    ...DEFAULT_PERSISTENCE,
    ...Object.fromEntries(
      Object.keys(DEFAULT_PERSISTENCE).map((key) => [key, rawPersistence[key] !== false])
    ),
  };

  const models = Array.isArray(raw.models)
    ? raw.models.map(normalizeModel).filter((model) => model.id)
    : [];

  let activeModelId = String(raw.activeModelId || "");
  if (!models.some((model) => model.id === activeModelId && model.enabled && model.verified)) {
    activeModelId = models.find((model) => model.enabled && model.verified)?.id || "";
  }

  return {
    ...DEFAULT_APP_SETTINGS,
    ...raw,
    persistence,
    theme: ["default", "dark", "elegant"].includes(raw.theme)
      ? raw.theme
      : DEFAULT_APP_SETTINGS.theme,
    zoom: readNumber(raw.zoom, DEFAULT_APP_SETTINGS.zoom, 50, 200),
    viewMode: VIEW_MODES.has(raw.viewMode) ? raw.viewMode : DEFAULT_APP_SETTINGS.viewMode,
    tocWidth: readNumber(raw.tocWidth, DEFAULT_APP_SETTINGS.tocWidth, 120, 500),
    splitWidth: readNumber(raw.splitWidth, DEFAULT_APP_SETTINGS.splitWidth, 20, 80),
    models,
    activeModelId,
  };
}

function readLegacyPreference(key) {
  const storageKey = LEGACY_STORAGE_KEYS[key];
  if (!storageKey) {
    return undefined;
  }

  try {
    return localStorage.getItem(storageKey);
  } catch (_) {
    return undefined;
  }
}

export function loadAppSettings() {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (raw) {
      return mergeAppSettings(JSON.parse(raw));
    }

    return mergeAppSettings({
      tocWidth: readLegacyPreference("tocWidth"),
      splitWidth: readLegacyPreference("splitWidth"),
    });
  } catch (error) {
    console.warn("加载应用设置失败，已回退到默认值:", error);
    return mergeAppSettings();
  }
}

export function saveAppSettings(settings) {
  const normalized = mergeAppSettings(settings);
  const persisted = {
    ...normalized,
    persistence: { ...normalized.persistence },
  };

  for (const key of Object.keys(PREFERENCE_DEFAULTS)) {
    if (!persisted.persistence[key]) {
      delete persisted[key];
    }
  }

  try {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(persisted));

    for (const legacyKey of Object.values(LEGACY_STORAGE_KEYS)) {
      localStorage.removeItem(legacyKey);
    }
  } catch (error) {
    console.warn("保存应用设置失败:", error);
  }
}
