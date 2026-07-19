export const SMART_THEME_STORAGE_KEY = "md-viewer.smart-themes";
export const SMART_THEME_PREFIX = "ai-theme-";
export const SMART_THEME_PROMPT_HISTORY_STORAGE_KEY = "md-viewer.smart-theme-prompts";

const MAX_THEME_NAME_LENGTH = 24;
const MAX_THEME_DESCRIPTION_LENGTH = 80;
const MAX_THEME_SOURCE_PROMPT_LENGTH = 300;
const MAX_STORED_SMART_THEMES = 12;
const MAX_STORED_SMART_THEME_PROMPTS = 20;
const MAX_THEME_PROMPT_LENGTH = 800;

const STYLE_LABELS = {
  glass: "玻璃",
  crystal: "水晶",
  neumorphism: "拟物",
  paper: "纸感",
  aurora: "极光",
  professional: "专业",
  minimal: "极简",
};

const DEFAULT_PALETTES = {
  light: {
    background: "#f7f9fc",
    surface: "#ffffff",
    elevated: "#f8fbff",
    toolbar: "#ffffff",
    sidebar: "#f4f7fb",
    sidebarHover: "#eaf2ff",
    sidebarActive: "#ddeafe",
    editor: "#ffffff",
    text: "#172033",
    textSecondary: "#536075",
    textTertiary: "#8994a8",
    border: "#d9e1ef",
    toolbarBorder: "#dde5f0",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    codeBackground: "#111827",
    codeText: "#f8fafc",
    codeBorder: "#1f2937",
    blockquoteBorder: "#93c5fd",
    blockquoteBackground: "#eff6ff",
    tableBorder: "#d9e1ef",
    tableStripe: "#f6f9ff",
    scrollbarThumb: "#b8c4d8",
    buttonHover: "rgba(37, 99, 235, 0.1)",
    buttonActive: "rgba(37, 99, 235, 0.16)",
  },
  dark: {
    background: "#0b1120",
    surface: "#111827",
    elevated: "#162033",
    toolbar: "#111827",
    sidebar: "#111827",
    sidebarHover: "#17243a",
    sidebarActive: "#1d2d4a",
    editor: "#0b1120",
    text: "#eef2ff",
    textSecondary: "#a7b2c7",
    textTertiary: "#778397",
    border: "#263247",
    toolbarBorder: "#1f2937",
    accent: "#60a5fa",
    accentHover: "#93c5fd",
    codeBackground: "#020617",
    codeText: "#f8fafc",
    codeBorder: "#263247",
    blockquoteBorder: "#60a5fa",
    blockquoteBackground: "#12213a",
    tableBorder: "#263247",
    tableStripe: "#131f33",
    scrollbarThumb: "#3d4b62",
    buttonHover: "rgba(255, 255, 255, 0.07)",
    buttonActive: "rgba(255, 255, 255, 0.12)",
  },
};

const PALETTE_KEYS = Object.keys(DEFAULT_PALETTES.light);

const APPEARANCE_PRESETS = {
  glass: {
    surfaceOpacity: 0.66,
    chromeOpacity: 0.7,
    sidebarOpacity: 0.68,
    editorOpacity: 0.72,
    blur: 18,
    radius: 22,
    controlRadius: 12,
    cardRadius: 20,
    borderOpacity: 0.42,
    shadow: "floating",
    buttonStyle: "glass",
  },
  crystal: {
    surfaceOpacity: 0.76,
    chromeOpacity: 0.8,
    sidebarOpacity: 0.74,
    editorOpacity: 0.82,
    blur: 14,
    radius: 20,
    controlRadius: 11,
    cardRadius: 18,
    borderOpacity: 0.5,
    shadow: "floating",
    buttonStyle: "glass",
  },
  neumorphism: {
    surfaceOpacity: 0.98,
    chromeOpacity: 0.98,
    sidebarOpacity: 0.98,
    editorOpacity: 0.98,
    blur: 0,
    radius: 24,
    controlRadius: 14,
    cardRadius: 22,
    borderOpacity: 0.26,
    shadow: "raised",
    buttonStyle: "raised",
  },
  paper: {
    surfaceOpacity: 0.96,
    chromeOpacity: 0.98,
    sidebarOpacity: 0.96,
    editorOpacity: 0.98,
    blur: 0,
    radius: 14,
    controlRadius: 8,
    cardRadius: 14,
    borderOpacity: 0.72,
    shadow: "paper",
    buttonStyle: "subtle",
  },
  aurora: {
    surfaceOpacity: 0.78,
    chromeOpacity: 0.82,
    sidebarOpacity: 0.76,
    editorOpacity: 0.84,
    blur: 16,
    radius: 20,
    controlRadius: 12,
    cardRadius: 20,
    borderOpacity: 0.38,
    shadow: "glow",
    buttonStyle: "glow",
  },
  professional: {
    surfaceOpacity: 0.96,
    chromeOpacity: 0.98,
    sidebarOpacity: 0.96,
    editorOpacity: 0.98,
    blur: 0,
    radius: 12,
    controlRadius: 7,
    cardRadius: 12,
    borderOpacity: 0.78,
    shadow: "soft",
    buttonStyle: "solid",
  },
  minimal: {
    surfaceOpacity: 1,
    chromeOpacity: 1,
    sidebarOpacity: 1,
    editorOpacity: 1,
    blur: 0,
    radius: 8,
    controlRadius: 6,
    cardRadius: 8,
    borderOpacity: 0.66,
    shadow: "none",
    buttonStyle: "plain",
  },
};

const MARKDOWN_PRESETS = {
  glass: {
    surfaceOpacity: 0.7,
    headingStyle: "floating",
    codeStyle: "panel",
    tableStyle: "card",
    taskStyle: "cards",
    imageStyle: "floating",
  },
  crystal: {
    surfaceOpacity: 0.78,
    headingStyle: "accent-line",
    codeStyle: "panel",
    tableStyle: "card",
    taskStyle: "cards",
    imageStyle: "floating",
  },
  neumorphism: {
    surfaceOpacity: 0.96,
    headingStyle: "soft",
    codeStyle: "raised",
    tableStyle: "raised",
    taskStyle: "cards",
    imageStyle: "raised",
  },
  paper: {
    surfaceOpacity: 0.96,
    headingStyle: "editorial",
    codeStyle: "ink",
    tableStyle: "paper",
    taskStyle: "cards",
    imageStyle: "paper",
  },
  aurora: {
    surfaceOpacity: 0.82,
    headingStyle: "glow",
    codeStyle: "panel",
    tableStyle: "card",
    taskStyle: "cards",
    imageStyle: "floating",
  },
  professional: {
    surfaceOpacity: 0.98,
    headingStyle: "accent-line",
    codeStyle: "panel",
    tableStyle: "card",
    taskStyle: "compact",
    imageStyle: "rounded",
  },
  minimal: {
    surfaceOpacity: 1,
    headingStyle: "clean",
    codeStyle: "minimal",
    tableStyle: "minimal",
    taskStyle: "compact",
    imageStyle: "rounded",
  },
};

const SHADOW_STYLES = new Set(["none", "soft", "floating", "raised", "paper", "glow"]);
const BUTTON_STYLES = new Set(["plain", "solid", "subtle", "glass", "raised", "glow"]);
const HEADING_STYLES = new Set(["clean", "accent-line", "floating", "soft", "editorial", "glow"]);
const MARKDOWN_COMPONENT_STYLES = new Set(["minimal", "panel", "card", "cards", "compact", "paper", "raised", "ink", "floating", "rounded"]);

function createSmartThemeId() {
  const rawId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${SMART_THEME_PREFIX}${String(rawId).replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;
}

function sanitizeSmartThemeId(value) {
  const id = String(value || "")
    .trim()
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase();

  return id.startsWith(SMART_THEME_PREFIX) ? id : "";
}

function safeText(value, fallback, maxLength) {
  const text = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return (text || fallback).slice(0, maxLength);
}

function createPromptHistoryId() {
  const rawId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `smart-theme-prompt-${String(rawId).replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;
}

function stripOuterFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseThemePayload(rawResponse) {
  const text = stripOuterFence(rawResponse);

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("AI 没有返回可解析的主题 JSON");
  }
}

function normalizeStyle(value) {
  const style = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(STYLE_LABELS, style) ? style : "professional";
}

function isUnsafeCssValue(value) {
  return /[;{}<>]|url\s*\(|expression\s*\(/i.test(value);
}

function isSafeCssColor(value) {
  const color = String(value || "").trim();
  if (!color || isUnsafeCssValue(color)) {
    return false;
  }

  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", color);
  }

  return (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ||
    /^rgba?\([\d\s.,%]+\)$/i.test(color) ||
    /^hsla?\([\d\s.,%]+\)$/i.test(color) ||
    color === "transparent"
  );
}

function pickColor(source, key, fallback) {
  const value = String(source?.[key] || source?.[`--${key}`] || "").trim();
  return isSafeCssColor(value) ? value : fallback;
}

function hexToRgb(value) {
  const match = String(value || "")
    .trim()
    .match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);

  if (!match) {
    return null;
  }

  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split("")
      .map((part) => part + part)
      .join("");
  } else {
    hex = hex.slice(0, 6);
  }

  const numeric = Number.parseInt(hex, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function rgbaFrom(color, alpha, fallback = "#0f172a") {
  const rgb = hexToRgb(color) || hexToRgb(fallback) || hexToRgb("#0f172a");
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getRelativeLuminance(color) {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return null;
  }

  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function normalizeMode(value, paletteSource) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "dark" || mode === "light") {
    return mode;
  }

  const luminance = getRelativeLuminance(paletteSource?.background);
  return luminance !== null && luminance < 0.36 ? "dark" : "light";
}

function normalizePalette(source, mode) {
  const fallback = DEFAULT_PALETTES[mode] || DEFAULT_PALETTES.light;
  return PALETTE_KEYS.reduce((palette, key) => {
    palette[key] = pickColor(source, key, fallback[key]);
    return palette;
  }, {});
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function pickNumber(source, key, fallback, min, max) {
  return clampNumber(source?.[key], fallback, min, max);
}

function pickEnum(source, key, allowedValues, fallback) {
  const value = String(source?.[key] || "").trim().toLowerCase();
  return allowedValues.has(value) ? value : fallback;
}

function px(value) {
  return `${Number(value).toFixed(0)}px`;
}

function opacity(value) {
  return Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeAppearance(source, style) {
  const fallback = APPEARANCE_PRESETS[style] || APPEARANCE_PRESETS.professional;
  return {
    surfaceOpacity: pickNumber(source, "surfaceOpacity", fallback.surfaceOpacity, 0.42, 1),
    chromeOpacity: pickNumber(source, "chromeOpacity", fallback.chromeOpacity, 0.42, 1),
    sidebarOpacity: pickNumber(source, "sidebarOpacity", fallback.sidebarOpacity, 0.42, 1),
    editorOpacity: pickNumber(source, "editorOpacity", fallback.editorOpacity, 0.52, 1),
    blur: pickNumber(source, "blur", fallback.blur, 0, 28),
    radius: pickNumber(source, "radius", fallback.radius, 2, 32),
    controlRadius: pickNumber(source, "controlRadius", fallback.controlRadius, 2, 24),
    cardRadius: pickNumber(source, "cardRadius", fallback.cardRadius, 2, 32),
    borderOpacity: pickNumber(source, "borderOpacity", fallback.borderOpacity, 0.12, 1),
    shadow: pickEnum(source, "shadow", SHADOW_STYLES, fallback.shadow),
    buttonStyle: pickEnum(source, "buttonStyle", BUTTON_STYLES, fallback.buttonStyle),
  };
}

function normalizeMarkdown(source, style, appearance) {
  const fallback = MARKDOWN_PRESETS[style] || MARKDOWN_PRESETS.professional;
  return {
    surfaceOpacity: pickNumber(source, "surfaceOpacity", fallback.surfaceOpacity, 0.45, 1),
    headingStyle: pickEnum(source, "headingStyle", HEADING_STYLES, fallback.headingStyle),
    codeStyle: pickEnum(source, "codeStyle", MARKDOWN_COMPONENT_STYLES, fallback.codeStyle),
    tableStyle: pickEnum(source, "tableStyle", MARKDOWN_COMPONENT_STYLES, fallback.tableStyle),
    taskStyle: pickEnum(source, "taskStyle", MARKDOWN_COMPONENT_STYLES, fallback.taskStyle),
    imageStyle: pickEnum(source, "imageStyle", MARKDOWN_COMPONENT_STYLES, fallback.imageStyle),
    headingRadius: pickNumber(source, "headingRadius", Math.max(6, appearance.controlRadius), 0, 28),
    blockRadius: pickNumber(source, "blockRadius", appearance.cardRadius, 4, 32),
    tableRadius: pickNumber(source, "tableRadius", appearance.cardRadius, 4, 32),
    taskRadius: pickNumber(source, "taskRadius", appearance.cardRadius, 4, 32),
    imageRadius: pickNumber(source, "imageRadius", appearance.cardRadius, 0, 32),
  };
}

function buildShadowToken(appearance, mode) {
  const isDark = mode === "dark";
  const darkBase = isDark ? "0, 0, 0" : "15, 23, 42";

  if (appearance.shadow === "none") {
    return {
      sm: "none",
      md: "none",
      control: "none",
    };
  }

  if (appearance.shadow === "raised") {
    return {
      sm: isDark
        ? "7px 7px 18px rgba(0, 0, 0, 0.28), -7px -7px 18px rgba(255, 255, 255, 0.04)"
        : "7px 7px 18px rgba(15, 23, 42, 0.14), -7px -7px 18px rgba(255, 255, 255, 0.88)",
      md: isDark
        ? "14px 14px 32px rgba(0, 0, 0, 0.34), -12px -12px 28px rgba(255, 255, 255, 0.04)"
        : "14px 14px 32px rgba(15, 23, 42, 0.16), -12px -12px 28px rgba(255, 255, 255, 0.9)",
      control: isDark
        ? "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
        : "inset 0 1px 0 rgba(255, 255, 255, 0.7)",
    };
  }

  if (appearance.shadow === "glow") {
    return {
      sm: "0 10px 30px rgba(59, 130, 246, 0.14)",
      md: "0 24px 70px rgba(59, 130, 246, 0.2)",
      control: "0 8px 22px rgba(59, 130, 246, 0.16)",
    };
  }

  if (appearance.shadow === "paper") {
    return {
      sm: `0 10px 24px rgba(${darkBase}, ${isDark ? 0.24 : 0.07})`,
      md: `0 18px 40px rgba(${darkBase}, ${isDark ? 0.3 : 0.1})`,
      control: "0 1px 0 rgba(255, 255, 255, 0.58)",
    };
  }

  return {
    sm: `0 12px 34px rgba(${darkBase}, ${isDark ? 0.28 : 0.09})`,
    md: `0 22px 58px rgba(${darkBase}, ${isDark ? 0.36 : 0.14})`,
    control: `0 8px 22px rgba(${darkBase}, ${isDark ? 0.22 : 0.08})`,
  };
}

function buildAppBackground(palette, mode, style) {
  const accentGlow = mode === "dark" ? 0.22 : 0.16;
  const surfaceGlow = mode === "dark" ? 0.2 : 0.72;

  if (style === "crystal" || style === "glass") {
    return [
      `radial-gradient(circle at 14% 8%, ${rgbaFrom(palette.accent, accentGlow)}, transparent 30%)`,
      `radial-gradient(circle at 88% 14%, ${rgbaFrom(palette.elevated, surfaceGlow)}, transparent 28%)`,
      `linear-gradient(135deg, ${palette.background}, ${palette.surface})`,
    ].join(", ");
  }

  if (style === "aurora") {
    return [
      `radial-gradient(circle at 18% 12%, ${rgbaFrom(palette.accent, accentGlow)}, transparent 32%)`,
      `radial-gradient(circle at 78% 4%, ${rgbaFrom(palette.textSecondary, 0.14)}, transparent 30%)`,
      `linear-gradient(160deg, ${palette.background}, ${palette.surface})`,
    ].join(", ");
  }

  return `linear-gradient(180deg, ${palette.background}, ${palette.surface})`;
}

function buildThemeTokens(palette, mode, style, appearance, markdown) {
  const shadows = buildShadowToken(appearance, mode);
  const surfaceFilter =
    appearance.blur > 0 ? `blur(${px(appearance.blur)}) saturate(1.16)` : "none";
  const headingIsPanel = ["floating", "soft", "glow"].includes(markdown.headingStyle);
  const tableIsMinimal = markdown.tableStyle === "minimal";
  const taskIsCompact = markdown.taskStyle === "compact";
  const codeIsMinimal = markdown.codeStyle === "minimal";

  return {
    "--bg-primary": palette.background,
    "--bg-secondary": palette.surface,
    "--bg-toolbar": palette.toolbar,
    "--bg-toc": palette.sidebar,
    "--bg-toc-hover": palette.sidebarHover,
    "--bg-toc-active": palette.sidebarActive,
    "--bg-drag": rgbaFrom(palette.background, 0.95),
    "--bg-editor": palette.editor,
    "--text-primary": palette.text,
    "--text-secondary": palette.textSecondary,
    "--text-tertiary": palette.textTertiary,
    "--border-color": palette.border,
    "--border-toolbar": palette.toolbarBorder,
    "--accent-color": palette.accent,
    "--accent-hover": palette.accentHover,
    "--code-bg": palette.codeBackground,
    "--code-text": palette.codeText,
    "--code-border": palette.codeBorder,
    "--blockquote-border": palette.blockquoteBorder,
    "--blockquote-bg": palette.blockquoteBackground,
    "--table-border": palette.tableBorder,
    "--table-stripe": palette.tableStripe,
    "--shadow-sm": shadows.sm,
    "--shadow-md": shadows.md,
    "--scrollbar-thumb": palette.scrollbarThumb,
    "--scrollbar-track": "transparent",
    "--btn-hover": palette.buttonHover,
    "--btn-active": palette.buttonActive,
    "--ai-app-background": buildAppBackground(palette, mode, style),
    "--ai-surface-bg": rgbaFrom(palette.surface, appearance.surfaceOpacity, palette.background),
    "--ai-elevated-bg": rgbaFrom(palette.elevated, appearance.surfaceOpacity, palette.surface),
    "--ai-toolbar-bg": rgbaFrom(palette.toolbar, appearance.chromeOpacity, palette.surface),
    "--ai-sidebar-bg": rgbaFrom(palette.sidebar, appearance.sidebarOpacity, palette.surface),
    "--ai-editor-bg": rgbaFrom(palette.editor, appearance.editorOpacity, palette.surface),
    "--ai-divider-color": rgbaFrom(palette.border, appearance.borderOpacity, palette.textSecondary),
    "--ai-surface-radius": px(appearance.radius),
    "--ai-control-radius": px(appearance.controlRadius),
    "--ai-card-radius": px(appearance.cardRadius),
    "--ai-border-width": appearance.borderOpacity < 0.2 ? "0" : "1px",
    "--ai-surface-filter": surfaceFilter,
    "--ai-control-shadow": shadows.control,
    "--ai-scrollbar-size": appearance.controlRadius >= 10 ? "10px" : "8px",
    "--ai-button-bg":
      appearance.buttonStyle === "plain" ? "transparent" : rgbaFrom(palette.surface, 0.42, palette.background),
    "--ai-button-hover-bg":
      appearance.buttonStyle === "solid" ? palette.accent : palette.buttonHover,
    "--ai-button-active-bg":
      appearance.buttonStyle === "solid" ? palette.accent : palette.buttonActive,
    "--ai-button-border": rgbaFrom(palette.border, Math.max(0.18, appearance.borderOpacity), palette.textSecondary),
    "--ai-primary-button-text": mode === "dark" ? "#08111f" : "#ffffff",
    "--ai-markdown-surface": rgbaFrom(palette.surface, markdown.surfaceOpacity, palette.background),
    "--ai-markdown-heading-bg": headingIsPanel
      ? rgbaFrom(palette.accent, mode === "dark" ? 0.14 : 0.08)
      : "transparent",
    "--ai-markdown-heading-border":
      markdown.headingStyle === "clean"
        ? "transparent"
        : rgbaFrom(palette.accent, mode === "dark" ? 0.42 : 0.28),
    "--ai-markdown-heading-padding": headingIsPanel ? "0.36em 0.58em" : "0 0 0.34em",
    "--ai-markdown-heading-radius": px(markdown.headingRadius),
    "--ai-markdown-heading-shadow": markdown.headingStyle === "glow" ? shadows.control : "none",
    "--ai-markdown-code-bg": codeIsMinimal
      ? rgbaFrom(palette.codeBackground, 0.08, palette.surface)
      : palette.codeBackground,
    "--ai-markdown-code-text": palette.codeText,
    "--ai-markdown-code-border": codeIsMinimal ? "transparent" : palette.codeBorder,
    "--ai-markdown-code-radius": px(markdown.blockRadius),
    "--ai-markdown-block-bg": rgbaFrom(palette.blockquoteBackground, markdown.surfaceOpacity, palette.surface),
    "--ai-markdown-block-radius": px(markdown.blockRadius),
    "--ai-markdown-table-bg": tableIsMinimal
      ? "transparent"
      : rgbaFrom(palette.surface, markdown.surfaceOpacity, palette.background),
    "--ai-markdown-table-header-bg": rgbaFrom(palette.accent, mode === "dark" ? 0.16 : 0.08),
    "--ai-markdown-table-radius": px(markdown.tableRadius),
    "--ai-markdown-table-shadow": tableIsMinimal ? "none" : shadows.sm,
    "--ai-markdown-task-bg": taskIsCompact
      ? "transparent"
      : rgbaFrom(palette.surface, markdown.surfaceOpacity, palette.background),
    "--ai-markdown-task-pending-bg": taskIsCompact
      ? "transparent"
      : rgbaFrom("#b45309", mode === "dark" ? 0.18 : 0.1),
    "--ai-markdown-task-complete-bg": taskIsCompact
      ? "transparent"
      : rgbaFrom(palette.accent, mode === "dark" ? 0.16 : 0.1),
    "--ai-markdown-task-radius": px(markdown.taskRadius),
    "--ai-markdown-task-shadow": taskIsCompact ? "none" : shadows.sm,
    "--ai-markdown-image-radius": px(markdown.imageRadius),
    "--ai-markdown-image-shadow":
      markdown.imageStyle === "floating" || markdown.imageStyle === "raised" ? shadows.sm : "none",
  };
}

function sanitizeCssVarValue(value) {
  const text = String(value || "").trim();
  if (!text || isUnsafeCssValue(text)) {
    return "";
  }
  return text;
}

function normalizeSmartTheme(rawTheme) {
  if (!rawTheme || typeof rawTheme !== "object") {
    return null;
  }

  const paletteSource = rawTheme.palette || rawTheme.colors || {};
  const mode = normalizeMode(rawTheme.mode, paletteSource);
  const style = normalizeStyle(rawTheme.style);
  const palette = normalizePalette(paletteSource, mode);
  const appearance = normalizeAppearance(
    rawTheme.appearance || rawTheme.ui || rawTheme.interface || {},
    style
  );
  const markdown = normalizeMarkdown(rawTheme.markdown || {}, style, appearance);

  return {
    id: sanitizeSmartThemeId(rawTheme.id) || createSmartThemeId(),
    name: safeText(rawTheme.name, "AI 主题", MAX_THEME_NAME_LENGTH),
    description: safeText(
      rawTheme.description,
      `${STYLE_LABELS[style] || "智能"}风格配色`,
      MAX_THEME_DESCRIPTION_LENGTH
    ),
    mode,
    style,
    palette,
    appearance,
    markdown,
    tokens: buildThemeTokens(palette, mode, style, appearance, markdown),
    sourcePrompt: safeText(rawTheme.sourcePrompt, "", MAX_THEME_SOURCE_PROMPT_LENGTH),
    createdAt: rawTheme.createdAt || new Date().toISOString(),
  };
}

export function createSmartThemeFromAI(rawResponse, sourcePrompt = "") {
  const payload = parseThemePayload(rawResponse);
  return normalizeSmartTheme({
    ...payload,
    id: createSmartThemeId(),
    sourcePrompt,
    createdAt: new Date().toISOString(),
  });
}

export function loadSmartThemes() {
  try {
    const raw = localStorage.getItem(SMART_THEME_STORAGE_KEY);
    const themes = raw ? JSON.parse(raw) : [];
    return Array.isArray(themes)
      ? themes.map(normalizeSmartTheme).filter(Boolean).slice(0, MAX_STORED_SMART_THEMES)
      : [];
  } catch (error) {
    console.warn("加载智能主题失败，已回退为空列表", error);
    return [];
  }
}

export function saveSmartThemes(themes) {
  try {
    const normalizedThemes = (Array.isArray(themes) ? themes : [])
      .map(normalizeSmartTheme)
      .filter(Boolean)
      .slice(0, MAX_STORED_SMART_THEMES);
    localStorage.setItem(
      SMART_THEME_STORAGE_KEY,
      JSON.stringify(normalizedThemes)
    );
  } catch (error) {
    console.warn("保存智能主题失败", error);
  }
}

export function isSmartThemeId(themeId) {
  return String(themeId || "").startsWith(SMART_THEME_PREFIX);
}

function normalizeSmartThemePromptHistoryItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const prompt = String(rawItem.prompt || "").trim().slice(0, MAX_THEME_PROMPT_LENGTH);
  const createdAt = String(rawItem.createdAt || "");

  return {
    id: String(rawItem.id || createPromptHistoryId()),
    prompt,
    createdAt: createdAt || new Date().toISOString(),
  };
}

function normalizeSmartThemePromptHistory(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSmartThemePromptHistoryItem)
    .filter(Boolean)
    .slice(0, MAX_STORED_SMART_THEME_PROMPTS);
}

export function loadSmartThemePromptHistory() {
  try {
    const raw = localStorage.getItem(SMART_THEME_PROMPT_HISTORY_STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return normalizeSmartThemePromptHistory(items);
  } catch (error) {
    console.warn("加载智能主题生成历史失败，已回退为空列表", error);
    return [];
  }
}

export function saveSmartThemePromptHistory(items) {
  try {
    const normalizedItems = normalizeSmartThemePromptHistory(items);
    localStorage.setItem(
      SMART_THEME_PROMPT_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizedItems)
    );
    return normalizedItems;
  } catch (error) {
    console.warn("保存智能主题生成历史失败", error);
    return normalizeSmartThemePromptHistory(items);
  }
}

export function rememberSmartThemePrompt(items, prompt) {
  const normalizedPrompt = String(prompt || "").trim().slice(0, MAX_THEME_PROMPT_LENGTH);
  const normalizedItems = normalizeSmartThemePromptHistory(items);
  const dedupedItems = normalizedItems.filter((item) => item.prompt !== normalizedPrompt);

  return [
    {
      id: createPromptHistoryId(),
      prompt: normalizedPrompt,
      createdAt: new Date().toISOString(),
    },
    ...dedupedItems,
  ].slice(0, MAX_STORED_SMART_THEME_PROMPTS);
}

export function createSmartThemeStyleSheet(themes) {
  return (Array.isArray(themes) ? themes : [])
    .map(normalizeSmartTheme)
    .filter(Boolean)
    .slice(0, MAX_STORED_SMART_THEMES)
    .map((theme) => {
      const variables = Object.entries(theme.tokens)
        .map(([key, value]) => {
          const safeValue = sanitizeCssVarValue(value);
          return /^--[a-z0-9-]+$/i.test(key) && safeValue ? `  ${key}: ${safeValue};` : "";
        })
        .filter(Boolean)
        .join("\n");

      return `[data-theme="${theme.id}"] {\n${variables}\n}`;
    })
    .join("\n\n");
}

export function getSmartThemeWindowColor(theme) {
  const rgb = hexToRgb(theme?.palette?.background || theme?.tokens?.["--bg-primary"]);
  if (rgb) {
    return rgb;
  }

  return theme?.mode === "dark" ? { r: 11, g: 17, b: 32 } : { r: 247, g: 249, b: 252 };
}

export function getSmartThemeStyleLabel(style) {
  return STYLE_LABELS[style] || "智能";
}
