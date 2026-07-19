import {
  AI_RESPONSE_MODES,
  APP_SETTINGS_STORAGE_KEY,
  BUILTIN_DEFAULT_MODEL_ID,
  BUILTIN_DEFAULT_PROVIDER_ID,
  DEFAULT_APP_SETTINGS,
  DEFAULT_PERSISTENCE,
  PREFERENCE_DEFAULTS,
  SIDEBAR_DEFAULT_SECTIONS,
  VIEW_MODES,
  buildModelTestFingerprint,
  createBuiltinDefaultModel,
  createBuiltinDefaultProvider,
  createRequestHeader,
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

function readBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function readTheme(value, fallback) {
  const theme = String(value || "").trim();
  if (!theme) {
    return fallback;
  }

  return theme.slice(0, 120);
}

function normalizeResponseMode(value) {
  return AI_RESPONSE_MODES.includes(value) ? value : "standard";
}

function normalizeProvider(rawProvider, index) {
  const provider = rawProvider && typeof rawProvider === "object" ? rawProvider : {};
  const providerId = String(provider.id || `provider-${index + 1}`);
  const isBuiltinDefaultProvider = providerId === BUILTIN_DEFAULT_PROVIDER_ID;

  return {
    id: providerId,
    name: String(provider.name || `供应商 ${index + 1}`),
    baseUrl: String(provider.baseUrl || ""),
    apiKey: isBuiltinDefaultProvider ? "" : String(provider.apiKey || ""),
    timeout: readNumber(provider.timeout, 60, 5, 300),
    formatTimeout: readNumber(provider.formatTimeout, 300, 30, 1800),
    requestTemplate: String(provider.requestTemplate || ""),
    responseMode: normalizeResponseMode(String(provider.responseMode || "").trim()),
    headers: (Array.isArray(provider.headers) ? provider.headers : []).map((header, headerIndex) => ({
      id: String(header?.id || `${providerId}-header-${headerIndex}`),
      name: String(header?.name || ""),
      value: String(header?.value || ""),
      enabled: header?.enabled !== false,
    })),
  };
}

function normalizeModel(rawModel, index, providerLookup) {
  const model = rawModel && typeof rawModel === "object" ? rawModel : {};
  const modelId = String(model.id || `model-${Date.now()}-${index}`);
  const providerId = String(model.providerId || BUILTIN_DEFAULT_PROVIDER_ID);
  const provider = providerLookup.get(providerId) || null;
  const isBuiltinDefaultModel =
    modelId === BUILTIN_DEFAULT_MODEL_ID && providerId === BUILTIN_DEFAULT_PROVIDER_ID;
  const testedFingerprint = String(model.testedFingerprint || "");
  const currentFingerprint = buildModelTestFingerprint(model, provider);
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

  if (isBuiltinDefaultModel) {
    return {
      id: modelId,
      providerId,
      name: String(model.name || `模型 ${index + 1}`),
      model: String(model.model || "sensenova-6.7-flash-lite"),
      enabled: model.enabled !== false,
      verified: true,
      testStatus: "passed",
      testMessage: String(model.testMessage || "内置默认模型"),
      testedAt: String(model.testedAt || ""),
      testedFingerprint: currentFingerprint,
    };
  }

  return {
    id: modelId,
    providerId,
    name: String(model.name || `模型 ${index + 1}`),
    model: String(model.model || ""),
    enabled: verified ? model.enabled !== false : false,
    verified,
    testStatus,
    testMessage: isCurrentConfig
      ? String(model.testMessage || (verified ? "测试通过" : ""))
      : "",
    testedAt: isCurrentConfig ? String(model.testedAt || "") : "",
    testedFingerprint: verified || testStatus === "failed" ? testedFingerprint : "",
  };
}

function migrateLegacyModelSettings(rawSettings) {
  if (Array.isArray(rawSettings?.providers)) {
    return rawSettings;
  }

  const raw = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const providers = [];
  const models = [];
  const providerIds = new Set();
  const legacyModels = Array.isArray(raw.models) ? raw.models : [];

  legacyModels.forEach((legacyModel, index) => {
    const legacy = legacyModel && typeof legacyModel === "object" ? legacyModel : {};
    const modelId = String(legacy.id || `model-${index + 1}`);
    const providerId =
      modelId === BUILTIN_DEFAULT_MODEL_ID
        ? BUILTIN_DEFAULT_PROVIDER_ID
        : String(legacy.providerId || `provider-${modelId}`);

    if (!providerIds.has(providerId)) {
      providers.push({
        id: providerId,
        name: String(legacy.providerName || legacy.name || `供应商 ${providers.length + 1}`),
        baseUrl: String(legacy.baseUrl || ""),
        apiKey: String(legacy.apiKey || ""),
        timeout: legacy.timeout,
        formatTimeout: legacy.formatTimeout,
        requestTemplate: String(legacy.requestTemplate || ""),
        responseMode: String(legacy.responseMode || ""),
        headers: Array.isArray(legacy.headers)
          ? legacy.headers.map((header) => ({
              id: String(header?.id || createRequestHeader().id),
              name: String(header?.name || ""),
              value: String(header?.value || ""),
              enabled: header?.enabled !== false,
            }))
          : [],
      });
      providerIds.add(providerId);
    }

    models.push({
      id: modelId,
      providerId,
      name: String(legacy.name || `模型 ${index + 1}`),
      model: String(legacy.model || ""),
      enabled: legacy.enabled === true,
      verified: legacy.verified === true,
      testStatus: legacy.testStatus,
      testMessage: legacy.testMessage,
      testedAt: legacy.testedAt,
      testedFingerprint: legacy.testedFingerprint,
    });
  });

  return {
    ...raw,
    providers,
    models,
  };
}

function ensureBuiltinDefaultProvider(rawProviders) {
  const builtinDefaultProvider = createBuiltinDefaultProvider();
  const providers = Array.isArray(rawProviders) ? rawProviders : [];
  const otherProviders = [];
  let builtinProvider = null;

  providers.forEach((provider) => {
    if (String(provider?.id || "") === BUILTIN_DEFAULT_PROVIDER_ID) {
      builtinProvider = {
        ...builtinDefaultProvider,
        ...provider,
      };
      return;
    }

    otherProviders.push(provider);
  });

  return [builtinProvider || builtinDefaultProvider, ...otherProviders];
}

function ensureBuiltinDefaultModel(rawModels) {
  const builtinDefaultModel = createBuiltinDefaultModel();
  const models = Array.isArray(rawModels) ? rawModels : [];
  const otherModels = [];
  let builtinModel = null;

  models.forEach((model) => {
    if (String(model?.id || "") === BUILTIN_DEFAULT_MODEL_ID) {
      builtinModel = {
        ...builtinDefaultModel,
        ...model,
        providerId: BUILTIN_DEFAULT_PROVIDER_ID,
      };
      return;
    }

    otherModels.push(model);
  });

  return [builtinModel || builtinDefaultModel, ...otherModels];
}

export function mergeAppSettings(rawSettings) {
  const raw = migrateLegacyModelSettings(rawSettings);
  const normalizedRaw = raw && typeof raw === "object" ? raw : {};
  const rawPersistence =
    normalizedRaw.persistence && typeof normalizedRaw.persistence === "object"
      ? normalizedRaw.persistence
      : {};

  const persistence = {
    ...DEFAULT_PERSISTENCE,
    ...Object.fromEntries(
      Object.keys(DEFAULT_PERSISTENCE).map((key) => [key, rawPersistence[key] !== false])
    ),
  };

  const providers = ensureBuiltinDefaultProvider(normalizedRaw.providers)
    .map(normalizeProvider)
    .filter((provider) => provider.id);
  const providerLookup = new Map(providers.map((provider) => [provider.id, provider]));

  const models = ensureBuiltinDefaultModel(normalizedRaw.models)
    .map((model, index) => normalizeModel(model, index, providerLookup))
    .filter((model) => model.id)
    .map((model) => {
      const fallbackProviderId = providerLookup.has(model.providerId)
        ? model.providerId
        : providers[0]?.id || BUILTIN_DEFAULT_PROVIDER_ID;
      return {
        ...model,
        providerId: fallbackProviderId,
      };
    });

  let activeModelId = String(normalizedRaw.activeModelId || "");
  if (!models.some((model) => model.id === activeModelId && model.enabled && model.verified)) {
    activeModelId = models.find((model) => model.enabled && model.verified)?.id || "";
  }

  return {
    ...DEFAULT_APP_SETTINGS,
    ...normalizedRaw,
    persistence,
    theme: readTheme(normalizedRaw.theme, DEFAULT_APP_SETTINGS.theme),
    zoom: readNumber(normalizedRaw.zoom, DEFAULT_APP_SETTINGS.zoom, 50, 200),
    viewMode: VIEW_MODES.has(normalizedRaw.viewMode)
      ? normalizedRaw.viewMode
      : DEFAULT_APP_SETTINGS.viewMode,
    showToc: readBoolean(normalizedRaw.showToc, DEFAULT_APP_SETTINGS.showToc),
    tocWidth: readNumber(normalizedRaw.tocWidth, DEFAULT_APP_SETTINGS.tocWidth, 120, 500),
    splitWidth: readNumber(normalizedRaw.splitWidth, DEFAULT_APP_SETTINGS.splitWidth, 20, 80),
    sidebarDefaultSection: SIDEBAR_DEFAULT_SECTIONS.has(normalizedRaw.sidebarDefaultSection)
      ? normalizedRaw.sidebarDefaultSection
      : DEFAULT_APP_SETTINGS.sidebarDefaultSection,
    providers,
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
    providers: normalized.providers.map((provider) => ({
      ...provider,
      apiKey:
        String(provider.id || "") === BUILTIN_DEFAULT_PROVIDER_ID
          ? ""
          : String(provider.apiKey || ""),
      headers: provider.headers.map((header) => ({ ...header })),
    })),
    models: normalized.models.map((model) => {
      const provider =
        normalized.providers.find((item) => item.id === model.providerId) || null;
      return {
        ...model,
        testedFingerprint: buildModelTestFingerprint(model, provider),
      };
    }),
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
