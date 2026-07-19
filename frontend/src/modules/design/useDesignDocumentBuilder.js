function getThemeCssVar(rootStyles, name, fallback) {
  return rootStyles.getPropertyValue(name).trim() || fallback;
}

function removePreviewOnlyArtifacts(html) {
  if (typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) {
    return html;
  }

  root.querySelectorAll(".table-resize-handle").forEach((element) => element.remove());
  return root.innerHTML;
}

export function useDesignDocumentBuilder({
  isDark,
  registeredFontOptions,
  editedContent,
  markdownContent,
  isHtmlDocument,
  fileName,
  currentTheme,
  styleConfig,
  isSmartThemeId,
  buildHtmlFragmentDocument,
  getHtmlPreviewBaseHref,
  looksLikeHtmlDocument,
  createExportSurface,
  createCurrentPreviewExportSurface,
  getExportCssVars,
  collectExportStyleText,
  escapeAttribute,
  escapeHtml,
}) {
  function getDesignUiThemeSnapshot() {
    if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
      return {
        bgPrimary: "#ffffff",
        bgSecondary: "#f6f8fa",
        bgToolbar: "#ffffff",
        bgToc: "#f6f8fa",
        bgTocHover: "#eaeef2",
        bgTocActive: "#dbe4eb",
        textPrimary: "#1f2328",
        textSecondary: "#656d76",
        textTertiary: "#8b949e",
        borderColor: "#d0d7de",
        borderToolbar: "#d0d7de",
        accentColor: "#0969da",
        accentHover: "#0550ae",
        scrollbarThumb: "#c1c8cd",
        scrollbarTrack: "transparent",
        btnHover: "rgba(0, 0, 0, 0.06)",
        btnActive: "rgba(0, 0, 0, 0.1)",
        shadowSm: "0 1px 2px rgba(0, 0, 0, 0.05)",
        shadowMd: "0 4px 12px rgba(0, 0, 0, 0.1)",
        isDark: false,
      };
    }

    const rootStyles = getComputedStyle(document.documentElement);
    return {
      bgPrimary: getThemeCssVar(rootStyles, "--bg-primary", "#ffffff"),
      bgSecondary: getThemeCssVar(rootStyles, "--bg-secondary", "#f6f8fa"),
      bgToolbar: getThemeCssVar(rootStyles, "--bg-toolbar", "#ffffff"),
      bgToc: getThemeCssVar(rootStyles, "--bg-toc", "#f6f8fa"),
      bgTocHover: getThemeCssVar(rootStyles, "--bg-toc-hover", "#eaeef2"),
      bgTocActive: getThemeCssVar(rootStyles, "--bg-toc-active", "#dbe4eb"),
      textPrimary: getThemeCssVar(rootStyles, "--text-primary", "#1f2328"),
      textSecondary: getThemeCssVar(rootStyles, "--text-secondary", "#656d76"),
      textTertiary: getThemeCssVar(rootStyles, "--text-tertiary", "#8b949e"),
      borderColor: getThemeCssVar(rootStyles, "--border-color", "#d0d7de"),
      borderToolbar: getThemeCssVar(rootStyles, "--border-toolbar", "#d0d7de"),
      accentColor: getThemeCssVar(rootStyles, "--accent-color", "#0969da"),
      accentHover: getThemeCssVar(rootStyles, "--accent-hover", "#0550ae"),
      scrollbarThumb: getThemeCssVar(rootStyles, "--scrollbar-thumb", "#c1c8cd"),
      scrollbarTrack: getThemeCssVar(rootStyles, "--scrollbar-track", "transparent"),
      btnHover: getThemeCssVar(rootStyles, "--btn-hover", "rgba(0, 0, 0, 0.06)"),
      btnActive: getThemeCssVar(rootStyles, "--btn-active", "rgba(0, 0, 0, 0.1)"),
      shadowSm: getThemeCssVar(rootStyles, "--shadow-sm", "0 1px 2px rgba(0, 0, 0, 0.05)"),
      shadowMd: getThemeCssVar(rootStyles, "--shadow-md", "0 4px 12px rgba(0, 0, 0, 0.1)"),
      isDark: isDark.value,
    };
  }

  function getDesignFontOptionsSnapshot() {
    return registeredFontOptions.value.map((option) => ({
      value: String(option?.value || ""),
      label: String(option?.label || option?.value || ""),
      stack: String(option?.stack || "inherit"),
    }));
  }

  async function buildDesignDocumentHtml(sourceContentOverride = null) {
    const sourceContent =
      sourceContentOverride !== null ? sourceContentOverride : editedContent.value || markdownContent.value;
    if (isHtmlDocument.value) {
      return looksLikeHtmlDocument(sourceContent)
        ? sourceContent
        : buildHtmlFragmentDocument(sourceContent, {
            baseHref: getHtmlPreviewBaseHref(),
            withPreviewPadding: true,
          });
    }

    let exportSurface = null;
    try {
      exportSurface =
        sourceContentOverride !== null
          ? await createExportSurface(sourceContentOverride)
          : (await createCurrentPreviewExportSurface()) || (await createExportSurface());
      const cssVars = getExportCssVars();
      const styleText = await collectExportStyleText();
      const contentHtml = removePreviewOnlyArtifacts(exportSurface.surface.innerHTML);
      const title =
        fileName.value && fileName.value !== "未打开文件" ? fileName.value : "Markdown 设计稿";
      const smartThemeAttr = isSmartThemeId(currentTheme.value) ? ' data-ai-theme="true"' : "";

      return `<!doctype html>
<html lang="zh-CN" data-theme="${escapeAttribute(
        currentTheme.value
      )}"${smartThemeAttr} style="${escapeAttribute(cssVars)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
${styleText}
    body {
      padding: 48px;
    }
    .table-resize-handle {
      display: none !important;
    }
  </style>
</head>
<body${
        styleConfig.value.themeRoundedCorners === false ? ' class="theme-radius-flat"' : ""
      }>
  ${contentHtml}
</body>
</html>`;
    } finally {
      exportSurface?.host?.remove();
    }
  }

  return {
    getDesignUiThemeSnapshot,
    getDesignFontOptionsSnapshot,
    buildDesignDocumentHtml,
  };
}
