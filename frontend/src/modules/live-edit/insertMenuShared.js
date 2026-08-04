export const CONTEXT_MENU_MARGIN = 12;
export const DEFAULT_CONTEXT_MENU_WIDTH = 360;
export const DEFAULT_CONTEXT_MENU_HEIGHT = 520;

function buildSnippet(...lines) {
  return `${lines.join("\n")}\n`;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function normalizeTrimmedText(value) {
  return normalizeText(value).trim();
}

function createTaskItem(text = "待办事项", checked = false) {
  return {
    text,
    checked: checked === true,
  };
}

function createTableRow(columnCount, prefix = "内容") {
  return Array.from({ length: columnCount }, (_, index) => `${prefix}${index + 1}`);
}

export const INSERT_ITEM_TYPES = Object.freeze({
  heading: "heading",
  quote: "quote",
  taskList: "task-list",
  table: "table",
  image: "image",
  code: "code",
  mermaid: "mermaid",
});

export const MENU_ITEM_ACTIONS = Object.freeze({
  insert: "insert",
  adjustHeadingLevel: "adjust-heading-level",
  aiGenerate: "ai-generate",
});

export const CODE_LANGUAGE_SUGGESTIONS = Object.freeze([
  "text",
  "javascript",
  "typescript",
  "html",
  "css",
  "json",
  "bash",
  "sql",
  "python",
  "go",
  "yaml",
  "markdown",
]);

export const DEFAULT_MERMAID_SOURCE = Object.freeze({
  generic: "flowchart TD\n    A[开始] --> B[结束]",
  flowchart:
    "flowchart TD\n    A[开始] --> B{条件判断}\n    B -->|是| C[执行操作]\n    B -->|否| D[跳过]\n    C --> E[结束]\n    D --> E",
  sequence:
    "sequenceDiagram\n    participant 用户\n    participant 系统\n    用户->>系统: 发起请求\n    系统-->>用户: 返回结果",
  class:
    "classDiagram\n    class User {\n        +String name\n        +login()\n    }\n    class Session {\n        +String token\n    }\n    User --> Session",
  xychart:
    'xychart-beta\n    title "月度趋势"\n    x-axis [1月, 2月, 3月, 4月]\n    y-axis "数值" 0 --> 100\n    bar [35, 52, 61, 78]\n    line [28, 48, 59, 85]',
  pie:
    'pie showData\n    title 数据占比\n    "A类" : 35\n    "B类" : 25\n    "C类" : 40',
  gantt:
    "gantt\n    title 项目排期\n    dateFormat  YYYY-MM-DD\n    section 研发\n    需求分析          :done, a1, 2026-07-01, 3d\n    功能开发          :active, a2, 2026-07-04, 6d\n    联调验收          :a3, 2026-07-10, 4d",
  er:
    "erDiagram\n    USER ||--o{ ORDER : places\n    USER {\n        string id\n        string name\n    }\n    ORDER {\n        string id\n        string status\n    }",
});

export const HEADING_LEVEL_LABELS = Object.freeze([
  "一级标题",
  "二级标题",
  "三级标题",
  "四级标题",
  "五级标题",
  "六级标题",
]);

export function getHeadingLevelLabel(level = 2) {
  const safeLevel = Math.min(6, Math.max(1, Number(level) || 2));
  return HEADING_LEVEL_LABELS[safeLevel - 1] || `H${safeLevel}`;
}

const BASE_MARKDOWN_INSERT_SECTIONS = [
  {
    title: "常用块",
    items: [
      {
        id: "heading-root",
        label: "标题",
        description: "插入标题，展开后可选 # 到 ######",
        action: MENU_ITEM_ACTIONS.insert,
        type: INSERT_ITEM_TYPES.heading,
        defaultLevel: 2,
      },
      {
        id: "quote",
        label: "引用",
        description: "插入引用说明块",
        type: INSERT_ITEM_TYPES.quote,
      },
      {
        id: "task-list",
        label: "任务清单",
        description: "插入标准 Markdown 任务计划",
        type: INSERT_ITEM_TYPES.taskList,
      },
      {
        id: "table",
        label: "表格",
        description: "插入多行多列表格",
        type: INSERT_ITEM_TYPES.table,
      },
      {
        id: "image",
        label: "图片",
        description: "选择图片后插入 Markdown 图片链接",
        type: INSERT_ITEM_TYPES.image,
      },
    ],
  },
  {
    title: "代码块",
    items: [
      {
        id: "code-text",
        label: "通用代码",
        description: "新增或 AI 生成通用代码块",
        type: INSERT_ITEM_TYPES.code,
        defaultLanguage: "text",
        defaultBody: "在这里输入代码",
      },
      {
        id: "code-javascript",
        label: "JavaScript",
        description: "新增或 AI 生成 JavaScript 代码",
        type: INSERT_ITEM_TYPES.code,
        defaultLanguage: "javascript",
        defaultBody: 'console.log("Hello Markdown");',
      },
      {
        id: "code-html",
        label: "HTML",
        description: "新增或 AI 生成 HTML 代码",
        type: INSERT_ITEM_TYPES.code,
        defaultLanguage: "html",
        defaultBody: "<div>示例内容</div>",
      },
      {
        id: "mermaid-generic",
        label: "Mermaid 代码块",
        description: "新增或 AI 生成 Mermaid 源码",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.generic,
      },
    ],
  },
  {
    title: "Mermaid 图表",
    items: [
      {
        id: "mermaid-flowchart",
        label: "流程图",
        description: "新增或 AI 生成 flowchart",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.flowchart,
      },
      {
        id: "mermaid-sequence",
        label: "时序图",
        description: "新增或 AI 生成 sequenceDiagram",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.sequence,
      },
      {
        id: "mermaid-class",
        label: "类图",
        description: "新增或 AI 生成 classDiagram",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.class,
      },
      {
        id: "mermaid-xychart",
        label: "XY 图表",
        description: "新增或 AI 生成 xychart",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.xychart,
      },
      {
        id: "mermaid-pie",
        label: "饼图",
        description: "新增或 AI 生成 pie",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.pie,
      },
      {
        id: "mermaid-gantt",
        label: "甘特图",
        description: "新增或 AI 生成 gantt",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.gantt,
      },
      {
        id: "mermaid-er",
        label: "ER 图",
        description: "新增或 AI 生成实体关系图",
        type: INSERT_ITEM_TYPES.mermaid,
        defaultBody: DEFAULT_MERMAID_SOURCE.er,
      },
    ],
  },
];

function createHeadingAdjustChildren(headingContext) {
  const currentLevel = normalizeHeadingLevel(
    headingContext?.currentLevel ?? headingContext?.level ?? 0
  );
  if (!currentLevel) {
    return [];
  }

  return Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;
    const hashes = "#".repeat(level);
    const label = getHeadingLevelLabel(level);
    let description = `将当前标题调整为 ${hashes} ${label}`;

    if (level < currentLevel) {
      description = `将当前标题从 H${currentLevel} 升级为 H${level}`;
    } else if (level > currentLevel) {
      description = `将当前标题从 H${currentLevel} 降级为 H${level}`;
    } else {
      description = `当前标题已经是 H${currentLevel}`;
    }

    return {
      id: `heading-adjust-level-${level}`,
      label,
      description,
      action: MENU_ITEM_ACTIONS.adjustHeadingLevel,
      targetLevel: level,
      isActive: level === currentLevel,
    };
  });
}

function createHeadingOutlineChildren(headingContext) {
  const currentLevel = normalizeHeadingLevel(
    headingContext?.currentLevel ?? headingContext?.level ?? 0
  );
  if (!currentLevel) {
    return [];
  }

  const adjustChildren = createHeadingAdjustChildren(headingContext);
  return [
    {
      id: "heading-outline-upgrade",
      label: "升级",
      description: `将当前标题从 H${currentLevel} 升级一级`,
      action: MENU_ITEM_ACTIONS.adjustHeadingLevel,
      levelDelta: -1,
    },
    {
      id: "heading-outline-downgrade",
      label: "降级",
      description: `将当前标题从 H${currentLevel} 降级一级`,
      action: MENU_ITEM_ACTIONS.adjustHeadingLevel,
      levelDelta: 1,
    },
    ...adjustChildren,
  ];
}

function createHeadingInsertChildren() {
  return Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;
    const hashes = "#".repeat(level);
    const label = getHeadingLevelLabel(level);
    return {
      id: `heading-level-${level}`,
      label,
      description: `插入 ${hashes} ${label}`,
      action: MENU_ITEM_ACTIONS.insert,
      type: INSERT_ITEM_TYPES.heading,
      defaultLevel: level,
    };
  });
}

function createInsertOrAiChildren(item) {
  const labelPrefix = item.type === INSERT_ITEM_TYPES.mermaid ? "Mermaid" : item.label;
  let aiDescription = `根据需求生成 ${labelPrefix} 内容`;

  if (item.type === INSERT_ITEM_TYPES.code) {
    aiDescription = `根据需求生成 ${labelPrefix} 代码`;
  } else if (item.type === INSERT_ITEM_TYPES.taskList) {
    aiDescription = "根据需求生成 Markdown 任务清单";
  } else if (item.type === INSERT_ITEM_TYPES.table) {
    aiDescription = "根据需求生成 Markdown 表格";
  }

  return [
    {
      ...item,
      id: `${item.id}-insert`,
      label: "新增",
      description: `打开 ${labelPrefix} 编辑表单`,
      action: MENU_ITEM_ACTIONS.insert,
    },
    {
      ...item,
      id: `${item.id}-ai-generate`,
      label: "AI生成",
      description: aiDescription,
      action: MENU_ITEM_ACTIONS.aiGenerate,
    },
  ];
}

export function buildMarkdownContextMenuSections({ headingContext = null } = {}) {
  return BASE_MARKDOWN_INSERT_SECTIONS.map((section) => ({
    ...section,
    items: section.items.flatMap((item) => {
      if (item.type === INSERT_ITEM_TYPES.heading && item.id === "heading-root") {
        const headingItem = {
          ...item,
          description: headingContext?.currentLevel
            ? `当前标题是 H${headingContext.currentLevel}，可继续插入新标题`
            : item.description,
          children: createHeadingInsertChildren(),
        };

        if (!headingContext?.currentLevel) {
          return [headingItem];
        }

        return [
          headingItem,
          {
            id: "heading-outline",
            label: "标题大纲",
            description: `当前标题是 H${headingContext.currentLevel}，可直接调整到目标层级`,
            type: INSERT_ITEM_TYPES.heading,
            children: createHeadingOutlineChildren(headingContext),
          },
        ];
      }

      if (
        item.type === INSERT_ITEM_TYPES.code ||
        item.type === INSERT_ITEM_TYPES.mermaid ||
        item.type === INSERT_ITEM_TYPES.taskList ||
        item.type === INSERT_ITEM_TYPES.table
      ) {
        return {
          ...item,
          children: createInsertOrAiChildren(item),
        };
      }

      return {
        ...item,
      };
    }),
  }));
}

export const MARKDOWN_INSERT_SECTIONS = buildMarkdownContextMenuSections();

export function resolveFloatingMenuPosition({
  anchorX,
  anchorY,
  menuWidth = DEFAULT_CONTEXT_MENU_WIDTH,
  menuHeight = DEFAULT_CONTEXT_MENU_HEIGHT,
  margin = CONTEXT_MENU_MARGIN,
}) {
  if (typeof window === "undefined") {
    return {
      x: anchorX,
      y: anchorY,
    };
  }

  const safeWidth = Math.max(1, Number(menuWidth) || DEFAULT_CONTEXT_MENU_WIDTH);
  const safeHeight = Math.max(1, Number(menuHeight) || DEFAULT_CONTEXT_MENU_HEIGHT);
  const viewportWidth = Math.max(window.innerWidth || 0, safeWidth + margin * 2);
  const viewportHeight = Math.max(window.innerHeight || 0, safeHeight + margin * 2);
  const leftSpace = anchorX - margin;
  const rightSpace = viewportWidth - anchorX - margin;
  const topSpace = anchorY - margin;
  const bottomSpace = viewportHeight - anchorY - margin;

  let x = anchorX;
  let y = anchorY;

  if (rightSpace < safeWidth && leftSpace > rightSpace) {
    x = anchorX - safeWidth;
  }

  if (bottomSpace < safeHeight && topSpace > bottomSpace) {
    y = anchorY - safeHeight;
  }

  const maxX = Math.max(margin, viewportWidth - safeWidth - margin);
  const maxY = Math.max(margin, viewportHeight - safeHeight - margin);

  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY),
  };
}

export function resolveAdjacentMenuPosition(anchorRect, menuWidth, menuHeight, gap = 8, margin = 12) {
  if (typeof window === "undefined") {
    return {
      x: Number(anchorRect?.right) || 0,
      y: Number(anchorRect?.top) || 0,
    };
  }

  const safeWidth = Math.max(1, Number(menuWidth) || 240);
  const safeHeight = Math.max(1, Number(menuHeight) || 260);
  const viewportWidth = Math.max(window.innerWidth || 0, safeWidth + margin * 2);
  const viewportHeight = Math.max(window.innerHeight || 0, safeHeight + margin * 2);
  const anchorLeft = Number(anchorRect?.left) || 0;
  const anchorRight = Number(anchorRect?.right) || anchorLeft;
  const anchorTop = Number(anchorRect?.top) || 0;
  const anchorBottom = Number(anchorRect?.bottom) || anchorTop;
  const rightSpace = viewportWidth - anchorRight - margin;
  const leftSpace = anchorLeft - margin;

  let x = anchorRight + gap;
  if (rightSpace < safeWidth && leftSpace >= safeWidth + gap) {
    x = anchorLeft - safeWidth - gap;
  }

  let y = anchorTop;
  if (viewportHeight - anchorTop - margin < safeHeight && anchorBottom >= safeHeight) {
    y = anchorBottom - safeHeight;
  }

  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, viewportWidth - safeWidth - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, viewportHeight - safeHeight - margin)),
  };
}

export function shouldOpenInsertDialog(item) {
  if (!item) {
    return false;
  }
  return item.type !== INSERT_ITEM_TYPES.heading;
}

export function normalizeHeadingLevel(value) {
  return Math.min(6, Math.max(1, Number(value) || 1));
}

export function parseHashHeadingLine(line) {
  const match = normalizeText(line).match(/^(#{1,6})([ \t]+)(.*)$/);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    spacing: match[2] || " ",
    content: match[3] || "",
  };
}

export function getHashHeadingContext(content, selectionStart = 0) {
  const source = normalizeText(content);
  const safeIndex = Math.min(Math.max(Number(selectionStart) || 0, 0), source.length);
  const lineStart = source.lastIndexOf("\n", Math.max(0, safeIndex - 1)) + 1;
  const rawLineEnd = source.indexOf("\n", safeIndex);
  const lineEnd = rawLineEnd === -1 ? source.length : rawLineEnd;
  const line = source.slice(lineStart, lineEnd);
  const parsed = parseHashHeadingLine(line);

  if (!parsed) {
    return null;
  }

  return {
    lineStart,
    lineEnd,
    line,
    ...parsed,
  };
}

export function getNthHashHeadingContext(content, headingIndex = 0) {
  const source = normalizeText(content);
  const lines = source.split("\n");
  let offset = 0;
  let currentIndex = 0;

  for (const line of lines) {
    const parsed = parseHashHeadingLine(line);
    const lineStart = offset;
    const lineEnd = offset + line.length;

    if (parsed) {
      if (currentIndex === headingIndex) {
        return {
          lineStart,
          lineEnd,
          line,
          ...parsed,
        };
      }
      currentIndex += 1;
    }

    offset = lineEnd + 1;
  }

  return null;
}

export function replaceHashHeadingLevel(content, headingContext, nextLevel) {
  if (!headingContext) {
    return String(content ?? "");
  }

  const source = normalizeText(content);
  const level = normalizeHeadingLevel(nextLevel);
  const nextLine = `${"#".repeat(level)} ${headingContext.content || ""}`;
  return `${source.slice(0, headingContext.lineStart)}${nextLine}${source.slice(
    headingContext.lineEnd
  )}`;
}

export function createInsertDraft(item, mode = "live") {
  if (!item) {
    return {};
  }

  switch (item.type) {
    case INSERT_ITEM_TYPES.heading:
      return {
        level: Number(item.defaultLevel) || 2,
        title: "",
        body: "",
      };
    case INSERT_ITEM_TYPES.quote:
      return {
        text: "",
      };
    case INSERT_ITEM_TYPES.taskList:
      return {
        items:
          mode === "live"
            ? [createTaskItem("待办事项", false)]
            : [createTaskItem("待办事项 1", false), createTaskItem("已完成事项", true)],
      };
    case INSERT_ITEM_TYPES.table:
      return {
        headers: ["列1", "列2", "列3"],
        rows: [createTableRow(3)],
      };
    case INSERT_ITEM_TYPES.image:
      return {
        alt: "图片描述",
        source: "",
        fileName: "",
      };
    case INSERT_ITEM_TYPES.code:
      return {
        language: String(item.defaultLanguage || "text"),
        code: String(item.defaultBody || ""),
      };
    case INSERT_ITEM_TYPES.mermaid:
      return {
        code: normalizeMermaidSource(item.defaultBody || DEFAULT_MERMAID_SOURCE.generic),
      };
    default:
      return {};
  }
}

export function createGeneratedInsertDraft(item, generatedContent = "") {
  if (!item) {
    return {};
  }

  if (item.type === INSERT_ITEM_TYPES.code) {
    return {
      language: String(item.defaultLanguage || "text"),
      code: normalizeText(generatedContent).trim(),
    };
  }

  if (item.type === INSERT_ITEM_TYPES.mermaid) {
    return {
      code: normalizeMermaidSource(generatedContent),
    };
  }

  return createInsertDraft(item);
}

export function normalizeMermaidSource(value) {
  const source = normalizeText(value).trim();
  if (!source) {
    return DEFAULT_MERMAID_SOURCE.generic;
  }

  const fencedMatch = source.match(/^```(?:\s*mermaid)?[^\n]*\n([\s\S]*?)\n```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return source.replace(/^```(?:\s*mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function stripOuterMarkdownFenceText(value) {
  const source = normalizeText(value).trim();
  if (!source) {
    return "";
  }

  const fencedMatch = source.match(/^```(?:\s*markdown)?[^\n]*\n([\s\S]*?)\n```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return source.replace(/^```(?:\s*markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function createAiGenerationRequest(item, mode = "live") {
  if (!item) {
    return {
      kind: "code",
      language: "",
      template: "",
    };
  }

  if (item.type === INSERT_ITEM_TYPES.mermaid) {
    return {
      kind: "mermaid",
      language: "",
      template: item.defaultBody || "",
      startMessage: "正在准备 Mermaid AI 生成请求",
      operationLabel: "Mermaid AI生成",
      logPrefix: "[Mermaid AI生成]",
    };
  }

  if (item.type === INSERT_ITEM_TYPES.taskList) {
    return {
      kind: "code",
      language: "markdown",
      template: buildInsertSnippet(item, createInsertDraft(item, mode), mode).trim(),
      targetLabel: "任务清单",
      description: "描述你想生成的任务阶段、待办项、已完成项或优先级。AI 只生成可直接插入 Markdown 的任务清单，不额外附带解释。",
      inputLabel: "任务清单需求",
      placeholder: "例如：生成一个网站上线任务清单，包含需求确认、页面开发、联调测试、上线验收，并标出已完成和待处理事项。",
      metaHint: "建议写清阶段、事项、是否完成、负责人或优先级；生成结果会直接插入当前光标位置。",
      startMessage: "正在准备 AI 任务清单生成请求",
      operationLabel: "AI任务清单生成",
      logPrefix: "[任务清单 AI生成]",
    };
  }

  if (item.type === INSERT_ITEM_TYPES.table) {
    return {
      kind: "code",
      language: "markdown",
      template: buildInsertSnippet(item, createInsertDraft(item, mode), mode).trim(),
      targetLabel: "表格",
      description: "描述你想生成的表格列、行、字段或示例数据。AI 只生成可直接插入 Markdown 的表格，不额外附带解释。",
      inputLabel: "表格需求",
      placeholder: "例如：生成一个项目排期表，包含任务名称、负责人、开始时间、结束时间、状态这 5 列，并给出 4 行示例数据。",
      metaHint: "建议写清列名、行数、字段类型、示例值或结构要求；生成结果会直接插入当前光标位置。",
      startMessage: "正在准备 AI 表格生成请求",
      operationLabel: "AI表格生成",
      logPrefix: "[表格 AI生成]",
    };
  }

  return {
    kind: "code",
    language: item.defaultLanguage || "",
    template: item.defaultBody || "",
    startMessage: "正在准备 AI 代码生成请求",
    operationLabel: "AI代码生成",
    logPrefix: "[代码 AI生成]",
  };
}

export function createGeneratedInsertSnippet(item, generatedContent, mode = "live") {
  if (!item) {
    return "";
  }

  if (item.type === INSERT_ITEM_TYPES.taskList || item.type === INSERT_ITEM_TYPES.table) {
    const normalizedContent = stripOuterMarkdownFenceText(generatedContent);
    if (!normalizedContent) {
      return createDirectInsertSnippet(item, mode);
    }
    return buildSnippet("", ...normalizedContent.split("\n"), "");
  }

  return buildInsertSnippet(item, createGeneratedInsertDraft(item, generatedContent), mode);
}

export function buildInsertSnippet(item, draft, mode = "live") {
  if (!item) {
    return "";
  }

  switch (item.type) {
    case INSERT_ITEM_TYPES.heading:
      return buildHeadingSnippet(draft);
    case INSERT_ITEM_TYPES.quote:
      return buildQuoteSnippet(draft);
    case INSERT_ITEM_TYPES.taskList:
      return buildTaskListSnippet(draft, mode);
    case INSERT_ITEM_TYPES.table:
      return buildTableSnippet(draft);
    case INSERT_ITEM_TYPES.image:
      return buildImageSnippet(draft);
    case INSERT_ITEM_TYPES.code:
      return buildCodeSnippet(draft);
    case INSERT_ITEM_TYPES.mermaid:
      return buildMermaidSnippet(draft);
    default:
      return "";
  }
}

export function createDirectInsertSnippet(item, mode = "live") {
  return buildInsertSnippet(item, createInsertDraft(item, mode), mode);
}

function buildHeadingSnippet(draft = {}) {
  const level = Math.min(6, Math.max(1, Number(draft.level) || 2));
  const title = normalizeTrimmedText(draft.title) || getHeadingLevelLabel(level);
  const body = normalizeText(draft.body);
  const lines = ["", `${"#".repeat(level)} ${title}`];

  if (body.trim()) {
    lines.push("");
    lines.push(...body.split("\n"));
  }

  lines.push("");
  return buildSnippet(...lines);
}

function buildQuoteSnippet(draft = {}) {
  const text = normalizeText(draft.text);
  const lines = (text.trim() ? text : "这是一段引用内容").split("\n");
  return buildSnippet(
    "",
    ...lines.map((line) => (line ? `> ${line}` : ">")),
    ""
  );
}

function buildTaskListSnippet(draft = {}, mode = "live") {
  const items = Array.isArray(draft.items) ? draft.items : [];
  const normalizedItems =
    items
      .map((item) => ({
        checked: item?.checked === true,
        text: normalizeTrimmedText(item?.text),
      }))
      .filter((item) => item.text || item.checked) || [];

  const fallbackItems =
    normalizedItems.length > 0
      ? normalizedItems
      : mode === "live"
        ? [{ checked: false, text: "待办事项" }]
        : [{ checked: false, text: "待办事项 1" }];

  return buildSnippet(
    "",
    ...fallbackItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text || "待办事项"}`),
    ""
  );
}

function buildTableSnippet(draft = {}) {
  const headers = Array.isArray(draft.headers) ? draft.headers : [];
  const safeHeaders =
    headers.length > 0
      ? headers.map((value, index) => normalizeTrimmedText(value) || `列${index + 1}`)
      : ["列1", "列2", "列3"];
  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  const safeRows =
    rows.length > 0
      ? rows.map((row) =>
          safeHeaders.map((_, index) => normalizeText(Array.isArray(row) ? row[index] : "").trim())
        )
      : [createTableRow(safeHeaders.length)];

  return buildSnippet(
    "",
    `| ${safeHeaders.join(" | ")} |`,
    `| ${safeHeaders.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.join(" | ")} |`),
    ""
  );
}

function buildImageSnippet(draft = {}) {
  const alt = normalizeTrimmedText(draft.alt) || "图片描述";
  const source = normalizeTrimmedText(draft.source);
  return buildSnippet("", `![${alt}](${source})`, "");
}

function buildCodeSnippet(draft = {}) {
  const language = normalizeTrimmedText(draft.language) || "text";
  const code = normalizeText(draft.code);
  const safeCode = code.trim() ? code : "在这里输入代码";
  return buildSnippet("", `\`\`\`${language}`, ...safeCode.split("\n"), "```", "");
}

function buildMermaidSnippet(draft = {}) {
  const mermaidSource = normalizeMermaidSource(draft.code);
  return buildSnippet("", "```mermaid", ...mermaidSource.split("\n"), "```", "");
}
