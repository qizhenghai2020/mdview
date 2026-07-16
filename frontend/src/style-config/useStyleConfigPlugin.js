import { computed, ref, watch } from "vue";
import {
  ELEMENT_TABS,
  createDefaultStyleConfig,
  resolveFontStack,
  resolveThemeMetricFallback,
} from "./constants";
import {
  isStyleConfigDefault,
  loadStyleConfig,
  loadStylePanelState,
  mergeStyleConfig,
  mergePanelState,
  saveStyleConfig,
  saveStylePanelState,
} from "./storage";

function scaleToPx(value, zoomScale) {
  const scaled = Number((value * zoomScale).toFixed(2));
  return `${scaled}px`;
}

function applyElementVars(target, key, elementStyle) {
  if (!elementStyle) return;

  if (elementStyle.color && elementStyle.color !== "inherit") {
    target[`--viewer-${key}-color`] = elementStyle.color;
  }

  if (elementStyle.fontFamily && elementStyle.fontFamily !== "inherit") {
    target[`--viewer-${key}-font-family`] = resolveFontStack(elementStyle.fontFamily);
  }

  if (elementStyle.bold !== "inherit") {
    target[`--viewer-${key}-font-weight`] = elementStyle.bold ? "700" : "400";
  }

  if (elementStyle.italic !== "inherit") {
    target[`--viewer-${key}-font-style`] = elementStyle.italic ? "italic" : "normal";
  }
}

export function useStyleConfigPlugin(currentThemeRef, zoomLevelRef) {
  const styleConfig = ref(loadStyleConfig());
  const panelState = ref(loadStylePanelState());

  watch(
    styleConfig,
    (value) => {
      saveStyleConfig(value);
    },
    { deep: true }
  );

  watch(
    panelState,
    (value) => {
      saveStylePanelState(value);
    },
    { deep: true }
  );

  const effectiveMetrics = computed(() => {
    const fallback = resolveThemeMetricFallback(currentThemeRef.value);
    const current = mergeStyleConfig(styleConfig.value);

    return {
      contentWidth: current.contentWidth ?? fallback.contentWidth,
      paddingHorizontal: current.paddingHorizontal ?? fallback.paddingHorizontal,
      paddingVertical: current.paddingVertical ?? fallback.paddingVertical,
      bodySize: current.bodySize ?? fallback.bodySize,
      h1Size: current.h1Size ?? fallback.h1Size,
      h2Size: current.h2Size ?? fallback.h2Size,
      h3Size: current.h3Size ?? fallback.h3Size,
      h4Size: current.h4Size ?? fallback.h4Size,
      h5Size: current.h5Size ?? fallback.h5Size,
      h6Size: current.h6Size ?? fallback.h6Size,
    };
  });

  const styleConfigVars = computed(() => {
    const current = mergeStyleConfig(styleConfig.value);
    const vars = {};
    const zoomScale = (zoomLevelRef.value || 100) / 100;

    if (current.contentWidth !== null) {
      vars["--viewer-content-max-width"] = `${current.contentWidth}px`;
    }

    if (current.paddingHorizontal !== null) {
      vars["--viewer-preview-padding-x"] = `${current.paddingHorizontal}px`;
      vars["--viewer-split-padding-x"] = `${current.paddingHorizontal}px`;
    }

    if (current.paddingVertical !== null) {
      vars["--viewer-preview-padding-y"] = `${current.paddingVertical}px`;
      vars["--viewer-split-padding-y"] = `${current.paddingVertical}px`;
    }

    const sizeVarMap = [
      ["bodySize", "--viewer-body-font-size"],
      ["h1Size", "--viewer-h1-font-size"],
      ["h2Size", "--viewer-h2-font-size"],
      ["h3Size", "--viewer-h3-font-size"],
      ["h4Size", "--viewer-h4-font-size"],
      ["h5Size", "--viewer-h5-font-size"],
      ["h6Size", "--viewer-h6-font-size"],
    ];

    for (const [configKey, cssVar] of sizeVarMap) {
      if (current[configKey] !== null) {
        vars[cssVar] = scaleToPx(current[configKey], zoomScale);
      }
    }

    for (const { key } of ELEMENT_TABS) {
      applyElementVars(vars, key, current[key]);
    }

    return vars;
  });

  const hasCustomStyleConfig = computed(() => !isStyleConfigDefault(styleConfig.value));

  function resetStyleConfig() {
    styleConfig.value = createDefaultStyleConfig();
  }

  function normalizePanelState() {
    panelState.value = mergePanelState(panelState.value);
  }

  return {
    styleConfig,
    panelState,
    effectiveMetrics,
    styleConfigVars,
    hasCustomStyleConfig,
    resetStyleConfig,
    normalizePanelState,
  };
}
