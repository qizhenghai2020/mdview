export const STYLE_CONFIG_STORAGE_KEY = "md-viewer.style-config";
export const STYLE_PANEL_STORAGE_KEY = "md-viewer.style-panel-state";

export const ELEMENT_TABS = [
  { key: "global", label: "整体" },
  { key: "h1", label: "H1" },
  { key: "h2", label: "H2" },
  { key: "h3", label: "H3" },
  { key: "p", label: "正文" },
  { key: "strong", label: "加粗" },
  { key: "em", label: "斜体" },
  { key: "a", label: "链接" },
  { key: "taskPending", label: "任务待办" },
  { key: "taskComplete", label: "任务完成" },
  { key: "taskBadgePending", label: "状态待办" },
  { key: "taskBadgeComplete", label: "状态完成" },
];

export const FONT_OPTIONS = [
  {
    value: "inherit",
    label: "跟随主题",
    stack: "inherit",
  },
  {
    value: "segoe-ui",
    label: "Segoe UI（Windows）",
    stack: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
  },
  {
    value: "microsoft-yahei",
    label: "微软雅黑（Windows）",
    stack: '"Microsoft YaHei", "Microsoft YaHei UI", sans-serif',
  },
  {
    value: "dengxian",
    label: "等线（Windows）",
    stack: '"DengXian", "Microsoft YaHei", sans-serif',
  },
  {
    value: "simsun",
    label: "宋体（Windows）",
    stack: '"SimSun", "NSimSun", serif',
  },
  {
    value: "fangsong",
    label: "仿宋（Windows）",
    stack: '"FangSong", "STFangsong", serif',
  },
  {
    value: "kaiti",
    label: "楷体（Windows）",
    stack: '"KaiTi", "STKaiti", serif',
  },
  {
    value: "simhei",
    label: "黑体（Windows）",
    stack: '"SimHei", "Microsoft YaHei", sans-serif',
  },
  {
    value: "arial",
    label: "Arial（Windows）",
    stack: 'Arial, "Helvetica Neue", sans-serif',
  },
  {
    value: "calibri",
    label: "Calibri（Windows）",
    stack: 'Calibri, "Segoe UI", sans-serif',
  },
  {
    value: "georgia",
    label: "Georgia（Windows）",
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    value: "times-new-roman",
    label: "Times New Roman（Windows）",
    stack: '"Times New Roman", "SimSun", serif',
  },
  {
    value: "consolas",
    label: "Consolas（Windows）",
    stack: 'Consolas, "Courier New", monospace',
  },
  {
    value: "noto-sans-sc",
    label: "Noto Sans SC（思源黑体风格）",
    stack: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  },
  {
    value: "noto-serif-sc",
    label: "Noto Serif SC（思源宋体风格）",
    stack: '"Noto Serif SC", "SimSun", serif',
  },
  {
    value: "alibaba-puhuiti-3",
    label: "阿里巴巴普惠体 3.0（自带）",
    stack: '"Alibaba PuHuiTi 3.0", "Microsoft YaHei", sans-serif',
  },
];

export const COLOR_PRESETS = [
  {
    name: "皇家蓝",
    colors: {
      h1: "#1d4ed8",
      h2: "#2563eb",
      h3: "#3b82f6",
      p: "#334155",
      strong: "#1e3a8a",
      a: "#2563eb",
    },
  },
  {
    name: "青绿松石",
    colors: {
      h1: "#0f766e",
      h2: "#0d9488",
      h3: "#14b8a6",
      p: "#374151",
      strong: "#115e59",
      a: "#0f766e",
    },
  },
  {
    name: "赤陶暖棕",
    colors: {
      h1: "#9a3412",
      h2: "#c2410c",
      h3: "#ea580c",
      p: "#3f3f46",
      strong: "#7c2d12",
      a: "#c2410c",
    },
  },
  {
    name: "石墨灰",
    colors: {
      h1: "#111827",
      h2: "#1f2937",
      h3: "#374151",
      p: "#4b5563",
      strong: "#111827",
      a: "#4f46e5",
    },
  },
  {
    name: "酒红典雅",
    colors: {
      h1: "#7f1d1d",
      h2: "#991b1b",
      h3: "#b91c1c",
      p: "#3f3f46",
      strong: "#7f1d1d",
      a: "#991b1b",
    },
  },
  {
    name: "森林苔绿",
    colors: {
      h1: "#14532d",
      h2: "#166534",
      h3: "#16a34a",
      p: "#374151",
      strong: "#14532d",
      a: "#15803d",
    },
  },
  {
    name: "暮光紫",
    colors: {
      h1: "#5b21b6",
      h2: "#6d28d9",
      h3: "#8b5cf6",
      p: "#334155",
      strong: "#4c1d95",
      a: "#7c3aed",
    },
  },
  {
    name: "琥珀金",
    colors: {
      h1: "#a16207",
      h2: "#ca8a04",
      h3: "#eab308",
      p: "#44403c",
      strong: "#854d0e",
      a: "#ca8a04",
    },
  },
];

export function createInheritedStyle() {
  return {
    color: "inherit",
    fontFamily: "inherit",
    bold: "inherit",
    italic: "inherit",
  };
}

export function createDefaultStyleConfig() {
  return {
    contentWidth: null,
    paddingHorizontal: null,
    paddingVertical: null,
    bodySize: null,
    h1Size: null,
    h2Size: null,
    h3Size: null,
    h4Size: null,
    h5Size: null,
    h6Size: null,
    global: createInheritedStyle(),
    h1: createInheritedStyle(),
    h2: createInheritedStyle(),
    h3: createInheritedStyle(),
    p: createInheritedStyle(),
    strong: createInheritedStyle(),
    em: createInheritedStyle(),
    a: createInheritedStyle(),
    taskPending: createInheritedStyle(),
    taskComplete: createInheritedStyle(),
    taskBadgePending: createInheritedStyle(),
    taskBadgeComplete: createInheritedStyle(),
  };
}

export function createDefaultStylePanelState() {
  return {
    visible: false,
    visibilityTouched: false,
    activeTab: "global",
    sections: {
      theme: true,
      spacing: true,
      sizes: true,
      presets: true,
      overrides: true,
    },
  };
}

export function resolveThemeMetricFallback(themeId) {
  if (themeId === "elegant") {
    return {
      contentWidth: 920,
      paddingHorizontal: 24,
      paddingVertical: 20,
      bodySize: 16,
      h1Size: 38,
      h2Size: 28,
      h3Size: 20,
      h4Size: 16,
      h5Size: 14,
      h6Size: 13,
    };
  }

  return {
    contentWidth: 1100,
    paddingHorizontal: 20,
    paddingVertical: 20,
    bodySize: 16,
    h1Size: 32,
    h2Size: 24,
    h3Size: 20,
    h4Size: 16,
    h5Size: 14,
    h6Size: 13,
  };
}

export function resolveFontStack(fontKey) {
  const matched = FONT_OPTIONS.find((option) => option.value === fontKey);
  return matched ? matched.stack : "inherit";
}
