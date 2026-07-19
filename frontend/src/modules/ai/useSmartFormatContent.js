export function stripOuterMarkdownFence(text) {
  const trimmed = String(text || "").trim()
  const matched = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  return matched ? matched[1].trim() : trimmed
}

export function normalizeForContentCheck(text) {
  return String(text || "")
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1$2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1$2")
    .replace(/[`*_~#>\-|:[\](){}.,;!?，。；：！？“”‘’、\\/+=\s]/g, "")
    .toLowerCase()
}

export function getSmartFormatValidationError(original, formatted) {
  const result = String(formatted || "").trim()
  if (!result) {
    return "模型没有返回任何内容"
  }

  if (/<!doctype|<html[\s>]|<\/body>/i.test(result)) {
    return "模型返回了 HTML，而不是 Markdown"
  }

  if (/^(here is|sure[,，]|下面是|以下是).{0,80}(markdown|排版|整理)/i.test(result)) {
    return "模型返回了说明文字，而不是可直接使用的 Markdown"
  }

  const originalToken = normalizeForContentCheck(original)
  const formattedToken = normalizeForContentCheck(result)

  if (!originalToken && !formattedToken) {
    return ""
  }

  if (!originalToken || !formattedToken) {
    return "模型返回内容缺少可校验的正文"
  }

  const lengthRatio =
    Math.min(originalToken.length, formattedToken.length) /
    Math.max(originalToken.length, formattedToken.length)

  if (lengthRatio < 0.96) {
    return "模型返回内容和原文差异过大"
  }

  if (originalToken !== formattedToken) {
    return "模型修改了原文可见文本内容"
  }

  return ""
}

export function useSmartFormatContent({
  clearPendingEditedContentSync,
  editedContent,
  markdownContent,
  setLastEditedContent,
  editHistory,
  addToHistory,
}) {
  function applySmartFormattedContent(formattedContent) {
    const nextContent = stripOuterMarkdownFence(formattedContent)
    clearPendingEditedContentSync()
    editedContent.value = nextContent
    markdownContent.value = nextContent
    setLastEditedContent(nextContent)

    if (
      editHistory.value.length === 0 ||
      editHistory.value[editHistory.value.length - 1] !== nextContent
    ) {
      addToHistory(nextContent)
    }
  }

  return {
    stripOuterMarkdownFence,
    applySmartFormattedContent,
  }
}
