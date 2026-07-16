import {
  ELEMENT_TABS,
  FONT_OPTIONS,
  STYLE_CONFIG_STORAGE_KEY,
  STYLE_PANEL_STORAGE_KEY,
  createDefaultStyleConfig,
  createDefaultStylePanelState,
  createInheritedStyle,
} from "./constants";

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeElementStyle(rawStyle) {
  const merged = {
    ...createInheritedStyle(),
    ...(rawStyle || {}),
  };

  const validFontFamilies = new Set(FONT_OPTIONS.map((option) => option.value));
  if (!validFontFamilies.has(merged.fontFamily)) {
    merged.fontFamily = "inherit";
  }

  return {
    ...merged,
  };
}

export function mergeStyleConfig(rawConfig) {
  const defaults = createDefaultStyleConfig();
  const merged = {
    ...defaults,
    ...(rawConfig || {}),
  };

  merged.contentWidth = normalizeNullableNumber(merged.contentWidth);
  merged.paddingHorizontal = normalizeNullableNumber(merged.paddingHorizontal);
  merged.paddingVertical = normalizeNullableNumber(merged.paddingVertical);
  merged.bodySize = normalizeNullableNumber(merged.bodySize);
  merged.h1Size = normalizeNullableNumber(merged.h1Size);
  merged.h2Size = normalizeNullableNumber(merged.h2Size);
  merged.h3Size = normalizeNullableNumber(merged.h3Size);
  merged.h4Size = normalizeNullableNumber(merged.h4Size);
  merged.h5Size = normalizeNullableNumber(merged.h5Size);
  merged.h6Size = normalizeNullableNumber(merged.h6Size);

  for (const { key } of ELEMENT_TABS) {
    merged[key] = mergeElementStyle(merged[key]);
  }

  return merged;
}

export function mergePanelState(rawState) {
  const defaults = createDefaultStylePanelState();
  const hasExplicitVisibilityPreference =
    typeof rawState?.visibilityTouched === "boolean" ? rawState.visibilityTouched : false;
  const merged = {
    ...defaults,
    ...(rawState || {}),
    visible: hasExplicitVisibilityPreference ? rawState.visible : defaults.visible,
    visibilityTouched: hasExplicitVisibilityPreference,
    sections: {
      ...defaults.sections,
      ...(rawState?.sections || {}),
    },
  };

  if (!ELEMENT_TABS.some(({ key }) => key === merged.activeTab)) {
    merged.activeTab = defaults.activeTab;
  }

  return merged;
}

export function loadStyleConfig() {
  try {
    const raw = localStorage.getItem(STYLE_CONFIG_STORAGE_KEY);
    return raw ? mergeStyleConfig(JSON.parse(raw)) : createDefaultStyleConfig();
  } catch (error) {
    console.warn("加载样式配置失败，已回退到默认值:", error);
    return createDefaultStyleConfig();
  }
}

export function saveStyleConfig(styleConfig) {
  try {
    localStorage.setItem(
      STYLE_CONFIG_STORAGE_KEY,
      JSON.stringify(mergeStyleConfig(styleConfig))
    );
  } catch (error) {
    console.warn("保存样式配置失败:", error);
  }
}

export function loadStylePanelState() {
  try {
    const raw = localStorage.getItem(STYLE_PANEL_STORAGE_KEY);
    return raw ? mergePanelState(JSON.parse(raw)) : createDefaultStylePanelState();
  } catch (error) {
    console.warn("加载样式面板状态失败，已回退到默认值:", error);
    return createDefaultStylePanelState();
  }
}

export function saveStylePanelState(panelState) {
  try {
    localStorage.setItem(
      STYLE_PANEL_STORAGE_KEY,
      JSON.stringify(mergePanelState(panelState))
    );
  } catch (error) {
    console.warn("保存样式面板状态失败:", error);
  }
}

export function isStyleConfigDefault(styleConfig) {
  return (
    JSON.stringify(mergeStyleConfig(styleConfig)) ===
    JSON.stringify(createDefaultStyleConfig())
  );
}
