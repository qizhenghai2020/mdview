export function normalizeAIProgressPayload(payload) {
  if (Array.isArray(payload)) {
    return payload[0] && typeof payload[0] === "object" ? payload[0] : null;
  }

  return payload && typeof payload === "object" ? payload : null;
}

export function getAIProgressPresentation(kind = "") {
  switch (String(kind || "").trim()) {
    case "theme":
      return {
        logPrefix: "[智能主题进度]",
        fallbackMessage: "智能主题生成中...",
      };
    case "html-format":
      return {
        logPrefix: "[HTML AI排版进度]",
        fallbackMessage: "HTML AI 排版处理中...",
      };
    default:
      return {
        logPrefix: "[AI排版进度]",
        fallbackMessage: "智能排版处理中...",
      };
  }
}
