<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { marked } from "marked";
import hljs from "highlight.js";
import mermaid from "mermaid";
import StyleConfigPanel from "./style-config/StyleConfigPanel.vue";
import SmartThemePromptModal from "./style-config/SmartThemePromptModal.vue";
import LiveEditSurface from "./live-edit/LiveEditSurface.vue";
import { useStyleConfigPlugin } from "./style-config/useStyleConfigPlugin";
import SettingsModal from "./settings/SettingsModal.vue";
import { DEFAULT_APP_SETTINGS } from "./settings/constants";
import { useAppSettings } from "./settings/useAppSettings";
import SmartFormatFailureModal from "./ai/SmartFormatFailureModal.vue";
import SmartFormatPromptModal from "./ai/SmartFormatPromptModal.vue";
import SmartFormatPreviewModal from "./ai/SmartFormatPreviewModal.vue";
import FileConflictModal from "./file-sync/FileConflictModal.vue";
import FileTree from "./file-explorer/FileTree.vue";
import {
  createSmartThemeFromAI,
  createSmartThemeStyleSheet,
  getSmartThemeWindowColor,
  isSmartThemeId,
  loadSmartThemePromptHistory,
  loadSmartThemes,
  rememberSmartThemePrompt,
  saveSmartThemePromptHistory,
  saveSmartThemes,
} from "./style-config/smartThemes";

// 检测是否在 Wails 环境中运行
const isWailsEnv = typeof window !== "undefined" && window.go && window.go.main;

// Wails API 引用
let EventsOnFunc,
  EventsOffFunc,
  OnFileDropFunc,
  OnFileDropOffFunc,
  WindowMinimiseFunc,
  WindowToggleMaximiseFunc,
  WindowIsMaximisedFunc,
  WindowSetDarkThemeFunc,
  WindowSetLightThemeFunc,
  WindowSetBackgroundColourFunc,
  QuitFunc;
let OpenFileDialogFunc,
  OpenFilesDialogFunc,
  OpenDirectoryDialogFunc,
  BuildFileWorkspaceFunc,
  ReadFileFunc,
  GetFileNameFunc,
  GetFilePathFunc,
  ResolveImagePathFunc,
  ReadImageAsBase64Func,
  GetStartupFileFunc,
  ReadFileAndUpdateWatchFunc,
  WriteFileFunc,
  FormatMarkdownWithAIFunc,
  GenerateThemeWithAIFunc,
  TestAIModelFunc;

if (isWailsEnv) {
  try {
    EventsOnFunc = window.runtime.EventsOn;
    EventsOffFunc = window.runtime.EventsOff;
    OnFileDropFunc = window.runtime.OnFileDrop;
    OnFileDropOffFunc = window.runtime.OnFileDropOff;
    WindowMinimiseFunc = window.runtime.WindowMinimise;
    WindowToggleMaximiseFunc = window.runtime.WindowToggleMaximise;
    WindowIsMaximisedFunc = window.runtime.WindowIsMaximised;
    WindowSetDarkThemeFunc = window.runtime.WindowSetDarkTheme;
    WindowSetLightThemeFunc = window.runtime.WindowSetLightTheme;
    WindowSetBackgroundColourFunc = window.runtime.WindowSetBackgroundColour;
    QuitFunc = window.runtime.Quit;
    OpenFileDialogFunc = window.go.main.App.OpenFileDialog;
    OpenFilesDialogFunc = window.go.main.App.OpenFilesDialog;
    OpenDirectoryDialogFunc = window.go.main.App.OpenDirectoryDialog;
    BuildFileWorkspaceFunc = window.go.main.App.BuildFileWorkspace;
    ReadFileFunc = window.go.main.App.ReadFile;
    GetFileNameFunc = window.go.main.App.GetFileName;
    GetFilePathFunc = window.go.main.App.GetFilePath;
    ResolveImagePathFunc = window.go.main.App.ResolveImagePath;
    ReadImageAsBase64Func = window.go.main.App.ReadImageAsBase64;
    GetStartupFileFunc = window.go.main.App.GetStartupFile;
    ReadFileAndUpdateWatchFunc = window.go.main.App.ReadFileAndUpdateWatch;
    WriteFileFunc = window.go.main.App.WriteFile;
    FormatMarkdownWithAIFunc = window.go.main.App.FormatMarkdownWithAI;
    GenerateThemeWithAIFunc = window.go.main.App.GenerateThemeWithAI;
    TestAIModelFunc = window.go.main.App.TestAIModel;
  } catch (e) {
    console.warn("加载 Wails API 失败:", e);
  }
}

// 封装 Wails API 调用
function EventsOn(eventName, callback) {
  if (EventsOnFunc) return EventsOnFunc(eventName, callback);
}
function EventsOff(eventName) {
  if (EventsOffFunc) return EventsOffFunc(eventName);
}
function OnFileDrop(callback, useDropTarget = false) {
  if (OnFileDropFunc) return OnFileDropFunc(callback, useDropTarget);
}
function OnFileDropOff() {
  if (OnFileDropOffFunc) return OnFileDropOffFunc();
}
function OpenFileDialog() {
  if (OpenFileDialogFunc) return OpenFileDialogFunc();
}
function OpenFilesDialog() {
  if (OpenFilesDialogFunc) return OpenFilesDialogFunc();
}
function OpenDirectoryDialog() {
  if (OpenDirectoryDialogFunc) return OpenDirectoryDialogFunc();
}
function BuildFileWorkspace(paths) {
  if (BuildFileWorkspaceFunc) return BuildFileWorkspaceFunc(paths);
}
function ReadFile(path) {
  if (ReadFileFunc) return ReadFileFunc(path);
}
function GetFileName() {
  if (GetFileNameFunc) return GetFileNameFunc();
}
function GetFilePath() {
  if (GetFilePathFunc) return GetFilePathFunc();
}
function ResolveImagePath(src) {
  if (ResolveImagePathFunc) return ResolveImagePathFunc(src);
}
function ReadImageAsBase64(path) {
  if (ReadImageAsBase64Func) return ReadImageAsBase64Func(path);
}
function GetStartupFile() {
  if (GetStartupFileFunc) return GetStartupFileFunc();
}
function ReadFileAndUpdateWatch(path) {
  if (ReadFileAndUpdateWatchFunc) return ReadFileAndUpdateWatchFunc(path);
}
function WriteFile(path, content) {
  if (WriteFileFunc) return WriteFileFunc(path, content);
}
function FormatMarkdownWithAI(request) {
  if (FormatMarkdownWithAIFunc) return FormatMarkdownWithAIFunc(request);
}
function GenerateThemeWithAI(request) {
  if (GenerateThemeWithAIFunc) return GenerateThemeWithAIFunc(request);
  return Promise.reject(new Error("请在桌面应用中生成智能主题"));
}
function TestAIModel(model) {
  if (TestAIModelFunc) return TestAIModelFunc(model);
  return Promise.reject(new Error("请在桌面应用中测试模型"));
}

const { settings: appSettings } = useAppSettings();

function readPreference(key) {
  return appSettings.value.persistence[key]
    ? appSettings.value[key]
    : DEFAULT_APP_SETTINGS[key];
}

const markdownContent = ref("");
const editedContent = ref("");
const originalContent = ref(""); // 用于保存原始内容，判断是否有修改
const renderedHtml = ref("");
const fileName = ref("未打开文件");
const filePath = ref("");
const workspaceRoots = ref([]);
const workspaceFileCount = ref(0);
const expandedTreePaths = ref(new Set());
const sidebarSection = ref("outline");
const isDark = ref(false);
const showToc = ref(readPreference("showToc"));
const tocItems = ref([]);
const activeTocId = ref("");
const isDragging = ref(false);
const zoomLevel = ref(readPreference("zoom"));
const browserZoomLevel = ref(100);
const TOOLBAR_HEIGHT = 44;
const currentTheme = ref(readPreference("theme"));
const viewMode = ref(readPreference("viewMode")); // 'preview' | 'split' | 'live'
const editorRef = ref(null);
const previewRef = ref(null);
const liveEditorRef = ref(null);
const splitContainerRef = ref(null);
const browserViewportWidth = ref(getBrowserViewportWidth());
const browserViewportHeight = ref(getBrowserViewportHeight());
const mermaidIdCounter = ref(0);
const isExternalChange = ref(false);
const isSaving = ref(false); // 保存中状态
const editHistory = ref([]); // 编辑历史，用于撤销
const historyIndex = ref(-1); // 当前历史位置
const MAX_HISTORY = 50; // 最大历史记录数
const isLoading = ref(false); // 文档加载状态
const loadingText = ref("加载中..."); // 加载提示文字
const showSettingsModal = ref(false);
const settingsInitialSection = ref("general");
const externalConflictContent = ref(null);
const showFileConflictModal = ref(false);
const isResolvingFileConflict = ref(false);
const isWindowMaximized = ref(false);
const isSmartFormatting = ref(false);
const showSmartFormatFailure = ref(false);
const showSmartFormatPrompt = ref(false);
const showSmartFormatPreview = ref(false);
const showSmartThemePrompt = ref(false);
const isGeneratingSmartTheme = ref(false);
const smartFormatError = ref("");
const smartFormatRetryModelId = ref("");
const smartFormatOriginalContent = ref("");
const smartFormatCandidateContent = ref("");
const smartFormatInstruction = ref("");
const smartThemePrompt = ref("");
const imageBase64Cache = new Map();
const MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;
const MAX_IMAGE_BASE64_CACHE_ENTRIES = 48;
let imageProcessingToken = 0;
const smartThemes = ref(loadSmartThemes());
const smartThemePromptHistory = ref(loadSmartThemePromptHistory());
const MARKDOWN_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkdn",
  ".mkd",
  ".mdwn",
]);
const LIVE_EDIT_PLACEHOLDER = "在此实时编辑 Markdown 内容...";
const VIEW_MODE_TABS = [
  { mode: "preview", label: "预览", title: "切换到预览模式" },
  { mode: "live", label: "编辑", title: "切换到可视化编辑模式" },
  { mode: "split", label: "分栏", title: "切换到分栏编辑模式" },
];

// 目录宽度相关
const tocWidth = ref(readPreference("tocWidth"));
const isResizingToc = ref(false);
const tocMinWidth = 120;
const tocMaxWidth = 500;
const splitMinPercent = 20;
const splitMaxPercent = 80;
const splitEditorWidth = ref(readPreference("splitWidth"));
const isResizingSplit = ref(false);
const splitContainerStyle = computed(() => ({
  "--split-editor-width": `${splitEditorWidth.value}%`,
}));
const hasWorkspaceFiles = computed(() => workspaceFileCount.value > 0);
const shouldShowSidebar = computed(
  () => showToc.value && (hasWorkspaceFiles.value || tocItems.value.length > 0)
);
const isMarkdownDocument = computed(() => {
  if (!filePath.value && fileName.value === "未打开文件") {
    return true;
  }
  return MARKDOWN_EXTENSIONS.has(getFileExtension(filePath.value || fileName.value));
});
const editorPlaceholder = computed(() =>
  isMarkdownDocument.value ? "在此输入 Markdown 内容..." : "在此编辑文本内容..."
);

const {
  styleConfig,
  panelState: stylePanelState,
  effectiveMetrics: styleConfigMetrics,
  styleConfigVars,
  hasCustomStyleConfig,
  resetStyleConfig,
} = useStyleConfigPlugin(currentTheme, zoomLevel);

function getBrowserViewportWidth() {
  if (typeof window === "undefined") {
    return 1280;
  }

  return Math.max(window.innerWidth || document.documentElement.clientWidth || 0, 1);
}

function getBrowserViewportHeight() {
  if (typeof window === "undefined") {
    return 800;
  }

  return Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 1);
}

function syncBrowserZoomViewport() {
  browserViewportWidth.value = getBrowserViewportWidth();
  browserViewportHeight.value = getBrowserViewportHeight();
}

const appContainerStyle = computed(() => {
  const scale = browserZoomLevel.value / 100;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const viewportWidth = Math.max(browserViewportWidth.value, 1);
  const viewportHeight = Math.max(browserViewportHeight.value, 1);
  const contentHeight = Math.max(viewportHeight - TOOLBAR_HEIGHT, 0);

  return {
    ...styleConfigVars.value,
    "--browser-zoom-scale": String(safeScale),
    "--browser-zoom-viewport-width": `${viewportWidth / safeScale}px`,
    "--browser-zoom-viewport-height": `${viewportHeight / safeScale}px`,
    "--browser-zoom-content-height": `${contentHeight / safeScale}px`,
  };
});

const enabledSmartFormatModels = computed(() =>
  appSettings.value.models.filter(
    (model) => model.enabled && model.verified && model.testStatus === "passed"
  )
);

const activeSmartFormatModel = computed(() => {
  return (
    enabledSmartFormatModels.value.find(
      (model) => model.id === appSettings.value.activeModelId
    ) ||
    enabledSmartFormatModels.value[0] ||
    null
  );
});

function persistPreference(key, value) {
  if (appSettings.value.persistence[key]) {
    appSettings.value[key] = value;
  }
}

function syncEnabledPreferences() {
  const preferenceValues = {
    theme: currentTheme.value,
    zoom: zoomLevel.value,
    viewMode: viewMode.value,
    showToc: showToc.value,
    tocWidth: tocWidth.value,
    splitWidth: splitEditorWidth.value,
  };

  for (const [key, value] of Object.entries(preferenceValues)) {
    if (appSettings.value.persistence[key]) {
      appSettings.value[key] = value;
    } else {
      appSettings.value[key] = DEFAULT_APP_SETTINGS[key];
    }
  }
}

watch(
  () => appSettings.value.persistence,
  () => {
    syncEnabledPreferences();
  },
  { deep: true }
);

watch(currentTheme, (value) => persistPreference("theme", value));
watch(zoomLevel, (value) => persistPreference("zoom", value));
watch(viewMode, (value) => persistPreference("viewMode", value));
watch(showToc, (value) => persistPreference("showToc", value));
watch(tocWidth, (value) => persistPreference("tocWidth", value));
watch(splitEditorWidth, (value) => persistPreference("splitWidth", value));
watch(
  smartThemePromptHistory,
  (value) => {
    saveSmartThemePromptHistory(value);
  },
  { deep: true }
);

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  flowchart: { useMaxWidth: true },
  sequence: { useMaxWidth: true },
});

// 配置 marked
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (_) {}
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

// 自定义 renderer
const renderer = new marked.Renderer();

renderer.image = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : "";
  return `<img src="${href}" alt="${text}"${titleAttr} style="max-width:100%;" loading="lazy" />`;
};

// 处理代码块 - 支持多种图表
renderer.code = function ({ text, lang }) {
  // Mermaid 图表
  if (lang === "mermaid") {
    const id = `mermaid-${mermaidIdCounter.value++}`;
    return `<div class="mermaid-wrapper" data-mermaid-id="${id}"><pre class="mermaid">${text}</pre></div>`;
  }
  // Flowchart.js
  if (lang === "flowchart" || lang === "flow") {
    return `<div class="flowchart-wrapper"><pre class="flowchart">${text}</pre></div>`;
  }
  // Chart.js 数据
  if (lang === "chart") {
    return `<div class="chart-wrapper"><pre class="chart-data">${text}</pre></div>`;
  }
  // PlantUML (需要服务端渲染，这里显示为代码)
  if (lang === "plantuml" || lang === "puml") {
    return `<div class="plantuml-wrapper"><pre class="plantuml">${text}</pre></div>`;
  }
  // 普通代码块
  const highlighted =
    lang && hljs.getLanguage(lang)
      ? hljs.highlight(text, { language: lang }).value
      : hljs.highlightAuto(text).value;
  return `<pre class="code-block"><code class="hljs language-${
    lang || "auto"
  }">${highlighted}</code></pre>`;
};

// 计算纯文本长度（去除HTML标签）
function getPlainTextLength(html) {
  return html.replace(/<[^>]*>/g, "").length;
}

// 表格包裹 - 智能列宽分配
renderer.table = function ({ header, rows }) {
  const colCount = header.length;
  if (colCount === 0) return "";

  // 计算每列的最大内容长度（包括表头）
  const colMaxLengths = header.map((cell, i) => {
    const text = this.parser.parseInline(cell.tokens);
    return getPlainTextLength(text);
  });

  // 遍历所有行，找出每列的最大长度
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      if (i < colCount) {
        const text = this.parser.parseInline(cell.tokens);
        colMaxLengths[i] = Math.max(colMaxLengths[i], getPlainTextLength(text));
      }
    });
  });

  // 计算总长度
  const totalLength = colMaxLengths.reduce((a, b) => a + b, 0);

  // 生成分配的宽度百分比
  // 策略：按内容长度比例分配，但给短内容列一个最小比例保证
  const minWidthPercent = 8; // 每列最小8%
  const remainingPercent = 100 - minWidthPercent * colCount;

  let colWidths;
  if (remainingPercent <= 0) {
    // 列数太多，均分
    colWidths = colMaxLengths.map(() => 100 / colCount);
  } else {
    colWidths = colMaxLengths.map((len) => {
      const ratio = len / totalLength;
      return minWidthPercent + ratio * remainingPercent;
    });
  }

  const headerCells = header
    .map((cell, i) => {
      const text = this.parser.parseInline(cell.tokens);
      const align = cell.align ? `text-align:${cell.align};` : "";
      const width = `width:${colWidths[i].toFixed(1)}%;`;
      return `<th style="${width}${align}">${text}</th>`;
    })
    .join("");

  const bodyHtml = rows
    .map((row) => {
      const cells = row
        .map((cell, i) => {
          const text = this.parser.parseInline(cell.tokens);
          const align = cell.align ? `text-align:${cell.align};` : "";
          return `<td style="${align}">${text}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div class="table-border"><div class="table-scroll"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyHtml}</tbody></table></div></div>`;
};

// TOC 提取
let headings = [];
let headingCounter = {};
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const slug = text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let id = slug;
  if (headingCounter[slug]) {
    headingCounter[slug]++;
    id = `${slug}-${headingCounter[slug]}`;
  } else {
    headingCounter[slug] = 1;
  }
  headings.push({ id, text, level: depth });
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};

function enhanceTaskListHtml(html) {
  if (typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<div class="markdown-root">${html}</div>`,
    "text/html"
  );
  const root = doc.body.firstElementChild;

  if (!root) {
    return html;
  }

  const listItems = root.querySelectorAll("li");

  listItems.forEach((item) => {
    const directCheckbox = Array.from(item.children).find((child) => {
      return child.tagName === "INPUT" && child.getAttribute("type") === "checkbox";
    });

    if (!directCheckbox) {
      return;
    }

    const isComplete = directCheckbox.hasAttribute("checked");
    const parentList = item.parentElement;

    item.classList.add("task-list-item");
    item.classList.add(isComplete ? "is-complete" : "is-pending");
    item.setAttribute("data-task-state", isComplete ? "complete" : "pending");
    directCheckbox.classList.add("task-list-checkbox");
    directCheckbox.setAttribute("aria-hidden", "true");

    if (parentList && (parentList.tagName === "UL" || parentList.tagName === "OL")) {
      parentList.classList.add("task-list");
    }

    const statusBadge = doc.createElement("span");
    statusBadge.className = "task-status-badge";
    statusBadge.textContent = isComplete ? "已完成" : "待执行";

    const content = doc.createElement("div");
    content.className = "task-list-content";

    const nodesToMove = Array.from(item.childNodes).filter(
      (node) => node !== directCheckbox
    );
    nodesToMove.forEach((node) => {
      content.appendChild(node);
    });

    const firstNode = content.firstChild;
    if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
      firstNode.textContent = firstNode.textContent.replace(/^\s+/, "");
    }

    item.appendChild(statusBadge);
    item.appendChild(content);
  });

  return root.innerHTML;
}

// 渲染 Markdown
async function renderMarkdown() {
  headings = [];
  headingCounter = {};
  mermaidIdCounter.value = 0;

  if (!isMarkdownDocument.value) {
    renderedHtml.value = "";
    tocItems.value = [];
    return;
  }

  const html = marked(markdownContent.value, { renderer });
  renderedHtml.value = enhanceTaskListHtml(html);
  tocItems.value = [...headings];

  // 渲染 Mermaid 图表
  await nextTick();
  await renderMermaidCharts();
}

// 渲染 Mermaid 图表
async function renderMermaidCharts() {
  const mermaidElements = document.querySelectorAll(".mermaid-wrapper pre.mermaid");
  for (const el of mermaidElements) {
    try {
      const id = el.parentElement.getAttribute("data-mermaid-id");
      const graphDefinition = el.textContent;
      const { svg } = await mermaid.render(id, graphDefinition);
      el.parentElement.innerHTML = svg;
    } catch (e) {
      console.warn("Mermaid 渲染失败:", e);
      el.parentElement.innerHTML = `<pre class="mermaid-error">图表渲染失败: ${e.message}</pre>`;
    }
  }
}

// 监听内容变化
watch(markdownContent, () => {
  renderMarkdown();
});

watch(isMarkdownDocument, () => {
  renderMarkdown();
});

watch(
  [() => tocItems.value.length, hasWorkspaceFiles],
  ([outlineCount, hasFiles]) => {
    if (sidebarSection.value === "outline" && !outlineCount && hasFiles) {
      sidebarSection.value = "files";
    } else if (sidebarSection.value === "files" && !hasFiles && outlineCount) {
      sidebarSection.value = "outline";
    }
  }
);

// 判断是否有未保存的修改
const hasChanges = computed(() => {
  return editedContent.value !== originalContent.value;
});

const hasFileConflict = computed(() => externalConflictContent.value !== null);
const hasDocumentContent = computed(() =>
  Boolean((editedContent.value || markdownContent.value || "").trim())
);

// 添加编辑历史记录
function addToHistory(content) {
  // 如果当前不在历史末尾，删除后面的历史
  if (historyIndex.value < editHistory.value.length - 1) {
    editHistory.value = editHistory.value.slice(0, historyIndex.value + 1);
  }
  // 添加新历史
  editHistory.value.push(content);
  // 限制历史记录数量
  if (editHistory.value.length > MAX_HISTORY) {
    editHistory.value.shift();
  }
  historyIndex.value = editHistory.value.length - 1;
}

// 撤销
function undo() {
  if (historyIndex.value > 0) {
    historyIndex.value--;
    editedContent.value = editHistory.value[historyIndex.value];
    markdownContent.value = editedContent.value;
  }
}

// 重做
function redo() {
  if (historyIndex.value < editHistory.value.length - 1) {
    historyIndex.value++;
    editedContent.value = editHistory.value[historyIndex.value];
    markdownContent.value = editedContent.value;
  }
}

function resetEditedContent() {
  if (!hasChanges.value) {
    return;
  }

  const shouldReset = window.confirm(
    `确定放弃当前未保存修改，并恢复到“${fileName.value}”上次保存/加载的内容吗？`
  );
  if (!shouldReset) {
    return;
  }

  editedContent.value = originalContent.value;
  markdownContent.value = originalContent.value;
  showToast("已恢复到上次保存/加载的内容", "success");
}

// 编辑模式内容变化
let lastEditedContent = "";
watch(editedContent, (newVal, oldVal) => {
  // 如果是外部变更触发的更新，跳过
  if (isExternalChange.value) {
    isExternalChange.value = false;
    lastEditedContent = newVal;
    return;
  }
  // 添加到历史记录（仅当用户真正编辑时）
  if (newVal !== lastEditedContent && viewMode.value === "split") {
    addToHistory(newVal);
    lastEditedContent = newVal;
  }
  markdownContent.value = editedContent.value;
});

function replaceContentFromDisk(content) {
  const changed = editedContent.value !== content;
  isExternalChange.value = changed;
  markdownContent.value = content;
  editedContent.value = content;
  originalContent.value = content;
  lastEditedContent = content;
  editHistory.value = [content];
  historyIndex.value = 0;
  clearFileConflict();

  return true;
}

function clearFileConflict() {
  externalConflictContent.value = null;
  showFileConflictModal.value = false;
  externalConflictNotified = false;
}

function markFileConflict(content) {
  externalConflictContent.value = content;
  if (!externalConflictNotified) {
    showToast("检测到本地编辑与外部修改冲突，请在标题旁选择保留版本", "error");
    externalConflictNotified = true;
  }
}

function openFileConflictResolution() {
  if (hasFileConflict.value) {
    showFileConflictModal.value = true;
  }
}

function getFileExtension(path) {
  const file = String(path || "").split(/[\\/]/).pop() || "";
  const dotIndex = file.lastIndexOf(".");
  return dotIndex > 0 ? file.slice(dotIndex).toLowerCase() : "";
}

function firstFileInTree(nodes) {
  for (const node of nodes || []) {
    if (!node.isDir) {
      return node.path;
    }
    const childPath = firstFileInTree(node.children);
    if (childPath) {
      return childPath;
    }
  }
  return "";
}

function getDefaultExpandedTreePaths(nodes) {
  return new Set((nodes || []).filter((node) => node.isDir).map((node) => node.path));
}

function toggleTreePath(path) {
  const nextPaths = new Set(expandedTreePaths.value);
  if (nextPaths.has(path)) {
    nextPaths.delete(path);
  } else {
    nextPaths.add(path);
  }
  expandedTreePaths.value = nextPaths;
}

async function setFileWorkspace(paths, { openFirst = true } = {}) {
  const selectedPaths = Array.from(new Set((paths || []).filter(Boolean)));
  if (!selectedPaths.length || !BuildFileWorkspaceFunc) {
    return false;
  }

  if (openFirst && hasChanges.value) {
    const shouldDiscard = window.confirm(
      `“${fileName.value}”还有未保存的修改。是否放弃修改并打开新的文件列表？`
    );
    if (!shouldDiscard) {
      return false;
    }
  }

  isLoading.value = true;
  loadingText.value = "正在整理文本文件...";
  try {
    const workspace = await BuildFileWorkspace(selectedPaths);
    const roots = Array.isArray(workspace?.roots) ? workspace.roots : [];
    const fileCount = Number(workspace?.fileCount || 0);

    if (!fileCount) {
      showToast("所选内容中没有可打开的文本文件", "error");
      return false;
    }

    workspaceRoots.value = roots;
    workspaceFileCount.value = fileCount;
    expandedTreePaths.value = getDefaultExpandedTreePaths(roots);
    sidebarSection.value = "files";

    if (workspace?.truncated) {
      showToast("目录文件较多，已显示前 10000 个文本文件", "error");
    }

    if (openFirst) {
      const firstPath = firstFileInTree(roots);
      if (firstPath) {
        await loadFile(firstPath);
      }
    }
    return true;
  } catch (e) {
    console.error("构建文件目录失败:", e);
    showToast("打开文件目录失败：" + (e.message || e), "error");
    return false;
  } finally {
    isLoading.value = false;
  }
}

async function openWorkspaceFile(path) {
  if (!path || normalizeWindowsPath(path) === normalizeWindowsPath(filePath.value)) {
    return;
  }

  if (hasChanges.value) {
    const shouldDiscard = window.confirm(
      `“${fileName.value}”还有未保存的修改。是否放弃修改并打开其他文件？`
    );
    if (!shouldDiscard) {
      return;
    }
  }

  await loadFile(path);
}

// 打开一个或多个文本文件
async function openFile() {
  if (!isWailsEnv || (!OpenFilesDialogFunc && !OpenFileDialogFunc)) {
    showToast("请在桌面应用中使用此功能", "error");
    return;
  }
  const paths = OpenFilesDialogFunc ? await OpenFilesDialog() : [await OpenFileDialog()];
  if (!paths?.length) return;
  await setFileWorkspace(paths);
}

async function openDirectory() {
  if (!isWailsEnv || !OpenDirectoryDialogFunc || !BuildFileWorkspaceFunc) {
    showToast("请在桌面应用中使用此功能", "error");
    return;
  }
  const path = await OpenDirectoryDialog();
  if (!path) return;
  await setFileWorkspace([path]);
}

// 加载文件（带监听）
async function loadFile(path) {
  if (!isWailsEnv || !ReadFileAndUpdateWatch) {
    showToast("请在桌面应用中使用此功能", "error");
    return;
  }
  isLoading.value = true;
  loadingText.value = "正在加载文本文件...";
  try {
    const content = await ReadFileAndUpdateWatch(path);
    fileName.value = await GetFileName();
    filePath.value = (await GetFilePath()) || path;
    replaceContentFromDisk(content);
    viewMode.value = readPreference("viewMode");
  } catch (e) {
    console.error("读取文件失败:", e);
    showToast("读取文件失败: " + (e.message || e), "error");
  } finally {
    isLoading.value = false;
  }
}

let pendingRefreshRequest = null;
let isCheckingCurrentFile = false;
let externalConflictNotified = false;
let filePollingTimer = null;

function normalizeWindowsPath(path) {
  return String(path || "").replaceAll("/", "\\").toLowerCase();
}

async function refreshCurrentFile({ changedPath = "", polling = false } = {}) {
  if (!isWailsEnv || !ReadFileFunc) {
    return;
  }

  const currentPath = filePath.value || (await GetFilePath());
  if (!currentPath) {
    return;
  }
  if (!filePath.value) {
    filePath.value = currentPath;
    fileName.value = (await GetFileName()) || fileName.value;
  }

  if (
    changedPath &&
    normalizeWindowsPath(changedPath) !== normalizeWindowsPath(currentPath)
  ) {
    return;
  }

  if (isCheckingCurrentFile) {
    if (!pendingRefreshRequest) {
      pendingRefreshRequest = { changedPath, polling };
    }
    return;
  }

  isCheckingCurrentFile = true;

  try {
    const content = await ReadFile(currentPath);
    const diskChanged = content !== originalContent.value;
    const localChanged = editedContent.value !== originalContent.value;

    if (!diskChanged) {
      clearFileConflict();
    } else if (content === editedContent.value) {
      // Both sides reached the same content, so there is no version to choose between.
      replaceContentFromDisk(content);
    } else if (localChanged) {
      markFileConflict(content);
    } else {
      replaceContentFromDisk(content);

      if (!polling) {
        showToast("已自动加载外部修改", "success");
      }
    }
  } catch (e) {
    console.warn("重新加载文件失败:", e);
    if (!polling) {
      showToast("刷新文件失败：" + (e.message || e), "error");
    }
  } finally {
    isCheckingCurrentFile = false;

    if (pendingRefreshRequest) {
      const nextRequest = pendingRefreshRequest;
      pendingRefreshRequest = null;
      refreshCurrentFile(nextRequest);
    }
  }
}

async function resolveFileConflictWithCurrent() {
  if (!hasFileConflict.value || !filePath.value || isResolvingFileConflict.value) {
    return;
  }

  isResolvingFileConflict.value = true;
  try {
    const contentToKeep = editedContent.value;
    await WriteFile(filePath.value, contentToKeep);
    replaceContentFromDisk(contentToKeep);
    showToast("已保留当前编辑并覆盖外部版本", "success");
  } catch (e) {
    showToast("保存当前版本失败：" + (e.message || e), "error");
  } finally {
    isResolvingFileConflict.value = false;
  }
}

async function resolveFileConflictWithExternal() {
  if (!hasFileConflict.value || !filePath.value || isResolvingFileConflict.value) {
    return;
  }

  isResolvingFileConflict.value = true;
  try {
    const latestContent = await ReadFile(filePath.value);
    replaceContentFromDisk(latestContent);
    showToast("已加载外部最新版本", "success");
  } catch (e) {
    showToast("加载外部版本失败：" + (e.message || e), "error");
  } finally {
    isResolvingFileConflict.value = false;
  }
}

// 处理文件外部变更
let fileChangeRefreshTimer = null;

function handleFileChanged(changedPath) {
  if (fileChangeRefreshTimer) {
    clearTimeout(fileChangeRefreshTimer);
  }

  fileChangeRefreshTimer = setTimeout(() => {
    fileChangeRefreshTimer = null;
    refreshCurrentFile({ changedPath: String(changedPath || "") });
  }, 180);
}

function startFilePolling() {
  if (filePollingTimer) {
    clearInterval(filePollingTimer);
  }
  filePollingTimer = setInterval(() => {
    if (filePath.value && document.visibilityState === "visible") {
      refreshCurrentFile({ polling: true });
    }
  }, 3000);
}

function handleWindowFocus() {
  if (filePath.value) {
    refreshCurrentFile({ polling: true });
  }
  syncBrowserZoomViewport();
  syncWindowMaximizedState();
}

function handleWindowResize() {
  syncBrowserZoomViewport();
  syncWindowMaximizedState();
}

// 主题切换
const builtInThemes = [
  {
    id: "default",
    name: "白昼",
    description: "经典明亮阅读界面，干净、直接、对比清晰。",
    mode: "light",
    style: "minimal",
    builtIn: true,
    locked: true,
    palette: {
      background: "#ffffff",
      surface: "#f6f8fa",
      accent: "#0969da",
      text: "#24292f",
    },
  },
  {
    id: "dark",
    name: "暗夜",
    description: "深色护眼界面，适合夜间阅读和长时间编辑。",
    mode: "dark",
    style: "professional",
    builtIn: true,
    locked: true,
    palette: {
      background: "#0d1117",
      surface: "#161b22",
      accent: "#58a6ff",
      text: "#c9d1d9",
    },
  },
  {
    id: "elegant",
    name: "雅致",
    description: "仿纸质阅读质感，强调温和留白和中文阅读舒适度。",
    mode: "light",
    style: "paper",
    builtIn: true,
    locked: true,
    palette: {
      background: "#f6f1e8",
      surface: "#fffaf0",
      accent: "#8b5e34",
      text: "#2f2a24",
    },
  },
];

const themes = computed(() => [
  ...smartThemes.value.map((theme) => ({
    id: theme.id,
    name: theme.name,
  })),
  ...builtInThemes.map((theme) => ({
    id: theme.id,
    name: theme.name,
  })),
]);

const themeList = computed(() => [...smartThemes.value, ...builtInThemes]);

let smartThemeStyleElement = null;

function getSmartTheme(themeId) {
  return smartThemes.value.find((theme) => theme.id === themeId) || null;
}

function syncSmartThemeStyles() {
  if (typeof document === "undefined") {
    return;
  }

  if (!smartThemeStyleElement) {
    smartThemeStyleElement = document.getElementById("smart-theme-style");
    if (!smartThemeStyleElement) {
      smartThemeStyleElement = document.createElement("style");
      smartThemeStyleElement.id = "smart-theme-style";
      document.head.appendChild(smartThemeStyleElement);
    }
  }

  smartThemeStyleElement.textContent = createSmartThemeStyleSheet(smartThemes.value);
}

function setTheme(themeId) {
  const nextThemeId = themes.value.some((theme) => theme.id === themeId)
    ? themeId
    : "elegant";
  const smartTheme = getSmartTheme(nextThemeId);

  currentTheme.value = nextThemeId;
  isDark.value = smartTheme ? smartTheme.mode === "dark" : nextThemeId === "dark";
  document.documentElement.setAttribute("data-theme", nextThemeId);

  if (smartTheme) {
    document.documentElement.setAttribute("data-ai-theme", "true");
  } else {
    document.documentElement.removeAttribute("data-ai-theme");
  }

  if (isWailsEnv) {
    if (smartTheme) {
      const bg = getSmartThemeWindowColor(smartTheme);
      if (smartTheme.mode === "dark") {
        WindowSetDarkThemeFunc?.();
      } else {
        WindowSetLightThemeFunc?.();
      }
      WindowSetBackgroundColourFunc?.(bg.r, bg.g, bg.b, 255);
    } else if (nextThemeId === "dark") {
      WindowSetDarkThemeFunc?.();
      WindowSetBackgroundColourFunc?.(13, 17, 23, 255);
    } else if (nextThemeId === "elegant") {
      WindowSetLightThemeFunc?.();
      WindowSetBackgroundColourFunc?.(246, 241, 232, 255);
    } else {
      WindowSetLightThemeFunc?.();
      WindowSetBackgroundColourFunc?.(255, 255, 255, 255);
    }
  }
}

watch(
  smartThemes,
  (value) => {
    saveSmartThemes(value);
    syncSmartThemeStyles();
    if (
      isSmartThemeId(currentTheme.value) &&
      !value.some((theme) => theme.id === currentTheme.value)
    ) {
      setTheme("elegant");
    }
  },
  { deep: true }
);

function cycleTheme() {
  const currentIndex = themes.value.findIndex((t) => t.id === currentTheme.value);
  const nextIndex = (currentIndex + 1) % themes.value.length;
  setTheme(themes.value[nextIndex].id);
}

function openSettings(section = "general") {
  settingsInitialSection.value = section === "models" ? "models" : "general";
  showSettingsModal.value = true;
}

async function syncWindowMaximizedState() {
  if (!WindowIsMaximisedFunc) {
    return;
  }

  try {
    isWindowMaximized.value = Boolean(await WindowIsMaximisedFunc());
  } catch (e) {
    console.warn("读取窗口状态失败:", e);
  }
}

function minimizeWindow() {
  WindowMinimiseFunc?.();
}

function toggleWindowMaximize(event) {
  if (event?.target?.closest("button, input, select, textarea, a")) {
    return;
  }
  WindowToggleMaximiseFunc?.();
  window.setTimeout(handleWindowResize, 120);
}

function closeWindow() {
  QuitFunc?.();
}

function toggleStylePanel() {
  stylePanelState.value.visible = !stylePanelState.value.visible;
  stylePanelState.value.visibilityTouched = true;
}

function resetPluginStyles() {
  resetStyleConfig();
  showToast("样式配置已恢复为主题默认值", "success");
}

// 视图模式切换 - 保留原分屏编辑，新增单栏实时编辑
let savedScrollRatio = 0; // 保存滚动比例

function getScrollRatio(element) {
  if (!element) {
    return 0;
  }

  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 0) {
    return 0;
  }

  return element.scrollTop / maxScroll;
}

function applyScrollRatio(element, ratio) {
  if (!element) {
    return;
  }

  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 0) {
    return;
  }

  element.scrollTop = ratio * maxScroll;
}

function readCurrentScrollRatio(mode = viewMode.value) {
  if (mode === "split") {
    const ratios = [getScrollRatio(editorRef.value), getScrollRatio(previewRef.value)];
    return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  }

  if (mode === "live") {
    return getScrollRatio(liveEditorRef.value);
  }

  return getScrollRatio(previewRef.value);
}

function restoreScrollRatioForMode(mode) {
  nextTick(() => {
    if (mode === "split") {
      applyScrollRatio(editorRef.value, savedScrollRatio);
      applyScrollRatio(previewRef.value, savedScrollRatio);
      return;
    }

    if (mode === "live") {
      applyScrollRatio(liveEditorRef.value, savedScrollRatio);
      return;
    }

    applyScrollRatio(previewRef.value, savedScrollRatio);
  });
}

function scrollElementToTop(element) {
  if (!element) {
    return;
  }

  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  element.scrollTop = 0;
}

function scrollDocumentToTop() {
  if (viewMode.value === "split") {
    scrollElementToTop(editorRef.value);
    scrollElementToTop(previewRef.value);
    return;
  }

  if (viewMode.value === "live") {
    scrollElementToTop(liveEditorRef.value);
    scrollElementToTop(liveEditorRef.value?.querySelector?.(".plain-text-editor"));
    return;
  }

  scrollElementToTop(previewRef.value);
}

function prepareEditingBuffer(sourceContent = markdownContent.value) {
  editedContent.value = sourceContent;
  lastEditedContent = sourceContent;

  if (
    editHistory.value.length === 0 ||
    editHistory.value[editHistory.value.length - 1] !== sourceContent
  ) {
    editHistory.value = [sourceContent];
    historyIndex.value = 0;
  }
}

function toggleEditorMode(targetMode) {
  savedScrollRatio = readCurrentScrollRatio();

  if (viewMode.value === targetMode) {
    viewMode.value = "preview";
    restoreScrollRatioForMode("preview");
    return;
  }

  if (viewMode.value === "preview") {
    prepareEditingBuffer(markdownContent.value);
  } else if (targetMode === "split" && viewMode.value === "live") {
    prepareEditingBuffer(editedContent.value);
  }

  viewMode.value = targetMode;
  restoreScrollRatioForMode(targetMode);
}

function switchViewMode(targetMode) {
  if (viewMode.value === targetMode) {
    return;
  }

  toggleEditorMode(targetMode);
}

function handleLiveEditorReady() {
  if (viewMode.value === "live") {
    restoreScrollRatioForMode("live");
  }
}

// 保存文件
async function saveFile() {
  if (!isWailsEnv || !WriteFileFunc || !ReadFileFunc) {
    showToast("请在桌面应用中使用此功能", "error");
    return;
  }
  if (!filePath.value || !hasChanges.value || isSaving.value) return;

  isSaving.value = true;
  try {
    const diskContent = await ReadFile(filePath.value);
    if (diskContent !== originalContent.value) {
      if (diskContent === editedContent.value) {
        originalContent.value = editedContent.value;
        clearFileConflict();
        showToast("磁盘内容已与当前文档一致", "success");
        return;
      }

      markFileConflict(diskContent);
      showFileConflictModal.value = true;
      return;
    }

    await WriteFile(filePath.value, editedContent.value);
    originalContent.value = editedContent.value;
    clearFileConflict();
    // 成功提示
    showToast("保存成功", "success");
  } catch (e) {
    console.error("保存失败:", e);
    showToast("保存失败: " + (e.message || e), "error");
  } finally {
    isSaving.value = false;
  }
}

function stripOuterMarkdownFence(text) {
  const trimmed = String(text || "").trim();
  const matched = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return matched ? matched[1].trim() : trimmed;
}

function normalizeForContentCheck(text) {
  return String(text || "")
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1$2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1$2")
    .replace(/[`*_~#>\-|:[\](){}.,;!?，。；：！？“”‘’、\\/+=\s]/g, "")
    .toLowerCase();
}

function isSmartFormatResultValid(original, formatted) {
  const result = String(formatted || "").trim();
  if (!result) {
    return false;
  }

  if (/<!doctype|<html[\s>]|<\/body>/i.test(result)) {
    return false;
  }

  if (/^(here is|sure[,，]|下面是|以下是).{0,80}(markdown|排版|整理)/i.test(result)) {
    return false;
  }

  const originalToken = normalizeForContentCheck(original);
  const formattedToken = normalizeForContentCheck(result);

  if (!originalToken && !formattedToken) {
    return true;
  }

  if (!originalToken || !formattedToken) {
    return false;
  }

  const lengthRatio =
    Math.min(originalToken.length, formattedToken.length) /
    Math.max(originalToken.length, formattedToken.length);

  return lengthRatio >= 0.96 && originalToken === formattedToken;
}

function applySmartFormattedContent(formattedContent) {
  const nextContent = stripOuterMarkdownFence(formattedContent);
  editedContent.value = nextContent;
  markdownContent.value = nextContent;
  lastEditedContent = nextContent;

  if (
    editHistory.value.length === 0 ||
    editHistory.value[editHistory.value.length - 1] !== nextContent
  ) {
    addToHistory(nextContent);
  }
}

function openSmartFormatPreview(originalContent, formattedContent) {
  smartFormatOriginalContent.value = originalContent;
  smartFormatCandidateContent.value = formattedContent;
  showSmartFormatPreview.value = true;
}

function closeSmartFormatPreview() {
  showSmartFormatPreview.value = false;
}

function confirmSmartFormatPreview() {
  applySmartFormattedContent(smartFormatCandidateContent.value);
  showSmartFormatPreview.value = false;
  showToast("已应用智能排版结果，请确认后保存", "success");
}

function openSmartFormatFailure(message, failedModelId = "") {
  smartFormatError.value = message;
  smartFormatRetryModelId.value =
    enabledSmartFormatModels.value.find((model) => model.id !== failedModelId)?.id ||
    failedModelId ||
    enabledSmartFormatModels.value[0]?.id ||
    "";
  showSmartFormatFailure.value = true;
}

function getSmartFormatModel(modelId = "") {
  if (modelId) {
    return enabledSmartFormatModels.value.find((model) => model.id === modelId) || null;
  }

  return activeSmartFormatModel.value;
}

function openSmartFormatPrompt() {
  if (!isMarkdownDocument.value) {
    showToast("智能排版仅适用于 Markdown 文档", "error");
    return;
  }

  if (!activeSmartFormatModel.value) {
    showToast("请先在模型配置中添加、测试并启用模型", "error");
    openSettings("models");
    return;
  }

  const sourceContent = editedContent.value || markdownContent.value;
  if (!sourceContent.trim()) {
    showToast("当前文档没有可排版内容", "error");
    return;
  }

  showSmartFormatPrompt.value = true;
}

function confirmSmartFormatPrompt(instruction) {
  smartFormatInstruction.value = String(instruction || "").trim().slice(0, 1000);
  showSmartFormatPrompt.value = false;
  smartFormatMarkdown("", smartFormatInstruction.value);
}

async function smartFormatMarkdown(modelId = "", instruction = smartFormatInstruction.value) {
  if (!isWailsEnv || !FormatMarkdownWithAI) {
    showToast("请在桌面应用中使用智能排版", "error");
    return;
  }

  const model = getSmartFormatModel(modelId);
  if (!model) {
    showToast("请先在设置中添加并启用模型", "error");
    openSettings("models");
    return;
  }

  if (!model.baseUrl || !model.model) {
    openSmartFormatFailure("当前模型缺少接口地址或模型名称，请补充后重试。", model.id);
    return;
  }

  const sourceContent = editedContent.value || markdownContent.value;
  if (!sourceContent.trim()) {
    showToast("当前文档没有可排版内容", "error");
    return;
  }

  isSmartFormatting.value = true;
  isLoading.value = true;
  loadingText.value = "智能排版中，请稍候...";

  try {
    const formattedContent = stripOuterMarkdownFence(
      await FormatMarkdownWithAI({
        markdown: sourceContent,
        instruction: String(instruction || "").trim().slice(0, 1000),
        model: {
          name: model.name,
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.model,
          timeout: model.timeout,
          formatTimeout: model.formatTimeout,
          headers: model.headers,
        },
      })
    );

    if (!isSmartFormatResultValid(sourceContent, formattedContent)) {
      openSmartFormatFailure("模型返回内容未通过安全校验，已保留当前文档。", model.id);
      return;
    }

    appSettings.value.activeModelId = model.id;
    showSmartFormatFailure.value = false;
    openSmartFormatPreview(sourceContent, formattedContent);
  } catch (e) {
    console.error("智能排版失败:", e);
    openSmartFormatFailure("智能排版请求失败：" + (e.message || e), model.id);
  } finally {
    isSmartFormatting.value = false;
    isLoading.value = false;
  }
}

function retrySmartFormat() {
  showSmartFormatFailure.value = false;
  smartFormatMarkdown(smartFormatRetryModelId.value, smartFormatInstruction.value);
}

function openSettingsFromSmartFormatFailure() {
  showSmartFormatFailure.value = false;
  openSettings("models");
}

function getActiveSmartThemeModel(modelId = "") {
  return getSmartFormatModel(modelId);
}

function applySmartTheme(themeId) {
  const builtInTheme = builtInThemes.find((item) => item.id === themeId) || null;
  if (builtInTheme) {
    setTheme(builtInTheme.id);
    showToast(`已切换到内置主题：${builtInTheme.name}`, "success");
    return;
  }

  const theme = smartThemes.value.find((item) => item.id === themeId) || null;
  if (!theme) {
    showToast("主题不存在，可能已被删除。", "error");
    if (currentTheme.value === themeId) {
      setTheme("elegant");
    }
    return;
  }

  setTheme(theme.id);
  showToast(`已切换到智能主题：${theme.name}`, "success");
}

function deleteSmartTheme(themeId) {
  if (!isSmartThemeId(themeId)) {
    showToast("内置主题不能删除", "error");
    return;
  }

  const theme = smartThemes.value.find((item) => item.id === themeId) || null;
  if (!theme) {
    return;
  }

  smartThemes.value = smartThemes.value.filter((item) => item.id !== themeId);
  syncSmartThemeStyles();

  if (currentTheme.value === themeId) {
    setTheme("elegant");
  }

  showToast(`已删除智能主题：${theme.name}`, "success");
}

function openSmartThemePrompt() {
  if (!isWailsEnv || !GenerateThemeWithAI) {
    showToast("请在桌面应用中生成智能主题", "error");
    return;
  }

  const model = getActiveSmartThemeModel();
  if (!model) {
    showToast("请先在模型配置中添加、测试并启用一个模型", "error");
    openSettings("models");
    return;
  }

  if (!model.baseUrl || !model.model) {
    showToast("当前模型缺少接口地址或模型名称，请先补充", "error");
    openSettings("models");
    return;
  }

  showSmartThemePrompt.value = true;
}

function confirmSmartThemePrompt(prompt) {
  smartThemePrompt.value = String(prompt || "").trim().slice(0, 800);
  smartThemePromptHistory.value = rememberSmartThemePrompt(
    smartThemePromptHistory.value,
    smartThemePrompt.value
  );
  showSmartThemePrompt.value = false;
  generateSmartTheme(smartThemePrompt.value);
}

function deleteSmartThemePromptHistoryItem(itemId) {
  smartThemePromptHistory.value = smartThemePromptHistory.value.filter(
    (item) => item.id !== itemId
  );
}

async function generateSmartTheme(preference = smartThemePrompt.value) {
  if (!isWailsEnv || !GenerateThemeWithAI) {
    showToast("请在桌面应用中生成智能主题", "error");
    return;
  }

  const model = getActiveSmartThemeModel();
  if (!model) {
    showToast("请先在模型配置中添加、测试并启用一个模型", "error");
    openSettings("models");
    return;
  }

  if (!model.baseUrl || !model.model) {
    showToast("当前模型缺少接口地址或模型名称，请先补充", "error");
    openSettings("models");
    return;
  }

  isGeneratingSmartTheme.value = true;
  isLoading.value = true;
  loadingText.value = "AI 正在生成智能主题...";

  try {
    const normalizedPreference = String(preference || "").trim().slice(0, 800);
    const rawTheme = await GenerateThemeWithAI({
      preference: normalizedPreference,
      currentTheme: currentTheme.value,
      model: {
        name: model.name,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.model,
        timeout: model.timeout,
        formatTimeout: model.formatTimeout,
        headers: model.headers,
      },
    });

    const smartTheme = createSmartThemeFromAI(
      rawTheme,
      normalizedPreference || "生成智能主题"
    );
    if (!smartTheme) {
      throw new Error("AI 返回了无效的主题配置");
    }

    smartThemes.value = [
      smartTheme,
      ...smartThemes.value.filter((item) => item.id !== smartTheme.id),
    ].slice(0, 12);
    syncSmartThemeStyles();
    appSettings.value.activeModelId = model.id;
    setTheme(smartTheme.id);
    showToast(`已生成并应用主题：${smartTheme.name}`, "success");
  } catch (e) {
    console.error("智能主题生成失败:", e);
    showToast("智能主题生成失败：" + (e.message || e), "error");
  } finally {
    isGeneratingSmartTheme.value = false;
    isLoading.value = false;
  }
}

// Toast 提示
const toastMessage = ref("");
const toastType = ref("success");
let toastTimer = null;

function showToast(message, type = "success") {
  toastMessage.value = message;
  toastType.value = type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = "";
  }, 2000);
}

// 编辑器滚动同步 - 简单比例同步
let isSyncing = false;

function handleEditorScroll() {
  if (isSyncing) return;

  const editor = editorRef.value;
  const preview = previewRef.value;
  if (!editor || !preview) return;

  const editorMaxScroll = editor.scrollHeight - editor.clientHeight;
  const previewMaxScroll = preview.scrollHeight - preview.clientHeight;

  if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return;

  isSyncing = true;
  const scrollRatio = editor.scrollTop / editorMaxScroll;
  preview.scrollTop = scrollRatio * previewMaxScroll;
}

function handlePreviewScroll() {
  if (isSyncing) return;

  const editor = editorRef.value;
  const preview = previewRef.value;
  if (!editor || !preview) return;

  const editorMaxScroll = editor.scrollHeight - editor.clientHeight;
  const previewMaxScroll = preview.scrollHeight - preview.clientHeight;

  if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return;

  isSyncing = true;
  const scrollRatio = preview.scrollTop / previewMaxScroll;
  editor.scrollTop = scrollRatio * editorMaxScroll;
}

// 重置同步状态
function resetSyncState() {
  isSyncing = false;
}

// 缩放控制
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
const MIN_BROWSER_ZOOM = 50;
const MAX_BROWSER_ZOOM = 200;
const BROWSER_ZOOM_STEP = 10;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function zoomIn() {
  if (zoomLevel.value < MAX_ZOOM) {
    zoomLevel.value += ZOOM_STEP;
    applyZoom();
  }
}

function zoomOut() {
  if (zoomLevel.value > MIN_ZOOM) {
    zoomLevel.value -= ZOOM_STEP;
    applyZoom();
  }
}

function resetZoom() {
  zoomLevel.value = 100;
  applyZoom();
}

function applyZoom() {
  document.documentElement.style.setProperty(
    "--base-font-size",
    `${16 * (zoomLevel.value / 100)}px`
  );
}

function setBrowserZoomLevel(nextZoom) {
  browserZoomLevel.value = clampNumber(
    Math.round(nextZoom / BROWSER_ZOOM_STEP) * BROWSER_ZOOM_STEP,
    MIN_BROWSER_ZOOM,
    MAX_BROWSER_ZOOM
  );
}

function resetBrowserZoom() {
  setBrowserZoomLevel(100);
  showToast("浏览器缩放已还原为 100%", "success");
}

function handleBrowserZoomWheel(event) {
  if (!event.ctrlKey) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  setBrowserZoomLevel(browserZoomLevel.value + direction * BROWSER_ZOOM_STEP);
}

// 加载启动文件
async function loadStartupFile() {
  try {
    const startupFile = await GetStartupFile();
    if (startupFile) {
      return await setFileWorkspace([startupFile]);
    }
  } catch (e) {
    console.warn("检查启动参数失败:", e);
  }
  return false;
}

// 显示欢迎内容
function showWelcome() {
  markdownContent.value = `# MD 查看器

欢迎使用 MD 查看器！

## 功能特性

- **编辑/预览**：右上角切换编辑、预览、分屏模式
- **实时同步**：分屏模式下编辑与预览同步滚动
- **图表支持**：Mermaid、Flowchart 等图表渲染
- **主题切换**：默认、暗色、雅致三种主题

## 计划任务
- [ ] 整理需求
- [ ] 联调接口
- [x] 修复目录高度问题
- [x] 补一轮自测

## 图表示例

### Mermaid 流程图

\`\`\`mermaid
graph TD
    A[开始] --> B{条件判断}
    B -->|是| C[执行操作]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
\`\`\`

### Mermaid 时序图

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 系统
    用户->>系统: 发送请求
    系统->>系统: 处理数据
    系统->>用户: 返回结果
\`\`\`

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+O | 打开文件 |
| Ctrl+S | 保存文件 |
| Ctrl+Z | 撤销 |

`;
}

// 键盘快捷键
function handleKeyDown(e) {
  if (e.ctrlKey && e.key === "o") {
    e.preventDefault();
    openFile();
  }
  // Ctrl+S 保存
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    if (hasChanges.value) {
      saveFile();
    }
  }
  // Ctrl+Z 撤销
  if (e.ctrlKey && e.key === "z" && viewMode.value === "split") {
    e.preventDefault();
    undo();
  }
  // Ctrl+Y 重做
  if (e.ctrlKey && e.key === "y" && viewMode.value === "split") {
    e.preventDefault();
    redo();
  }
}

// 拖拽处理
function handleDragOver(e) {
  e.preventDefault();
  if (!isDragging.value) {
    isDragging.value = true;
  }
}

function handleDragLeave(e) {
  e.preventDefault();
  // 检查是否真的离开了容器
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    isDragging.value = false;
  }
}

async function handleDrop(e) {
  e.preventDefault();
  isDragging.value = false;

  // Desktop drops are handled by Wails below, which supplies an absolute path.
  if (isWailsEnv && OnFileDropFunc) {
    return;
  }

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    // Browser preview fallback. Desktop builds always use native absolute paths.
    isLoading.value = true;
    loadingText.value = "正在加载文本文件...";
    const reader = new FileReader();
    reader.onload = async (ev) => {
      fileName.value = file.name;
      filePath.value = "";
      replaceContentFromDisk(ev.target.result);
      isLoading.value = false;
    };
    reader.onerror = () => {
      isLoading.value = false;
      showToast("无法读取该文本文件", "error");
    };
    reader.readAsText(file);
  }
}

async function handleNativeFileDrop(_x, _y, paths) {
  isDragging.value = false;
  const droppedPaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (!droppedPaths.length) {
    showToast("未能获取拖入文件的磁盘路径", "error");
    return;
  }
  await setFileWorkspace(droppedPaths);
}

function stripHtmlTags(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function normalizeHeadingText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u200b/g, "")
    .replace(/^[#]+\s*/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findLiveHeadingElement(id) {
  const container = liveEditorRef.value;
  if (!container) {
    return null;
  }

  const escapedId =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id;
  const matchedById = container.querySelector(`#${escapedId}`);
  if (matchedById) {
    return matchedById;
  }

  const tocItem = tocItems.value.find((item) => item.id === id);
  if (!tocItem) {
    return null;
  }

  const targetText = normalizeHeadingText(tocItem.text);
  const matchedItems = tocItems.value.filter((item) => {
    return item.level === tocItem.level && normalizeHeadingText(item.text) === targetText;
  });
  const targetIndex = Math.max(
    0,
    matchedItems.findIndex((item) => item.id === id)
  );
  const matchedNodes = Array.from(
    container.querySelectorAll(`h${tocItem.level}, .DOMD-H${tocItem.level}`)
  ).filter((node) => normalizeHeadingText(node.textContent) === targetText);

  return matchedNodes[targetIndex] || matchedNodes[0] || null;
}

// TOC 滚动 - 直接滚动，不用平滑效果
function scrollToHeading(target) {
  const id = typeof target === "string" ? target : target.id;
  activeTocId.value = id;
  const el =
    viewMode.value === "live" ? findLiveHeadingElement(id) : document.getElementById(id);
  if (el) {
    const container =
      viewMode.value === "split"
        ? previewRef.value
        : viewMode.value === "live"
        ? liveEditorRef.value
        : document.querySelector(".content-area");
    if (container) {
      // 计算元素相对于滚动容器的位置
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const relativeTop = elRect.top - containerRect.top + container.scrollTop;
      // 留出一些顶部空间
      container.scrollTop = relativeTop - 30;
    }
  }
}

function tocIndent(level) {
  return { paddingLeft: `${(level - 1) * 16 + 8}px` };
}

// 处理图片
function processImagePaths() {
  const runToken = ++imageProcessingToken;
  nextTick(async () => {
    const containers = Array.from(document.querySelectorAll(".markdown-body"));
    if (!containers.length) return;

    for (const container of containers) {
      const images = Array.from(container.querySelectorAll("img"));
      for (const img of images) {
        if (runToken !== imageProcessingToken) {
          return;
        }

        const src = img.getAttribute("src");
        if (
          !src ||
          src.startsWith("data:") ||
          src.startsWith("http://") ||
          src.startsWith("https://")
        ) {
          continue;
        }

        try {
          const resolvedPath = await ResolveImagePath(src);
          const cacheKey = String(resolvedPath || src);
          let base64 = imageBase64Cache.get(cacheKey);

          if (!base64) {
            base64 = await ReadImageAsBase64(resolvedPath);
            if (base64 && base64.length <= MAX_IMAGE_BASE64_LENGTH) {
              imageBase64Cache.set(cacheKey, base64);
              while (imageBase64Cache.size > MAX_IMAGE_BASE64_CACHE_ENTRIES) {
                imageBase64Cache.delete(imageBase64Cache.keys().next().value);
              }
            } else {
              base64 = "";
            }
          }

          if (base64 && img.getAttribute("src") === src) {
            img.setAttribute("src", base64);
          }
        } catch (e) {
          console.warn("图片加载失败:", src, e);
        }
      }
    }
  });
}

watch(renderedHtml, () => {
  processImagePaths();
});

watch(viewMode, async (mode) => {
  if (mode === "live") {
    return;
  }

  await nextTick();
  processImagePaths();
  await renderMermaidCharts();
});

function clampSplitEditorWidth(value) {
  return Math.min(splitMaxPercent, Math.max(splitMinPercent, value));
}

function startResizeSplit(e) {
  e.preventDefault();

  if (viewMode.value !== "split") {
    return;
  }

  isResizingSplit.value = true;
  document.addEventListener("mousemove", handleResizeSplit);
  document.addEventListener("mouseup", stopResizeSplit);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handleResizeSplit(e) {
  if (!isResizingSplit.value || !splitContainerRef.value) {
    return;
  }

  const rect = splitContainerRef.value.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  const nextWidth = ((e.clientX - rect.left) / rect.width) * 100;
  splitEditorWidth.value = Number(clampSplitEditorWidth(nextWidth).toFixed(2));
}

function stopResizeSplit() {
  if (!isResizingSplit.value) {
    return;
  }

  isResizingSplit.value = false;
  document.removeEventListener("mousemove", handleResizeSplit);
  document.removeEventListener("mouseup", stopResizeSplit);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

// 目录宽度拖动调整
let tocSidebarEl = null;

function startResizeToc(e) {
  e.preventDefault();
  isResizingToc.value = true;
  tocSidebarEl = document.querySelector(".toc-sidebar");
  document.addEventListener("mousemove", handleResizeToc);
  document.addEventListener("mouseup", stopResizeToc);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handleResizeToc(e) {
  if (!isResizingToc.value || !tocSidebarEl) return;
  const rect = tocSidebarEl.getBoundingClientRect();
  const newWidth = e.clientX - rect.left;
  if (newWidth >= tocMinWidth && newWidth <= tocMaxWidth) {
    // 直接操作 DOM 实现即时响应
    tocSidebarEl.style.width = newWidth + "px";
  }
}

function stopResizeToc() {
  if (isResizingToc.value) {
    isResizingToc.value = false;
    document.removeEventListener("mousemove", handleResizeToc);
    document.removeEventListener("mouseup", stopResizeToc);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    // 放开鼠标后再更新 Vue 状态并保存
    if (tocSidebarEl) {
      const finalWidth = parseInt(tocSidebarEl.style.width);
      tocWidth.value = finalWidth;
    }
    tocSidebarEl = null;
  }
}

onMounted(async () => {
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("wheel", handleBrowserZoomWheel, { passive: false });
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("resize", handleWindowResize);
  syncBrowserZoomViewport();
  syncSmartThemeStyles();
  setTheme(currentTheme.value);
  applyZoom();

  // 仅在 Wails 环境中执行相关操作
  if (isWailsEnv) {
    // 等待 Wails 运行时准备好
    await new Promise((resolve) => {
      if (window.go && window.go.main) {
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (window.go && window.go.main) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
        // 最多等待 2 秒
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 2000);
      }
    });

    // 监听文件变更事件
    try {
      EventsOn("file-changed", handleFileChanged);
      OnFileDrop(handleNativeFileDrop, false);
    } catch (e) {
      console.warn("注册文件监听失败:", e);
    }

    startFilePolling();
    syncBrowserZoomViewport();
    await syncWindowMaximizedState();

    const loaded = await loadStartupFile();
    if (!loaded) {
      showWelcome();
    }
  } else {
    // 非桌面应用环境，显示欢迎页
    showWelcome();
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("wheel", handleBrowserZoomWheel);
  window.removeEventListener("focus", handleWindowFocus);
  window.removeEventListener("resize", handleWindowResize);
  document.removeEventListener("mousemove", handleResizeSplit);
  document.removeEventListener("mouseup", stopResizeSplit);
  document.removeEventListener("mousemove", handleResizeToc);
  document.removeEventListener("mouseup", stopResizeToc);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  if (fileChangeRefreshTimer) {
    clearTimeout(fileChangeRefreshTimer);
    fileChangeRefreshTimer = null;
  }
  if (filePollingTimer) {
    clearInterval(filePollingTimer);
    filePollingTimer = null;
  }
  if (isWailsEnv && EventsOff) {
    try {
      EventsOff("file-changed");
      OnFileDropOff();
    } catch (e) {
      console.warn("取消文件变更监听失败:", e);
    }
  }
});
</script>

<template>
  <div
    class="app-container"
    :class="{
      dark: isDark,
      dragging: isDragging,
      'split-mode': viewMode === 'split',
      'live-mode': viewMode === 'live',
    }"
    :style="appContainerStyle"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- 拖拽遮罩 -->
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-hint">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="12" y2="12" />
          <line x1="15" y1="15" x2="12" y2="12" />
        </svg>
        <p>释放以打开文本文件或目录</p>
      </div>
    </div>

    <!-- Loading 遮罩 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner-large"></div>
        <p class="loading-message">{{ loadingText }}</p>
      </div>
    </div>

    <!-- Toast 提示 -->
    <transition name="toast">
      <div v-if="toastMessage" class="toast-container" :class="toastType">
        <svg
          v-if="toastType === 'success'"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <svg
          v-else
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
    </transition>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left" @dblclick.stop>
        <button
          class="toolbar-btn"
          @click="showToc = !showToc"
          :class="{ active: showToc }"
          title="文件与文档大纲"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="15" y2="12" />
            <line x1="3" y1="18" x2="18" y2="18" />
          </svg>
          <span>导航</span>
        </button>
        <button class="toolbar-btn" @click="openFile" title="打开一个或多个文本文件 (Ctrl+O)">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
            />
          </svg>
          <span>打开</span>
        </button>
        <button class="toolbar-btn" @click="openDirectory" title="打开文件夹">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l2 2.4h6.8A2.5 2.5 0 0 1 21 8.9v1.2" />
            <path d="M3.3 10h17.4a1.2 1.2 0 0 1 1.15 1.55l-1.72 5.7A2.5 2.5 0 0 1 17.73 19H5.9a2.5 2.5 0 0 1-2.42-1.9L2.15 11.5A1.2 1.2 0 0 1 3.3 10Z" />
            <path d="M9 14h6" />
          </svg>
          <span>文件夹</span>
        </button>
        <!-- 保存按钮 - 只要内容有改动就显示 -->
        <button
          v-if="hasChanges"
          class="toolbar-btn save-btn"
          @click="saveFile"
          :disabled="isSaving"
          title="保存 (Ctrl+S)"
        >
          <svg
            v-if="!isSaving"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span v-else class="loading-spinner-sm"></span>
          <span>保存</span>
        </button>
        <button
          v-if="hasChanges"
          class="toolbar-btn reset-edit-btn"
          type="button"
          :disabled="isSaving"
          title="放弃未保存修改并恢复到上次保存/加载的内容"
          @click="resetEditedContent"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 1 0 3-6.71" />
            <polyline points="3 3 3 9 9 9" />
          </svg>
          <span>重置</span>
        </button>
      </div>
      <div class="toolbar-center" @dblclick="toggleWindowMaximize">
        <div class="file-title-row">
          <span class="file-name" :title="filePath">{{ fileName }}</span>
          <span v-if="hasFileConflict" class="file-conflict-status">内容冲突</span>
          <button
            v-if="hasFileConflict"
            class="title-conflict-action"
            type="button"
            title="处理当前编辑与外部文件的版本冲突"
            aria-label="处理文件冲突"
            @click.stop="openFileConflictResolution"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
          </button>
        </div>
      </div>
      <div class="toolbar-right" @dblclick.stop>
        <!-- 缩放控制 -->
        <div class="zoom-controls">
          <button
            class="toolbar-btn zoom-btn"
            @click="zoomOut"
            :disabled="zoomLevel <= MIN_ZOOM"
            title="缩小"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button class="toolbar-btn zoom-value" @click="resetZoom" title="还原">
            {{ zoomLevel }}%
          </button>
          <button
            class="toolbar-btn zoom-btn"
            @click="zoomIn"
            :disabled="zoomLevel >= MAX_ZOOM"
            title="放大"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
        </div>
        
        <!-- 视图模式切换 -->
        <div class="view-mode-tabs" role="tablist" aria-label="视图模式">
          <button
            v-for="tab in VIEW_MODE_TABS"
            :key="tab.mode"
            class="view-mode-tab"
            type="button"
            role="tab"
            :aria-selected="viewMode === tab.mode"
            :class="{ active: viewMode === tab.mode }"
            :title="tab.title"
            @click="switchViewMode(tab.mode)"
          >
            {{ tab.label }}
          </button>
        </div>

        <button
          class="toolbar-btn smart-format-btn"
          type="button"
          :disabled="isSmartFormatting || !isMarkdownDocument"
          :title="
            isMarkdownDocument
              ? '使用当前模型智能整理 Markdown 排版'
              : '智能排版仅适用于 Markdown 文档'
          "
          @click="openSmartFormatPrompt"
        >
          <span v-if="isSmartFormatting" class="loading-spinner-sm"></span>
          <svg
            v-else
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z" />
            <path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17z" />
          </svg>
          <span>智能排版</span>
        </button>

        <!-- 主题按钮 -->
        <button
          class="toolbar-btn style-config-btn"
          @click="toggleStylePanel"
          :class="{ active: stylePanelState.visible }"
          title="样式配置"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span>样式</span>
        </button>

        <button
          class="toolbar-btn theme-btn"
          @click="cycleTheme"
          :title="'主题: ' + themes.find((t) => t.id === currentTheme)?.name"
        >
          <svg
            v-if="currentTheme === 'dark'"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <svg
            v-else-if="currentTheme === 'elegant'"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <svg
            v-else
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <span class="theme-name">{{
            themes.find((t) => t.id === currentTheme)?.name
          }}</span>
        </button>
        <button
          class="toolbar-btn settings-btn"
          type="button"
          title="设置"
          @click="openSettings('general')"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.37.6.6 1 .6h.6a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.4z"
            />
          </svg>
          <span>设置</span>
        </button>

        <div v-if="isWailsEnv" class="window-controls" aria-label="窗口控制">
          <button
            class="window-control"
            type="button"
            title="最小化"
            aria-label="最小化"
            @click="minimizeWindow"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6.5h8" />
            </svg>
          </button>
          <button
            class="window-control"
            type="button"
            :title="isWindowMaximized ? '还原' : '最大化'"
            :aria-label="isWindowMaximized ? '还原' : '最大化'"
            @click="toggleWindowMaximize(null)"
          >
            <svg v-if="isWindowMaximized" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3.5 4.5v-2h6v6h-2" />
              <rect x="2.5" y="4.5" width="5" height="5" />
            </svg>
            <svg v-else viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2.5" y="2.5" width="7" height="7" />
            </svg>
          </button>
          <button
            class="window-control window-close"
            type="button"
            title="关闭"
            aria-label="关闭"
            @click="closeWindow"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="m2.5 2.5 7 7m0-7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- TOC 侧边栏 -->
      <div
        class="toc-sidebar"
        v-if="shouldShowSidebar"
        :style="{ width: tocWidth + 'px' }"
      >
        <div class="sidebar-tabs" role="tablist" aria-label="侧边栏内容">
          <button
            v-if="hasWorkspaceFiles"
            class="sidebar-tab"
            :class="{ active: sidebarSection === 'files' }"
            type="button"
            role="tab"
            :aria-selected="sidebarSection === 'files'"
            @click="sidebarSection = 'files'"
          >
            文件 <span>{{ workspaceFileCount }}</span>
          </button>
          <button
            v-if="tocItems.length"
            class="sidebar-tab"
            :class="{ active: sidebarSection === 'outline' }"
            type="button"
            role="tab"
            :aria-selected="sidebarSection === 'outline'"
            @click="sidebarSection = 'outline'"
          >
            大纲 <span>{{ tocItems.length }}</span>
          </button>
        </div>

        <div v-if="sidebarSection === 'files' && hasWorkspaceFiles" class="file-tree-panel">
          <FileTree
            :nodes="workspaceRoots"
            :expanded-paths="expandedTreePaths"
            :active-path="filePath"
            @toggle="toggleTreePath"
            @open="openWorkspaceFile"
          />
        </div>

        <div v-else-if="tocItems.length" class="toc-list">
          <div
            v-for="item in tocItems"
            :key="item.id"
            class="toc-item"
            :class="{ active: activeTocId === item.id, [`toc-h${item.level}`]: true }"
            :style="tocIndent(item.level)"
            @click="scrollToHeading(item)"
          >
            {{ item.text }}
          </div>
        </div>
        <!-- 拖动手柄 -->
        <div class="toc-resize-handle" @mousedown="startResizeToc"></div>
      </div>

      <!-- 分屏模式 -->
      <div class="document-stage">
      <template v-if="viewMode === 'split'">
        <div
          ref="splitContainerRef"
          class="split-workspace"
          :class="{ resizing: isResizingSplit }"
          :style="splitContainerStyle"
        >
          <div class="split-container">
            <textarea
              ref="editorRef"
              class="split-editor"
              v-model="editedContent"
              @scroll="handleEditorScroll"
              @scrollend="resetSyncState"
              :placeholder="editorPlaceholder"
              spellcheck="false"
            ></textarea>
          </div>
          <div
            class="split-divider split-resize-handle"
            title="拖动调整左右宽度"
            @mousedown="startResizeSplit"
          ></div>
          <div
            class="split-preview"
            ref="previewRef"
            @scroll="handlePreviewScroll"
            @scrollend="resetSyncState"
          >
            <div v-if="isMarkdownDocument" class="markdown-body" v-html="renderedHtml"></div>
            <pre v-else class="plain-text-preview"><code>{{ markdownContent }}</code></pre>
          </div>
        </div>
      </template>

      <template v-else-if="viewMode === 'live'">
        <div class="live-editor-view" ref="liveEditorRef">
          <div v-if="isMarkdownDocument" class="live-editor-shell">
            <LiveEditSurface
              v-model="editedContent"
              :placeholder="LIVE_EDIT_PLACEHOLDER"
              :resolve-image-path="ResolveImagePath"
              :read-image-as-base64="ReadImageAsBase64"
              @ready="handleLiveEditorReady"
            />
          </div>
          <textarea
            v-else
            class="plain-text-editor"
            v-model="editedContent"
            :placeholder="editorPlaceholder"
            spellcheck="false"
          ></textarea>
        </div>
      </template>

      <!-- 预览模式 -->
      <template v-else>
        <div ref="previewRef" class="content-area" @scroll="handlePreviewScroll">
          <div v-if="isMarkdownDocument" class="markdown-body" v-html="renderedHtml"></div>
          <pre v-else class="plain-text-preview standalone"><code>{{ markdownContent }}</code></pre>
        </div>
      </template>

        <button
          v-if="hasDocumentContent"
          class="back-to-top-btn"
          type="button"
          title="回到顶部"
          aria-label="回到顶部"
          @click="scrollDocumentToTop"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>

      <StyleConfigPanel
        v-if="stylePanelState.visible"
        v-model:config="styleConfig"
        v-model:panel-state="stylePanelState"
        :current-theme="currentTheme"
        :themes="themes"
        :effective-metrics="styleConfigMetrics"
        :show-reset="hasCustomStyleConfig"
        :smart-themes="themeList"
        :generating-smart-theme="isGeneratingSmartTheme"
        @theme-change="setTheme"
        @reset="resetPluginStyles"
        @generate-smart-theme="openSmartThemePrompt"
        @apply-smart-theme="applySmartTheme"
        @delete-smart-theme="deleteSmartTheme"
      />
    </div>

    <SettingsModal
      v-if="showSettingsModal"
      v-model:settings="appSettings"
      :test-model="TestAIModel"
      :initial-section="settingsInitialSection"
      :browser-zoom-level="browserZoomLevel"
      @reset-browser-zoom="resetBrowserZoom"
      @close="showSettingsModal = false"
    />

    <FileConflictModal
      :visible="showFileConflictModal"
      :file-name="fileName"
      :resolving="isResolvingFileConflict"
      @close="showFileConflictModal = false"
      @use-current="resolveFileConflictWithCurrent"
      @use-external="resolveFileConflictWithExternal"
    />

    <SmartFormatPreviewModal
      :visible="showSmartFormatPreview"
      :original-content="smartFormatOriginalContent"
      :formatted-content="smartFormatCandidateContent"
      :resolve-image-path="ResolveImagePath"
      :read-image-as-base64="ReadImageAsBase64"
      @use="confirmSmartFormatPreview"
      @close="closeSmartFormatPreview"
    />

    <SmartFormatPromptModal
      :visible="showSmartFormatPrompt"
      :initial-instruction="smartFormatInstruction"
      @confirm="confirmSmartFormatPrompt"
      @close="showSmartFormatPrompt = false"
    />

    <SmartThemePromptModal
      :visible="showSmartThemePrompt"
      :initial-prompt="smartThemePrompt"
      :history-items="smartThemePromptHistory"
      @confirm="confirmSmartThemePrompt"
      @delete-history="deleteSmartThemePromptHistoryItem"
      @close="showSmartThemePrompt = false"
    />

    <SmartFormatFailureModal
      v-model:model-id="smartFormatRetryModelId"
      :visible="showSmartFormatFailure"
      :message="smartFormatError"
      :models="enabledSmartFormatModels"
      @retry="retrySmartFormat"
      @close="showSmartFormatFailure = false"
      @open-settings="openSettingsFromSmartFormatFailure"
    />
  </div>
</template>

<style>
/* CSS 变量 - 默认主题 */
:root,
[data-theme="light"],
[data-theme="default"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fa;
  --bg-toolbar: #ffffff;
  --bg-toc: #f6f8fa;
  --bg-toc-hover: #eaeef2;
  --bg-toc-active: #dbe4eb;
  --bg-drag: rgba(255, 255, 255, 0.95);
  --bg-editor: #fafbfc;
  --text-primary: #1f2328;
  --text-secondary: #656d76;
  --text-tertiary: #8b949e;
  --border-color: #d0d7de;
  --border-toolbar: #d0d7de;
  --accent-color: #0969da;
  --accent-hover: #0550ae;
  --code-bg: #f6f8fa;
  --code-text: #1f2328;
  --code-border: #d0d7de;
  --blockquote-border: #d0d7de;
  --blockquote-bg: #f6f8fa;
  --table-border: #d0d7de;
  --table-stripe: #f6f8fa;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --scrollbar-thumb: #c1c8cd;
  --scrollbar-track: transparent;
  --btn-hover: rgba(0, 0, 0, 0.06);
  --btn-active: rgba(0, 0, 0, 0.1);
}

/* 暗色主题 */
[data-theme="dark"] {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-toolbar: #161b22;
  --bg-toc: #161b22;
  --bg-toc-hover: #1c2129;
  --bg-toc-active: #1c2a3a;
  --bg-drag: rgba(13, 17, 23, 0.95);
  --bg-editor: #0d1117;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --border-color: #30363d;
  --border-toolbar: #21262d;
  --accent-color: #58a6ff;
  --accent-hover: #79c0ff;
  --code-bg: #161b22;
  --code-text: #e6edf3;
  --code-border: #30363d;
  --blockquote-border: #30363d;
  --blockquote-bg: #161b22;
  --table-border: #30363d;
  --table-stripe: #161b22;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --scrollbar-thumb: #484f58;
  --scrollbar-track: transparent;
  --btn-hover: rgba(255, 255, 255, 0.06);
  --btn-active: rgba(255, 255, 255, 0.1);
}

/* 雅致主题 */
[data-theme="elegant"] {
  --bg-primary: #f6f1e8;
  --bg-secondary: #fbf7f1;
  --bg-toolbar: #fffdf8;
  --bg-toc: rgba(255, 255, 255, 0.68);
  --bg-toc-hover: rgba(15, 118, 110, 0.08);
  --bg-toc-active: rgba(15, 118, 110, 0.12);
  --bg-drag: rgba(246, 241, 232, 0.95);
  --bg-editor: #fffdf8;
  --text-primary: #161616;
  --text-secondary: #5c5c5c;
  --text-tertiary: #8a8a8a;
  --border-color: rgba(22, 22, 22, 0.12);
  --border-toolbar: rgba(22, 22, 22, 0.12);
  --accent-color: #0f766e;
  --accent-hover: #0d5d57;
  --code-bg: #111827;
  --code-text: #f9fafb;
  --code-border: rgba(255, 255, 255, 0.08);
  --blockquote-border: rgba(15, 118, 110, 0.14);
  --blockquote-bg: rgba(15, 118, 110, 0.08);
  --table-border: rgba(22, 22, 22, 0.12);
  --table-stripe: rgba(255, 255, 255, 0.5);
  --shadow-sm: 0 10px 30px rgba(25, 25, 25, 0.06);
  --shadow-md: 0 10px 30px rgba(25, 25, 25, 0.1);
  --scrollbar-thumb: rgba(22, 22, 22, 0.18);
  --scrollbar-track: transparent;
  --btn-hover: rgba(15, 118, 110, 0.08);
  --btn-active: rgba(15, 118, 110, 0.14);
  --font-display: "Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, serif;
}

[data-theme="elegant"] .app-container {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0)),
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.05), transparent 28%),
    radial-gradient(circle at left bottom, rgba(180, 83, 9, 0.05), transparent 24%),
    var(--bg-primary);
}

[data-theme="elegant"] .toolbar {
  background: var(--bg-toolbar);
  box-shadow: var(--shadow-sm);
}
[data-theme="elegant"] .main-content {
  align-items: flex-start;
}
[data-theme="elegant"] .toc-sidebar {
  background: var(--bg-toc);
  border: 1px solid var(--border-color);
  margin: 12px;
  box-shadow: var(--shadow-sm);
  border-radius: 10px;
  overflow: hidden;
  align-self: flex-start;
  height: auto;
  max-height: calc(100% - 24px);
}
[data-theme="elegant"] .toc-header {
  border-bottom-color: var(--border-color);
  font-family: var(--font-display);
}
[data-theme="elegant"] .toc-item:hover {
  background: var(--bg-toc-hover);
}
[data-theme="elegant"] .toc-item.active {
  background: var(--bg-toc-active);
  color: var(--accent-color);
}
[data-theme="elegant"] .content-area {
  padding: var(--viewer-preview-padding-y, 20px) var(--viewer-preview-padding-x, 20px);
}
[data-theme="elegant"] .split-preview {
  padding: var(--viewer-split-padding-y, 24px) var(--viewer-split-padding-x, 32px);
}
[data-theme="elegant"] .live-editor-view {
  padding: var(--viewer-preview-padding-y, 20px) var(--viewer-preview-padding-x, 20px);
}
[data-theme="elegant"] .markdown-body {
  font-family: var(--viewer-global-font-family, var(--font-body, inherit));
  line-height: 1.8;
  margin: 0 auto;
}
[data-theme="elegant"] .markdown-body h1 {
  font-family: var(
    --viewer-h1-font-family,
    var(--viewer-global-font-family, var(--font-display))
  );
  font-weight: var(--viewer-h1-font-weight, 600);
  font-size: var(--viewer-h1-font-size, clamp(1.8rem, 3vw, 2.6rem));
  border-bottom: 1px solid var(--border-color);
}
[data-theme="elegant"] .markdown-body h2 {
  font-family: var(
    --viewer-h2-font-family,
    var(--viewer-global-font-family, var(--font-display))
  );
  font-weight: var(--viewer-h2-font-weight, 600);
  font-size: var(--viewer-h2-font-size, clamp(1.4rem, 2vw, 1.8rem));
  border-bottom: 1px solid var(--border-color);
}
[data-theme="elegant"] .markdown-body h3 {
  font-family: var(
    --viewer-h3-font-family,
    var(--viewer-global-font-family, var(--font-display))
  );
  font-weight: var(--viewer-h3-font-weight, 600);
}
[data-theme="elegant"] .markdown-body h4 {
  font-family: var(
    --viewer-h4-font-family,
    var(--viewer-global-font-family, var(--font-display))
  );
  font-weight: var(--viewer-h4-font-weight, 600);
}
[data-theme="elegant"] .markdown-body code {
  background: rgba(15, 23, 42, 0.06);
  border-radius: 10px;
  padding: 0.12em 0.35em;
}
[data-theme="elegant"] .markdown-body pre {
  background: #111827;
  color: #f9fafb;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-left: 0;
  margin-right: 0;
}
[data-theme="elegant"] .markdown-body pre code {
  background: transparent;
  color: inherit;
}
[data-theme="elegant"] .markdown-body blockquote {
  background: var(--blockquote-bg);
  border-left-color: var(--accent-color);
  border-radius: 10px;
  margin-left: 0;
  margin-right: 0;
}
[data-theme="elegant"] .markdown-body .table-border {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--table-border);
  margin: 16px 0;
  background: rgba(255, 255, 255, 0.7);
}
[data-theme="elegant"] .markdown-body .table-scroll {
  overflow-x: visible;
}
[data-theme="elegant"] .markdown-body .table-border table {
  background: transparent;
  margin: 0;
  border: none;
  overflow: visible;
}
[data-theme="elegant"] .markdown-body .table-border table th,
[data-theme="elegant"] .markdown-body .table-border table td {
  border-left: none;
  border-right: none;
}
[data-theme="elegant"] .markdown-body .table-border table th:first-child {
  border-left: none;
}
[data-theme="elegant"] .markdown-body .table-border table td:first-child {
  border-left: none;
}
[data-theme="elegant"] .markdown-body .table-border table th:last-child {
  border-right: none;
}
[data-theme="elegant"] .markdown-body .table-border table td:last-child {
  border-right: none;
}
[data-theme="elegant"] .markdown-body .table-border table tr:last-child td {
  border-bottom: none;
}
[data-theme="elegant"] .markdown-body table th {
  background: rgba(15, 118, 110, 0.08);
}
[data-theme="elegant"] .markdown-body img {
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  display: block;
  margin: 16px auto;
  max-width: 90%;
}
[data-theme="elegant"] .markdown-body ul,
[data-theme="elegant"] .markdown-body ol {
  margin-left: 1em;
}
[data-theme="elegant"] .markdown-body hr {
  margin: 24px auto;
  max-width: 80%;
}
[data-theme="elegant"] .markdown-body .task-list {
  margin: 20px 0;
  padding-left: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
[data-theme="elegant"] .markdown-body .task-list-item {
  display: grid;
  grid-template-columns: 20px auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 16px 18px;
  margin: 0;
  border-radius: 10px;
  border: 1px solid rgba(22, 22, 22, 0.01);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(10px);
}
[data-theme="elegant"] .markdown-body .task-list-item.is-pending {
  border-color: rgba(180, 83, 9, 0.18);
  background: linear-gradient(90deg, rgba(180, 83, 9, 0.12), rgba(180, 83, 9, 0) 20%),
    rgba(255, 255, 255, 0.84);
}
[data-theme="elegant"] .markdown-body .task-list-item.is-complete {
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.12), rgba(15, 118, 110, 0) 10%),
    rgba(255, 255, 255, 0.52);
  box-shadow: none;
}
[data-theme="elegant"] .markdown-body .task-list-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  margin: 2px 0 0;
  border-radius: 999px;
  border: 2px solid rgba(15, 118, 110, 0.35);
  background: rgba(255, 255, 255, 0.95);
  position: relative;
  flex-shrink: 0;
}
[data-theme="elegant"] .markdown-body .task-list-item.is-pending .task-list-checkbox {
  border-color: rgba(180, 83, 9, 0.35);
}
[data-theme="elegant"] .markdown-body .task-list-checkbox[checked] {
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  border-color: #0f766e;
}
[data-theme="elegant"] .markdown-body .task-list-checkbox::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 1px;
  width: 5px;
  height: 10px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  opacity: 0;
}
[data-theme="elegant"] .markdown-body .task-list-checkbox[checked]::after {
  opacity: 1;
}
[data-theme="elegant"] .markdown-body .task-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
[data-theme="elegant"] .markdown-body .task-list-item.is-pending .task-status-badge {
  color: var(--viewer-task-badge-pending-color, #9a3412);
  font-family: var(--viewer-task-badge-pending-font-family, inherit);
  font-weight: var(--viewer-task-badge-pending-font-weight, 700);
  font-style: var(--viewer-task-badge-pending-font-style, normal);
  background: rgba(180, 83, 9, 0.12);
}
[data-theme="elegant"] .markdown-body .task-list-item.is-complete .task-status-badge {
  color: var(--viewer-task-badge-complete-color, #0f766e);
  font-family: var(--viewer-task-badge-complete-font-family, inherit);
  font-weight: var(--viewer-task-badge-complete-font-weight, 700);
  font-style: var(--viewer-task-badge-complete-font-style, normal);
  background: rgba(15, 118, 110, 0.12);
}
[data-theme="elegant"] .markdown-body .task-list-content {
  min-width: 0;
  margin-top: -2px;
}
[data-theme="elegant"] .markdown-body .task-list-item.is-pending .task-list-content {
  color: var(--viewer-task-pending-color, inherit);
  font-family: var(--viewer-task-pending-font-family, inherit);
  font-weight: var(--viewer-task-pending-font-weight, inherit);
  font-style: var(--viewer-task-pending-font-style, inherit);
}
[data-theme="elegant"] .markdown-body .task-list-content > :first-child {
  margin-top: 0;
}
[data-theme="elegant"] .markdown-body .task-list-content > :last-child {
  margin-bottom: 0;
}
[data-theme="elegant"] .markdown-body .task-list-item.is-complete .task-list-content {
  color: var(--viewer-task-complete-color, var(--text-secondary));
  font-family: var(--viewer-task-complete-font-family, inherit);
  font-weight: var(--viewer-task-complete-font-weight, inherit);
  font-style: var(--viewer-task-complete-font-style, inherit);
  text-decoration: line-through;
  text-decoration-thickness: 2px;
  text-decoration-color: rgba(15, 118, 110, 0.35);
}
[data-theme="elegant"] .markdown-body .task-list-item.is-complete .task-list-content a {
  color: var(--viewer-task-complete-color, #0f766e);
}
[data-theme="elegant"] .markdown-body .task-list-content > ul,
[data-theme="elegant"] .markdown-body .task-list-content > ol {
  margin-top: 10px;
  margin-left: 1.2em;
}

[data-ai-theme="true"] .app-container {
  background: var(--ai-app-background, var(--bg-primary));
}

[data-ai-theme="true"] .toolbar {
  background: var(--ai-toolbar-bg, var(--bg-toolbar));
  border-bottom: var(--ai-border-width, 1px) solid
    var(--ai-divider-color, var(--border-toolbar));
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--ai-surface-filter, none);
}

[data-ai-theme="true"] .toolbar-btn,
[data-ai-theme="true"] .window-control,
[data-ai-theme="true"] .view-mode-tab,
[data-ai-theme="true"] .title-conflict-action,
[data-ai-theme="true"] .icon-btn,
[data-ai-theme="true"] .switch-track,
[data-ai-theme="true"] .switch-track::after,
[data-ai-theme="true"] .test-status-pill,
[data-ai-theme="true"] .about-brand-mark,
[data-ai-theme="true"] .conflict-mark,
[data-ai-theme="true"] .prompt-icon,
[data-ai-theme="true"] .theme-prompt-icon,
[data-ai-theme="true"] .format-failure-icon,
[data-ai-theme="true"] .browser-zoom-actions > span,
[data-ai-theme="true"] .settings-primary-btn,
[data-ai-theme="true"] .settings-secondary-btn,
[data-ai-theme="true"] .settings-danger-btn,
[data-ai-theme="true"] .settings-link-btn,
[data-ai-theme="true"] .settings-close,
[data-ai-theme="true"] .theme-prompt-primary-btn,
[data-ai-theme="true"] .theme-prompt-secondary-btn,
[data-ai-theme="true"] .theme-prompt-close,
[data-ai-theme="true"] .prompt-primary-btn,
[data-ai-theme="true"] .prompt-secondary-btn,
[data-ai-theme="true"] .prompt-close,
[data-ai-theme="true"] .preview-primary-btn,
[data-ai-theme="true"] .preview-secondary-btn,
[data-ai-theme="true"] .preview-close,
[data-ai-theme="true"] .format-primary-btn,
[data-ai-theme="true"] .format-secondary-btn,
[data-ai-theme="true"] .format-text-btn,
[data-ai-theme="true"] .theme-apply-btn,
[data-ai-theme="true"] .theme-delete-btn,
[data-ai-theme="true"] .generate-theme-btn,
[data-ai-theme="true"] .conflict-footer button,
[data-ai-theme="true"] .custom-header-remove,
[data-ai-theme="true"] .color-swatch,
[data-ai-theme="true"] .section-toggle,
[data-ai-theme="true"] .preset-btn,
[data-ai-theme="true"] .tab-btn,
[data-ai-theme="true"] .seg-btn {
  border-radius: var(--ai-control-radius, 8px);
}

[data-ai-theme="true"] .toolbar-btn {
  border: 1px solid transparent;
  background: var(--ai-button-bg, transparent);
  box-shadow: none;
}

[data-ai-theme="true"] .settings-secondary-btn,
[data-ai-theme="true"] .settings-danger-btn,
[data-ai-theme="true"] .theme-prompt-secondary-btn,
[data-ai-theme="true"] .prompt-secondary-btn,
[data-ai-theme="true"] .preview-secondary-btn,
[data-ai-theme="true"] .format-secondary-btn,
[data-ai-theme="true"] .settings-link-btn,
[data-ai-theme="true"] .format-text-btn,
[data-ai-theme="true"] .theme-apply-btn,
[data-ai-theme="true"] .theme-delete-btn,
[data-ai-theme="true"] .icon-btn,
[data-ai-theme="true"] .inline-reset-btn,
[data-ai-theme="true"] .settings-close,
[data-ai-theme="true"] .theme-prompt-close,
[data-ai-theme="true"] .prompt-close,
[data-ai-theme="true"] .preview-close,
[data-ai-theme="true"] .custom-header-remove,
[data-ai-theme="true"] .color-swatch,
[data-ai-theme="true"] .conflict-footer button {
  border-color: var(--ai-button-border, var(--border-color));
  background: var(--ai-button-bg, transparent);
  box-shadow: var(--ai-control-shadow, none);
}

[data-ai-theme="true"] .inline-reset-btn,
[data-ai-theme="true"] .settings-link-btn,
[data-ai-theme="true"] .format-text-btn,
[data-ai-theme="true"] .custom-header-remove {
  border: 1px solid var(--ai-button-border, var(--border-color));
  text-decoration: none;
}

[data-ai-theme="true"] .inline-reset-btn {
  padding: 2px 8px;
}

[data-ai-theme="true"] .color-swatch {
  border: 1px solid var(--ai-button-border, var(--border-color));
}

[data-ai-theme="true"] .settings-primary-btn,
[data-ai-theme="true"] .theme-prompt-primary-btn,
[data-ai-theme="true"] .prompt-primary-btn,
[data-ai-theme="true"] .preview-primary-btn,
[data-ai-theme="true"] .format-primary-btn,
[data-ai-theme="true"] .generate-theme-btn {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: var(--ai-primary-button-text, #ffffff);
  box-shadow: var(--ai-control-shadow, none);
}

[data-ai-theme="true"] .settings-primary-btn:hover:not(:disabled),
[data-ai-theme="true"] .theme-prompt-primary-btn:hover:not(:disabled),
[data-ai-theme="true"] .prompt-primary-btn:hover:not(:disabled),
[data-ai-theme="true"] .preview-primary-btn:hover:not(:disabled),
[data-ai-theme="true"] .format-primary-btn:hover:not(:disabled),
[data-ai-theme="true"] .generate-theme-btn:hover:not(:disabled) {
  background: var(--accent-hover, var(--accent-color));
  border-color: var(--accent-hover, var(--accent-color));
}

[data-ai-theme="true"] .toolbar-btn:hover,
[data-ai-theme="true"] .window-control:hover,
[data-ai-theme="true"] .view-mode-tab:hover,
[data-ai-theme="true"] .icon-btn:hover,
[data-ai-theme="true"] .settings-secondary-btn:hover:not(:disabled),
[data-ai-theme="true"] .theme-prompt-secondary-btn:hover:not(:disabled),
[data-ai-theme="true"] .prompt-secondary-btn:hover:not(:disabled),
[data-ai-theme="true"] .preview-secondary-btn:hover:not(:disabled),
[data-ai-theme="true"] .format-secondary-btn:hover:not(:disabled),
[data-ai-theme="true"] .settings-link-btn:hover:not(:disabled),
[data-ai-theme="true"] .inline-reset-btn:hover,
[data-ai-theme="true"] .settings-close:hover,
[data-ai-theme="true"] .theme-prompt-close:hover,
[data-ai-theme="true"] .prompt-close:hover,
[data-ai-theme="true"] .preview-close:hover,
[data-ai-theme="true"] .format-text-btn:hover,
[data-ai-theme="true"] .model-list-item:hover,
[data-ai-theme="true"] .conflict-footer button:hover:not(:disabled) {
  background: var(--ai-button-hover-bg, var(--btn-hover));
}

[data-ai-theme="true"] .settings-danger-btn:hover:not(:disabled),
[data-ai-theme="true"] .theme-delete-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, #ef4444 60%, var(--ai-button-border, var(--border-color)));
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

[data-ai-theme="true"] .toolbar-btn.active,
[data-ai-theme="true"] .view-mode-tab.active {
  background: var(--ai-button-active-bg, var(--accent-color));
  color: var(--ai-primary-button-text, #ffffff);
  box-shadow: var(--ai-control-shadow, none);
}

[data-ai-theme="true"] .view-mode-tabs,
[data-ai-theme="true"] .zoom-controls {
  border-color: var(--ai-divider-color, var(--border-color));
}

[data-ai-theme="true"] .view-mode-tabs {
  border-radius: var(--ai-control-radius, 8px);
  background: var(--ai-elevated-bg, var(--bg-toolbar));
  box-shadow: var(--ai-control-shadow, none);
}

[data-ai-theme="true"] .window-controls {
  border-left-color: var(--ai-divider-color, var(--border-toolbar));
}

[data-ai-theme="true"] .switch-track {
  background: color-mix(in srgb, var(--ai-divider-color, var(--border-color)) 88%, transparent);
}

[data-ai-theme="true"] .switch input:checked + .switch-track {
  background: var(--accent-color);
}

[data-ai-theme="true"] .switch-track::after {
  box-shadow: var(--ai-control-shadow, none);
}

[data-ai-theme="true"] .toc-sidebar,
[data-ai-theme="true"] .style-config-panel,
[data-ai-theme="true"] .settings-modal,
[data-ai-theme="true"] .theme-prompt-modal,
[data-ai-theme="true"] .format-prompt-modal,
[data-ai-theme="true"] .format-preview-modal,
[data-ai-theme="true"] .format-failure-modal,
[data-ai-theme="true"] .conflict-modal {
  background: var(--ai-sidebar-bg, var(--bg-toc));
  border-color: var(--ai-divider-color, var(--border-color));
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--ai-surface-filter, none);
}

[data-ai-theme="true"] .style-config-panel,
[data-ai-theme="true"] .settings-modal,
[data-ai-theme="true"] .theme-prompt-modal,
[data-ai-theme="true"] .format-prompt-modal,
[data-ai-theme="true"] .format-preview-modal,
[data-ai-theme="true"] .format-failure-modal,
[data-ai-theme="true"] .conflict-modal,
[data-ai-theme="true"] .control-section,
[data-ai-theme="true"] .override-card,
[data-ai-theme="true"] .smart-theme-card,
[data-ai-theme="true"] .smart-theme-empty,
[data-ai-theme="true"] .preview-pane,
[data-ai-theme="true"] .persistence-card,
[data-ai-theme="true"] .browser-zoom-card,
[data-ai-theme="true"] .about-card,
[data-ai-theme="true"] .model-manager,
[data-ai-theme="true"] .model-test-summary,
[data-ai-theme="true"] .conflict-option,
[data-ai-theme="true"] .loading-content,
[data-ai-theme="true"] .toast-container {
  border-radius: var(--ai-card-radius, 14px);
}

[data-ai-theme="true"] .control-section,
[data-ai-theme="true"] .override-card,
[data-ai-theme="true"] .smart-theme-card,
[data-ai-theme="true"] .smart-theme-empty,
[data-ai-theme="true"] .preview-pane,
[data-ai-theme="true"] .persistence-card,
[data-ai-theme="true"] .browser-zoom-card,
[data-ai-theme="true"] .about-card,
[data-ai-theme="true"] .model-manager,
[data-ai-theme="true"] .model-test-summary,
[data-ai-theme="true"] .conflict-option {
  background: var(--ai-surface-bg, var(--bg-primary));
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--ai-surface-filter, none);
}

[data-ai-theme="true"] .panel-header,
[data-ai-theme="true"] .section-toggle,
[data-ai-theme="true"] .settings-header,
[data-ai-theme="true"] .settings-nav,
[data-ai-theme="true"] .model-list,
[data-ai-theme="true"] .theme-prompt-header,
[data-ai-theme="true"] .theme-prompt-actions,
[data-ai-theme="true"] .format-prompt-header,
[data-ai-theme="true"] .format-prompt-actions,
[data-ai-theme="true"] .format-preview-header,
[data-ai-theme="true"] .format-preview-actions,
[data-ai-theme="true"] .pane-title {
  background: var(--ai-elevated-bg, var(--bg-toolbar));
}

[data-ai-theme="true"] .toc-header,
[data-ai-theme="true"] .settings-header,
[data-ai-theme="true"] .theme-prompt-header,
[data-ai-theme="true"] .theme-prompt-actions,
[data-ai-theme="true"] .format-prompt-header,
[data-ai-theme="true"] .format-prompt-actions,
[data-ai-theme="true"] .format-preview-header,
[data-ai-theme="true"] .format-preview-actions,
[data-ai-theme="true"] .format-failure-copy,
[data-ai-theme="true"] .pane-title,
[data-ai-theme="true"] .section-toggle,
[data-ai-theme="true"] .control-section,
[data-ai-theme="true"] .override-card,
[data-ai-theme="true"] .smart-theme-card {
  border-color: var(--ai-divider-color, var(--border-color));
}

[data-ai-theme="true"] .toc-item,
[data-ai-theme="true"] .file-tree-row,
[data-ai-theme="true"] .settings-nav-item,
[data-ai-theme="true"] .model-list-item,
[data-ai-theme="true"] .inline-reset-btn {
  border-radius: var(--ai-control-radius, 8px);
}

[data-ai-theme="true"] .toc-item:hover,
[data-ai-theme="true"] .file-tree-row:hover,
[data-ai-theme="true"] .settings-nav-item:hover {
  background: var(--bg-toc-hover);
}

[data-ai-theme="true"] .toc-item.active,
[data-ai-theme="true"] .file-tree-row.is-active,
[data-ai-theme="true"] .settings-nav-item.active,
[data-ai-theme="true"] .model-list-item.active,
[data-ai-theme="true"] .tab-btn.active,
[data-ai-theme="true"] .seg-btn.active {
  background: var(--bg-toc-active);
  color: var(--accent-color);
}

[data-ai-theme="true"] .content-area,
[data-ai-theme="true"] .split-preview,
[data-ai-theme="true"] .live-editor-view,
[data-ai-theme="true"] .split-editor,
[data-ai-theme="true"] .editor,
[data-ai-theme="true"] .plain-text-editor,
[data-ai-theme="true"] .plain-text-preview {
  background: var(--ai-editor-bg, transparent);
}

[data-ai-theme="true"] .split-editor,
[data-ai-theme="true"] .editor,
[data-ai-theme="true"] .plain-text-editor,
[data-ai-theme="true"] .settings-field input,
[data-ai-theme="true"] .theme-prompt-body textarea,
[data-ai-theme="true"] .format-prompt-body textarea,
[data-ai-theme="true"] .format-model-field select,
[data-ai-theme="true"] .custom-header-row > input,
[data-ai-theme="true"] .color-input,
[data-ai-theme="true"] .app-select {
  border-color: var(--ai-divider-color, var(--border-color));
  border-radius: var(--ai-control-radius, 8px);
  background: var(--ai-surface-bg, var(--bg-secondary));
  box-shadow: var(--ai-control-shadow, none);
}

[data-ai-theme="true"] .app-slider,
[data-ai-theme="true"] .preview-scroll {
  border-radius: var(--ai-control-radius, 8px);
}

[data-ai-theme="true"] .preset-dot,
[data-ai-theme="true"] .theme-swatches span,
[data-ai-theme="true"] .model-status-dot {
  border-radius: 999px;
}

[data-ai-theme="true"] .split-divider::before,
[data-ai-theme="true"] .toc-resize-handle::after {
  background: var(--ai-divider-color, var(--border-color));
}

[data-ai-theme="true"] .back-to-top-btn {
  border-color: var(--ai-divider-color, var(--border-color));
  border-radius: var(--ai-control-radius, 999px);
  background: var(--ai-elevated-bg, var(--bg-toolbar));
  box-shadow: var(--shadow-sm);
  backdrop-filter: var(--ai-surface-filter, none);
}

[data-ai-theme="true"] .markdown-body pre,
[data-ai-theme="true"] .code-block {
  box-shadow: var(--shadow-sm);
}

[data-ai-theme="true"] .content-area::-webkit-scrollbar,
[data-ai-theme="true"] .editor::-webkit-scrollbar,
[data-ai-theme="true"] .split-editor::-webkit-scrollbar,
[data-ai-theme="true"] .split-preview::-webkit-scrollbar,
[data-ai-theme="true"] .toc-list::-webkit-scrollbar,
[data-ai-theme="true"] .file-tree-panel::-webkit-scrollbar,
[data-ai-theme="true"] .live-editor-view::-webkit-scrollbar,
[data-ai-theme="true"] .smart-theme-list::-webkit-scrollbar {
  width: var(--ai-scrollbar-size, 8px);
  height: var(--ai-scrollbar-size, 8px);
}

[data-ai-theme="true"] .content-area::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .editor::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .split-editor::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .split-preview::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .toc-list::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .file-tree-panel::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .live-editor-view::-webkit-scrollbar-thumb,
[data-ai-theme="true"] .smart-theme-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--scrollbar-thumb);
  background-clip: content-box;
}

[data-ai-theme="true"] .markdown-body h1,
[data-ai-theme="true"] .markdown-body h2 {
  padding: var(--ai-markdown-heading-padding, 0 0 0.3em);
  border-bottom-color: var(--ai-markdown-heading-border, var(--border-color));
  border-radius: var(--ai-markdown-heading-radius, 0);
  background: var(--ai-markdown-heading-bg, transparent);
  box-shadow: var(--ai-markdown-heading-shadow, none);
}

[data-ai-theme="true"] .markdown-body h3,
[data-ai-theme="true"] .markdown-body h4 {
  border-radius: var(--ai-markdown-heading-radius, 0);
}

[data-ai-theme="true"] .markdown-body a,
[data-ai-theme="true"] .markdown-body strong {
  color: var(--accent-color);
}

[data-ai-theme="true"] .markdown-body code {
  color: var(--ai-markdown-code-text, var(--code-text));
  background: var(--ai-markdown-code-bg, var(--code-bg));
  border-color: var(--ai-markdown-code-border, var(--code-border));
  border-radius: var(--ai-markdown-code-radius, 10px);
}

[data-ai-theme="true"] .markdown-body pre {
  color: var(--ai-markdown-code-text, var(--code-text));
  background: var(--ai-markdown-code-bg, var(--code-bg));
  border-color: var(--ai-markdown-code-border, var(--code-border));
  border-radius: var(--ai-markdown-code-radius, 10px);
}

[data-ai-theme="true"] .markdown-body pre code {
  background: transparent;
  border: 0;
}

[data-ai-theme="true"] .markdown-body blockquote {
  border-left-color: var(--blockquote-border);
  border-radius: var(--ai-markdown-block-radius, 10px);
  background: var(--ai-markdown-block-bg, var(--blockquote-bg));
}

[data-ai-theme="true"] .markdown-body .table-border {
  overflow: hidden;
  border: 1px solid var(--table-border);
  border-radius: var(--ai-markdown-table-radius, 10px);
  background: var(--ai-markdown-table-bg, transparent);
  box-shadow: var(--ai-markdown-table-shadow, none);
}

[data-ai-theme="true"] .markdown-body .table-scroll {
  border-radius: inherit;
}

[data-ai-theme="true"] .markdown-body table th {
  background: var(--ai-markdown-table-header-bg, var(--bg-secondary));
}

[data-ai-theme="true"] .markdown-body img {
  border-radius: var(--ai-markdown-image-radius, 10px);
  box-shadow: var(--ai-markdown-image-shadow, none);
}

[data-ai-theme="true"] .markdown-body hr {
  background: linear-gradient(90deg, transparent, var(--accent-color), transparent);
}

[data-ai-theme="true"] .markdown-body .task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

[data-ai-theme="true"] .markdown-body .task-list-item {
  display: grid;
  grid-template-columns: 20px auto minmax(0, 1fr);
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--ai-divider-color, var(--border-color));
  border-radius: var(--ai-markdown-task-radius, 10px);
  background: var(--ai-markdown-task-bg, transparent);
  box-shadow: var(--ai-markdown-task-shadow, none);
}

[data-ai-theme="true"] .markdown-body .task-list-item.is-pending {
  background:
    linear-gradient(90deg, var(--ai-markdown-task-pending-bg, transparent), transparent 24%),
    var(--ai-markdown-task-bg, transparent);
}

[data-ai-theme="true"] .markdown-body .task-list-item.is-complete {
  background:
    linear-gradient(90deg, var(--ai-markdown-task-complete-bg, transparent), transparent 18%),
    var(--ai-markdown-task-bg, transparent);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", Helvetica,
    Arial, sans-serif;
}
#app {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.app-container {
  width: var(--browser-zoom-viewport-width, 100%);
  height: var(--browser-zoom-viewport-height, 100vh);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  position: relative;
  transform-origin: 0 0;
  transform: scale(var(--browser-zoom-scale, 1));
  will-change: transform;
  overflow: hidden;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-drag);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px dashed var(--accent-color);
  border-radius: 10px;
  margin: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.app-container.dragging .drag-overlay {
  opacity: 1;
  pointer-events: auto;
}
.drag-hint {
  text-align: center;
  color: var(--accent-color);
}
.drag-hint svg {
  margin-bottom: 12px;
}
.drag-hint p {
  font-size: 18px;
  font-weight: 500;
}

.toolbar {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-toolbar);
  flex-shrink: 0;
  --wails-draggable: drag;
  -webkit-app-region: drag;
  user-select: none;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  --wails-draggable: no-drag;
  -webkit-app-region: no-drag;
}
.toolbar-center {
  flex: 1;
  min-width: 70px;
  margin-left: 20px;
  overflow: hidden;
  --wails-draggable: drag;
  -webkit-app-region: drag;
}
.file-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.file-name {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
  display: inline-block;
}

.file-conflict-status {
  flex-shrink: 0;
  padding: 3px 7px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  --wails-draggable: no-drag;
  -webkit-app-region: no-drag;
}

.title-conflict-action {
  width: 25px;
  height: 25px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  cursor: pointer;
  --wails-draggable: no-drag;
  -webkit-app-region: no-drag;
}

.title-conflict-action:hover {
  background: rgba(245, 158, 11, 0.22);
}

.title-conflict-action svg {
  width: 14px;
  height: 14px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: all 0.15s ease;
  --wails-draggable: no-drag;
  -webkit-app-region: no-drag;
}
.toolbar-btn:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}
.toolbar-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.toolbar-btn.active {
  background: var(--btn-active);
  color: var(--accent-color);
}
.toolbar-btn span {
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}
.toolbar-btn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: 8px;
  padding-right: 8px;
  border-right: 1px solid var(--border-color);
}
.zoom-btn {
  padding: 5px 6px;
}
.zoom-btn svg {
  width: 14px;
  height: 14px;
}
.zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.zoom-value {
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 500;
  min-width: 42px;
  justify-content: center;
}

.view-mode-tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-right: 8px;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-toolbar) 92%, white),
      var(--bg-toolbar)
    ),
    var(--bg-toolbar);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 35%, transparent);
}
.view-mode-tab {
  height: 21px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease,
    transform 0.18s ease;
}
.view-mode-tab:hover {
  color: var(--text-primary);
  background: var(--btn-hover);
}
.view-mode-tab.active {
  color: #ffffff;
  background: var(--accent-color);
}
.view-mode-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-color) 58%, transparent);
  outline-offset: 2px;
}
.theme-btn {
  margin-right: 4px;
}
.theme-btn .theme-name {
  font-size: 12px;
  white-space: nowrap;
}
.smart-format-btn {
  margin-right: 8px;
  color: var(--accent-color);
  /* background: color-mix(in srgb, var(--accent-color) 9%, transparent); */
}
.smart-format-btn:hover {
  color: #ffffff;
  background: var(--accent-color);
}
.settings-btn {
  margin-left: 2px;
  border: 1px solid color-mix(in srgb, var(--border-color) 85%, transparent);
}

.window-controls {
  height: 44px;
  align-self: stretch;
  display: flex;
  align-items: stretch;
  margin-left: 4px;
  border-left: 1px solid var(--border-toolbar);
  --wails-draggable: no-drag;
  -webkit-app-region: no-drag;
}

.window-control {
  width: 43px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}

.window-control:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.window-control.window-close:hover {
  background: #c42b1c;
  color: #ffffff;
}

.window-control svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

@media (max-width: 1120px) {
  .toolbar-left .toolbar-btn span,
  .smart-format-btn span:not(.loading-spinner-sm),
  .style-config-btn span,
  .settings-btn span,
  .theme-name {
    display: none;
  }

  .toolbar-btn {
    padding-inline: 7px;
  }

  .zoom-controls,
  .view-mode-tabs,
  .smart-format-btn {
    margin-right: 4px;
  }
}

/* Loading 遮罩 */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 32px;
  background: var(--bg-toolbar);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
}
.loading-spinner-large {
  width: 32px;
  height: 32px;
  border: 3px solid var(--text-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.loading-message {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
}

/* Loading spinner */
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid var(--text-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.main-content {
  flex: 1;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  min-height: 0;
  contain: layout;
}

.document-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.toc-sidebar {
  position: relative;
  min-width: 120px;
  max-width: 600px;
  height: 100%;
  background: var(--bg-toc);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  align-self: stretch;
  min-height: 0;
  max-height: none;
}
.toc-header {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  white-space: nowrap;
}
.sidebar-tabs {
  min-height: 40px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 7px 8px 0;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.sidebar-tab {
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  padding: 0 9px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
}
.sidebar-tab:hover {
  color: var(--text-primary);
  /* background: var(--bg-toc-hover); */
}
.sidebar-tab.active {
  /* border-bottom-color: var(--accent-color); */
  color: var(--accent-color);
  font-weight: 700;
}
.sidebar-tab span {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
}
.file-tree-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 5px 0 10px;
}
.toc-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.file-tree-panel,
.toc-list {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.toc-item {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.15s ease;
  border-left: 3px solid transparent;
}
.toc-item:hover {
  background: var(--bg-toc-hover);
  color: var(--text-primary);
}
.toc-item.active {
  background: var(--bg-toc-active);
  color: var(--accent-color);
  border-left-color: var(--accent-color);
}
.toc-h1 {
  font-weight: bold;
}
.toc-h2 {
  font-weight: bold;
}
.toc-h3 {
  font-weight: 400;
  font-size: 12px;
}
.toc-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.toc-resize-handle:hover {
  background: var(--accent-color);
  opacity: 0.3;
}

/* 编辑器样式 */
.edit-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.editor {
  width: 100%;
  height: 100%;
  padding: 24px;
  border: none;
  background: var(--bg-editor);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
}
.editor::placeholder {
  color: var(--text-tertiary);
}

/* 分屏模式 */
.split-workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow: hidden;
  height: var(--browser-zoom-content-height, calc(100vh - 44px));
}

.split-container {
  flex: 0 0 var(--split-editor-width, 50%);
  min-width: 220px;
  display: flex;
  overflow: hidden;
  height: 100%;
}

.split-editor {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 20px;
  border: none;
  background: var(--bg-editor);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
}
.split-divider {
  flex: 0 0 10px;
  width: 10px;
  position: relative;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
}
.split-divider::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 1px;
  background: var(--border-color);
  transition: background 0.2s ease, box-shadow 0.2s ease, width 0.2s ease, left 0.2s ease;
}
.split-divider:hover::before,
.split-workspace.resizing .split-divider::before {
  left: 3px;
  width: 3px;
  background: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 16%, transparent);
}
.split-preview {
  flex: 1 1 0;
  min-width: 220px;
  overflow-y: auto;
  padding: var(--viewer-split-padding-y, 20px) var(--viewer-split-padding-x, 24px);
  height: 100%;
  max-height: none;
}

.plain-text-preview {
  min-width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 20px 24px;
  overflow: visible;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: "Cascadia Code", "Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace;
  font-size: var(--base-font-size, 16px);
  line-height: 1.68;
  tab-size: 4;
  white-space: pre;
}

.plain-text-preview.standalone {
  width: min(100%, var(--viewer-content-max-width, 100%));
  margin: 0 auto;
  padding: 0;
}

.plain-text-preview code {
  color: inherit;
  font: inherit;
}

.live-editor-view {
  flex: 1;
  overflow-y: auto;
  max-height: var(--browser-zoom-content-height, calc(100vh - 44px));
  padding: var(--viewer-preview-padding-y, 20px) var(--viewer-preview-padding-x, 20px);
  /* background: var(--bg-primary); */
  color: var(--viewer-global-color, var(--text-primary));
}

.plain-text-editor {
  width: min(100%, var(--viewer-content-max-width, 100%));
  min-height: 100%;
  display: block;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  caret-color: var(--accent-color);
  font-family: "Cascadia Code", "Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace;
  font-size: var(--base-font-size, 16px);
  line-height: 1.68;
  tab-size: 4;
  white-space: pre;
}

.live-editor-shell {
  width: min(100%, var(--viewer-content-max-width, 100%));
  margin: 0 auto;
  color: var(--viewer-global-color, var(--text-primary));
  font-family: var(--viewer-global-font-family, inherit);
  font-size: var(--viewer-body-font-size, var(--base-font-size, 16px));
  font-weight: var(--viewer-global-font-weight, inherit);
  font-style: var(--viewer-global-font-style, inherit);
  line-height: 1.8;
}

.live-editor-shell .live-edit-surface,
.live-editor-shell .live-edit-host,
.live-editor-shell .md-live-editor-host {
  min-height: 100%;
}

/* Live edit DOMD theme bridge: keep this module removable and scoped. */
.live-editor-shell .DOMD-Root {
  --domd-base-100: var(--bg-primary);
  --domd-base-200: var(--bg-secondary);
  --domd-base-300: var(--bg-toolbar);
  --domd-base-content: var(--viewer-global-color, var(--text-primary));
  --domd-info-content: var(--viewer-a-color, var(--accent-color));
  --domd-info: var(--accent-color);
  --domd-text: var(--viewer-global-color, var(--text-primary));
  --domd-blockquote-text: var(--text-secondary);
  --domd-link-text: var(--viewer-a-color, var(--accent-color));
  --domd-placeholder-text: var(--text-tertiary);
  --domd-border: var(--border-color);
  --domd-table-border: var(--table-border);
  --domd-blockquote-border: var(--blockquote-border);
  --domd-hr-bg: var(--border-color);
  --domd-hr-active: var(--accent-color);
  --domd-code-bg: var(--code-bg);
  --domd-pre-bg: var(--code-bg);
  --domd-pre-topbar-bg: var(--code-bg);
  --domd-font-size-base: var(--viewer-body-font-size, var(--base-font-size, 16px));
  --domd-font-size-h1: var(--viewer-h1-font-size, 2em);
  --domd-font-size-h2: var(--viewer-h2-font-size, 1.5em);
  --domd-font-size-h3: var(--viewer-h3-font-size, 1.25em);
  --domd-font-size-h4: var(--viewer-h4-font-size, 1em);
  --domd-font-size-h5: var(--viewer-h5-font-size, 0.875em);
  --domd-font-size-h6: var(--viewer-h6-font-size, 0.85em);
  color: var(--viewer-global-color, var(--text-primary));
  font-family: var(--viewer-global-font-family, inherit);
  font-size: var(--viewer-body-font-size, var(--base-font-size, 16px));
  font-weight: var(--viewer-global-font-weight, inherit);
  font-style: var(--viewer-global-font-style, inherit);
  line-height: 1.7;
  caret-color: var(--accent-color);
  background: transparent;
}

.live-editor-shell h1,
.live-editor-shell .DOMD-H1 {
  font-size: var(--viewer-h1-font-size, 2em);
  color: var(--viewer-h1-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h1-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h1-font-weight, 600);
  font-style: var(--viewer-h1-font-style, normal);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

.live-editor-shell h2,
.live-editor-shell .DOMD-H2 {
  font-size: var(--viewer-h2-font-size, 1.5em);
  color: var(--viewer-h2-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h2-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h2-font-weight, 600);
  font-style: var(--viewer-h2-font-style, normal);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

.live-editor-shell h3,
.live-editor-shell .DOMD-H3 {
  font-size: var(--viewer-h3-font-size, 1.25em);
  color: var(--viewer-h3-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h3-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h3-font-weight, 600);
  font-style: var(--viewer-h3-font-style, normal);
}

.live-editor-shell h4,
.live-editor-shell .DOMD-H4 {
  font-size: var(--viewer-h4-font-size, 1em);
  color: var(--viewer-h4-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h4-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h4-font-weight, 600);
  font-style: var(--viewer-h4-font-style, normal);
}

.live-editor-shell h5,
.live-editor-shell .DOMD-H5 {
  font-size: var(--viewer-h5-font-size, 0.875em);
  color: var(--viewer-h5-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h5-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h5-font-weight, 600);
  font-style: var(--viewer-h5-font-style, normal);
}

.live-editor-shell h6,
.live-editor-shell .DOMD-H6 {
  font-size: var(--viewer-h6-font-size, 0.85em);
  color: var(--viewer-h6-color, var(--viewer-global-color, var(--text-secondary)));
  font-family: var(--viewer-h6-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h6-font-weight, 600);
  font-style: var(--viewer-h6-font-style, normal);
}

.live-editor-shell p,
.live-editor-shell .DOMD-P,
.live-editor-shell .DOMD-EmptyP,
.live-editor-shell .DOMD-LiP {
  color: var(--viewer-p-color, inherit);
  font-family: var(--viewer-p-font-family, inherit);
  font-weight: var(--viewer-p-font-weight, inherit);
  font-style: var(--viewer-p-font-style, inherit);
}

.live-editor-shell a,
.live-editor-shell .DOMD-Link {
  color: var(--viewer-a-color, var(--accent-color));
  font-family: var(--viewer-a-font-family, inherit);
  font-weight: var(--viewer-a-font-weight, inherit);
  font-style: var(--viewer-a-font-style, inherit);
  text-decoration: none;
}

.live-editor-shell a:hover,
.live-editor-shell .DOMD-Link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}

.live-editor-shell strong,
.live-editor-shell .DOMD-Bold {
  color: var(--viewer-strong-color, inherit);
  font-family: var(--viewer-strong-font-family, inherit);
  font-weight: var(--viewer-strong-font-weight, 600);
  font-style: var(--viewer-strong-font-style, inherit);
}

.live-editor-shell em,
.live-editor-shell .DOMD-Em {
  color: var(--viewer-em-color, inherit);
  font-family: var(--viewer-em-font-family, inherit);
  font-weight: var(--viewer-em-font-weight, inherit);
  font-style: var(--viewer-em-font-style, italic);
}

.live-editor-shell .DOMD-EmBold {
  color: var(--viewer-strong-color, var(--viewer-em-color, inherit));
  font-family: var(--viewer-strong-font-family, var(--viewer-em-font-family, inherit));
  font-weight: var(--viewer-strong-font-weight, 700);
  font-style: var(--viewer-em-font-style, italic);
}

.live-editor-shell blockquote,
.live-editor-shell .DOMD-Blockquote {
  color: var(--text-secondary);
  border-left: 4px solid var(--blockquote-border);
  background: var(--blockquote-bg);
  border-radius: 10px;
}

.live-editor-shell code,
.live-editor-shell .DOMD-Code {
  color: var(--code-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 10px;
}

.live-editor-shell pre,
.live-editor-shell .DOMD-Pre {
  color: var(--code-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 10px;
}

.live-editor-shell .DOMD-PreCode,
.live-editor-shell .DOMD-PreCodeEmpty,
.live-editor-shell .DOMD-PreCodeContent,
.live-editor-shell [class*="DOMD-CodeSpan"] {
  color: var(--code-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.live-editor-shell .DOMD-PreCodeTopBar {
  color: color-mix(in srgb, var(--code-text) 72%, transparent);
  background: color-mix(in srgb, var(--code-bg) 92%, var(--bg-toolbar));
  border-bottom: 1px solid var(--code-border);
}

.live-editor-shell table,
.live-editor-shell .DOMD-Table {
  border-collapse: collapse;
}

.live-editor-shell th,
.live-editor-shell td,
.live-editor-shell .DOMD-TH,
.live-editor-shell .DOMD-TD {
  border: 1px solid var(--table-border);
  color: inherit;
}

.live-editor-shell th,
.live-editor-shell .DOMD-TH {
  background: var(--bg-secondary);
  font-weight: 600;
}

.live-editor-shell tr:nth-child(2n),
.live-editor-shell .DOMD-TR:nth-child(2n) {
  background: var(--table-stripe);
}

.live-editor-shell ul,
.live-editor-shell ol,
.live-editor-shell .DOMD-Ul,
.live-editor-shell .DOMD-Ol,
.live-editor-shell .DOMD-CheckBoxUl {
  color: inherit;
  font-family: inherit;
}

.live-editor-shell li,
.live-editor-shell .DOMD-li {
  color: inherit;
}

.live-editor-shell .DOMD-CheckBoxLabel input {
  accent-color: var(--accent-color);
}

.live-editor-shell .DOMD-CheckBoxLi {
  position: relative;
  color: var(--viewer-task-pending-color, var(--viewer-p-color, inherit));
  font-family: var(
    --viewer-task-pending-font-family,
    var(--viewer-p-font-family, inherit)
  );
  font-weight: var(
    --viewer-task-pending-font-weight,
    var(--viewer-p-font-weight, inherit)
  );
  font-style: var(--viewer-task-pending-font-style, var(--viewer-p-font-style, inherit));
}

.live-editor-shell .DOMD-CheckBoxLi > .DOMD-LiP {
  min-width: 0;
}

.live-editor-shell .DOMD-CheckBoxLi:has(input[type="checkbox"]:checked) {
  color: var(--viewer-task-complete-color, var(--text-secondary));
  font-family: var(
    --viewer-task-complete-font-family,
    var(--viewer-p-font-family, inherit)
  );
  font-weight: var(
    --viewer-task-complete-font-weight,
    var(--viewer-p-font-weight, inherit)
  );
  font-style: var(--viewer-task-complete-font-style, var(--viewer-p-font-style, inherit));
  opacity: 0.82;
}

.live-editor-shell .DOMD-CheckBoxLi:has(input[type="checkbox"]:checked) .DOMD-LiP {
  text-decoration: line-through;
}

.live-editor-shell img,
.live-editor-shell .DOMD-Img {
  max-width: 100%;
}

/* 保存按钮样式 */
.save-btn {
  color: #ffffff;
  background: var(--accent-color);
}

.reset-edit-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.reset-edit-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* Toast 提示样式 */
.toast-container {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--bg-toolbar);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  z-index: 2000;
  font-size: 14px;
}
.toast-container.success {
  color: #10b981;
  border: 1px solid #10b981;
}
.toast-container.error {
  color: #ef4444;
  border: 1px solid #ef4444;
}
.toast-enter-active {
  animation: toastIn 0.3s ease;
}
.toast-leave-active {
  animation: toastOut 0.3s ease;
}
@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
@keyframes toastOut {
  from {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
}

.content-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--viewer-preview-padding-y, 20px) var(--viewer-preview-padding-x, 20px);
  min-width: 0;
  height: var(--browser-zoom-content-height, calc(100vh - 44px));
}

.back-to-top-btn {
  position: absolute;
  right: 30px;
  bottom: 30px;
  z-index: 70;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-toolbar);
  background: color-mix(in srgb, var(--bg-toolbar) 88%, transparent);
  color: var(--text-secondary);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18);
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: transform 0.18s ease, color 0.18s ease, background 0.18s ease,
    border-color 0.18s ease, box-shadow 0.18s ease;
  -webkit-app-region: no-drag;
  --wails-draggable: no-drag;
}

.back-to-top-btn:hover {
  transform: translateY(-2px);
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: #fff;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.24);
}

.back-to-top-btn:active {
  transform: translateY(0);
}

.back-to-top-btn svg {
  width: 19px;
  height: 19px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 滚动条 */
.content-area::-webkit-scrollbar,
.editor::-webkit-scrollbar,
.split-editor::-webkit-scrollbar,
.split-preview::-webkit-scrollbar,
.live-editor-view::-webkit-scrollbar {
  width: 15px;
}

.file-tree-panel::-webkit-scrollbar,
.toc-list::-webkit-scrollbar {
  width: 8px;
}
.content-area::-webkit-scrollbar-track,
.file-tree-panel::-webkit-scrollbar-track,
.toc-list::-webkit-scrollbar-track,
.editor::-webkit-scrollbar-track,
.split-editor::-webkit-scrollbar-track,
.split-preview::-webkit-scrollbar-track,
.live-editor-view::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}
.content-area::-webkit-scrollbar-thumb,
.file-tree-panel::-webkit-scrollbar-thumb,
.toc-list::-webkit-scrollbar-thumb,
.editor::-webkit-scrollbar-thumb,
.split-editor::-webkit-scrollbar-thumb,
.split-preview::-webkit-scrollbar-thumb,
.live-editor-view::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 10px;
}
.content-area::-webkit-scrollbar-thumb:hover,
.file-tree-panel::-webkit-scrollbar-thumb:hover,
.toc-list::-webkit-scrollbar-thumb:hover,
.live-editor-view::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* Markdown 样式 */
.markdown-body {
  margin: 0 auto;
  width: min(100%, var(--viewer-content-max-width, 100%));
  max-width: 100%;
  font-size: var(--viewer-body-font-size, var(--base-font-size, 16px));
  line-height: 1.7;
  color: var(--viewer-global-color, var(--text-primary));
  font-family: var(--viewer-global-font-family, inherit);
  font-weight: var(--viewer-global-font-weight, inherit);
  font-style: var(--viewer-global-font-style, inherit);
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  line-height: 1.3;
  scroll-margin-top: 20px;
}
.markdown-body h1 {
  font-size: var(--viewer-h1-font-size, 2em);
  color: var(--viewer-h1-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h1-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h1-font-weight, 600);
  font-style: var(--viewer-h1-font-style, normal);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}
.markdown-body h2 {
  font-size: var(--viewer-h2-font-size, 1.5em);
  color: var(--viewer-h2-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h2-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h2-font-weight, 600);
  font-style: var(--viewer-h2-font-style, normal);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}
.markdown-body h3 {
  font-size: var(--viewer-h3-font-size, 1.25em);
  color: var(--viewer-h3-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h3-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h3-font-weight, 600);
  font-style: var(--viewer-h3-font-style, normal);
}
.markdown-body h4 {
  font-size: var(--viewer-h4-font-size, 1em);
  color: var(--viewer-h4-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h4-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h4-font-weight, 600);
  font-style: var(--viewer-h4-font-style, normal);
}
.markdown-body h5 {
  font-size: var(--viewer-h5-font-size, 0.875em);
  color: var(--viewer-h5-color, var(--viewer-global-color, var(--text-primary)));
  font-family: var(--viewer-h5-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h5-font-weight, 600);
  font-style: var(--viewer-h5-font-style, normal);
}
.markdown-body h6 {
  font-size: var(--viewer-h6-font-size, 0.85em);
  color: var(--viewer-h6-color, var(--viewer-global-color, var(--text-secondary)));
  font-family: var(--viewer-h6-font-family, var(--viewer-global-font-family, inherit));
  font-weight: var(--viewer-h6-font-weight, 600);
  font-style: var(--viewer-h6-font-style, normal);
}
.markdown-body p {
  margin-bottom: 16px;
  color: var(--viewer-p-color, inherit);
  font-family: var(--viewer-p-font-family, inherit);
  font-weight: var(--viewer-p-font-weight, inherit);
  font-style: var(--viewer-p-font-style, inherit);
}
.markdown-body a {
  color: var(--viewer-a-color, var(--accent-color));
  font-family: var(--viewer-a-font-family, inherit);
  font-weight: var(--viewer-a-font-weight, inherit);
  font-style: var(--viewer-a-font-style, inherit);
  text-decoration: none;
}
.markdown-body a:hover {
  text-decoration: underline;
  color: var(--accent-hover);
}
.markdown-body strong {
  color: var(--viewer-strong-color, inherit);
  font-family: var(--viewer-strong-font-family, inherit);
  font-weight: var(--viewer-strong-font-weight, 600);
  font-style: var(--viewer-strong-font-style, inherit);
}
.markdown-body em {
  color: var(--viewer-em-color, inherit);
  font-family: var(--viewer-em-font-family, inherit);
  font-weight: var(--viewer-em-font-weight, inherit);
  font-style: var(--viewer-em-font-style, italic);
}
.markdown-body blockquote {
  padding: 0 1em;
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  border-left: 4px solid var(--blockquote-border);
  background: var(--blockquote-bg);
  border-radius: 10px;
}
.markdown-body code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 10px;
}
.markdown-body pre {
  margin-bottom: 16px;
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.5;
  color: var(--code-text);
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
.markdown-body pre code {
  padding: 0;
  margin: 0;
  font-size: 100%;
  background: transparent;
  border: none;
  border-radius: 10px;
}
.markdown-body table {
  border-collapse: collapse;
  margin-bottom: 16px;
}
.markdown-body .table-border {
  margin-bottom: 16px;
  display: inline-block;
}
.markdown-body .table-border table {
  margin-bottom: 0;
}
.markdown-body table th,
.markdown-body table td {
  padding: 8px 13px;
  border: 1px solid var(--table-border);
  word-break: break-word;
  hyphens: auto;
}
.markdown-body table th {
  font-weight: 600;
  background: var(--bg-secondary);
}
.markdown-body table tr:nth-child(2n) {
  background: var(--table-stripe);
}
.markdown-body img {
  max-width: 100%;
  border-radius: 10px;
  margin: 8px 0;
}
.markdown-body hr {
  height: 1px;
  margin: 24px 0;
  background: var(--border-color);
  border: none;
}
.markdown-body ul,
.markdown-body ol {
  margin-bottom: 16px;
  padding-left: 2em;
}
.markdown-body li {
  margin-bottom: 4px;
}
.markdown-body li + li {
  margin-top: 4px;
}
.markdown-body .task-list {
  padding-left: 0;
  margin-left: 0;
}
.markdown-body .task-list-item {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}
.markdown-body .task-list-checkbox {
  margin-top: 0.3em;
  flex-shrink: 0;
  accent-color: var(--accent-color);
}
.markdown-body .task-status-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.12em 0.55em;
  font-size: 0.78em;
  line-height: 1.4;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
}
.markdown-body .task-list-content {
  flex: 1;
  min-width: 0;
}
.markdown-body .task-list-content > :first-child {
  margin-top: 0;
}
.markdown-body .task-list-content > :last-child {
  margin-bottom: 0;
}
.markdown-body .task-list-item.is-pending .task-list-content {
  color: var(--viewer-task-pending-color, inherit);
  font-family: var(--viewer-task-pending-font-family, inherit);
  font-weight: var(--viewer-task-pending-font-weight, inherit);
  font-style: var(--viewer-task-pending-font-style, inherit);
}
.markdown-body .task-list-item.is-complete .task-list-content {
  color: var(--viewer-task-complete-color, var(--text-secondary));
  font-family: var(--viewer-task-complete-font-family, inherit);
  font-weight: var(--viewer-task-complete-font-weight, inherit);
  font-style: var(--viewer-task-complete-font-style, inherit);
  text-decoration: line-through;
  opacity: 0.82;
}
.markdown-body .task-list-item.is-pending .task-status-badge {
  color: var(--viewer-task-badge-pending-color, #9a3412);
  font-family: var(--viewer-task-badge-pending-font-family, inherit);
  font-weight: var(--viewer-task-badge-pending-font-weight, 700);
  font-style: var(--viewer-task-badge-pending-font-style, normal);
}
.markdown-body .task-list-item.is-complete .task-status-badge {
  color: var(--viewer-task-badge-complete-color, #0f766e);
  font-family: var(--viewer-task-badge-complete-font-family, inherit);
  font-weight: var(--viewer-task-badge-complete-font-weight, 700);
  font-style: var(--viewer-task-badge-complete-font-style, normal);
}
.markdown-body .task-list-item.is-complete .task-list-content a {
  color: var(--viewer-task-complete-color, #0f766e);
}

/* 图表样式 */
.mermaid-wrapper {
  margin: 16px 0;
  text-align: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
}
.mermaid-wrapper svg {
  max-width: 100%;
  height: auto;
}
.mermaid-error {
  color: #f85149;
  text-align: left;
  padding: 8px;
}
.flowchart-wrapper,
.chart-wrapper,
.plantuml-wrapper {
  margin: 16px 0;
  padding: 16px;
  background: var(--code-bg);
  border-radius: 10px;
  overflow-x: auto;
}

/* 代码块 */
.code-block {
  background: var(--code-bg);
  border-radius: 10px;
}
[data-theme="elegant"] .code-block {
  background: #111827;
}
</style>
