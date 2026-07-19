import { computed, ref } from "vue";
import { FONT_OPTIONS, resolveFontStack as resolveBuiltInFontStack } from "./constants";

const externalFontOptions = ref([]);

export const registeredFontOptions = computed(() => [
  ...FONT_OPTIONS,
  ...externalFontOptions.value,
]);

export function buildExternalFontValue(family) {
  return `external:${encodeURIComponent(String(family || "").trim())}`;
}

export function decodeExternalFontFamily(value) {
  if (!isExternalFontValue(value)) {
    return "";
  }

  try {
    return decodeURIComponent(String(value).slice("external:".length));
  } catch (_) {
    return "";
  }
}

export function buildExternalFontStack(family) {
  const normalizedFamily = String(family || "").trim();
  if (!normalizedFamily) {
    return "inherit";
  }

  const escapedFamily = normalizedFamily.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const serifPattern = /serif|song|宋|仿宋|楷/i;
  const fallback = serifPattern.test(normalizedFamily) ? "serif" : "sans-serif";
  return `"${escapedFamily}", ${fallback}`;
}

export function setExternalFontOptions(fonts) {
  const seen = new Set(FONT_OPTIONS.map((option) => option.value));
  externalFontOptions.value = (Array.isArray(fonts) ? fonts : [])
    .map((font, index) => {
      const family = String(font?.family || "").trim();
      const value = String(font?.value || buildExternalFontValue(family)).trim();
      const label = String(font?.label || `${family || `外部字体 ${index + 1}`}（外部）`).trim();
      const stack = String(font?.stack || buildExternalFontStack(family)).trim();
      return {
        value,
        label,
        stack: stack || "inherit",
      };
    })
    .filter((font) => {
      if (!font.value || seen.has(font.value)) {
        return false;
      }
      seen.add(font.value);
      return true;
    });
}

export function isExternalFontValue(value) {
  return String(value || "").startsWith("external:");
}

export function isKnownFontValue(value) {
  if (value === "inherit") {
    return true;
  }

  if (isExternalFontValue(value)) {
    return Boolean(decodeExternalFontFamily(value));
  }

  return registeredFontOptions.value.some((option) => option.value === value);
}

export function resolveRegisteredFontStack(fontValue) {
  const matched = registeredFontOptions.value.find((option) => option.value === fontValue);
  if (matched?.stack) {
    return matched.stack;
  }

  if (isExternalFontValue(fontValue)) {
    return buildExternalFontStack(decodeExternalFontFamily(fontValue));
  }

  return resolveBuiltInFontStack(fontValue);
}
