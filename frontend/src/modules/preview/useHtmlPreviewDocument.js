export function useHtmlPreviewDocument({
  filePath,
  documentTypeProbeMaxChars,
  escapeAttribute,
}) {
  function looksLikeHtmlDocument(content) {
    return /<!doctype\s+html|<html[\s>]/i.test(
      String(content || "").slice(0, documentTypeProbeMaxChars)
    )
  }

  function getHtmlPreviewBaseHref(path = filePath.value) {
    const fullPath = String(path || "").trim()
    if (!fullPath) {
      return ""
    }

    const normalizedPath = fullPath.replace(/\\/g, "/")
    const lastSlashIndex = normalizedPath.lastIndexOf("/")
    if (lastSlashIndex < 0) {
      return ""
    }

    const directoryPath = normalizedPath.slice(0, lastSlashIndex + 1)
    const prefixedPath = /^[a-zA-Z]:\//.test(directoryPath)
      ? `/${directoryPath}`
      : directoryPath
    return encodeURI(`file://${prefixedPath}`)
  }

  function injectBaseHrefIntoHtmlDocument(html, baseHref) {
    const source = String(html || "")
    if (!baseHref || /<base[\s>]/i.test(source)) {
      return source
    }

    const baseTag = `<base href="${escapeAttribute(baseHref)}" />`
    if (/<head[\s>]/i.test(source)) {
      return source.replace(/<head(\s*[^>]*)>/i, `<head$1>\n  ${baseTag}`)
    }
    if (/<html[\s>]/i.test(source)) {
      return source.replace(/<html(\s*[^>]*)>/i, `<html$1><head>${baseTag}</head>`)
    }
    return source
  }

  function getHtmlPreviewThemeSnapshot() {
    if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
      return {
        background: "#ffffff",
        color: "#111827",
        accent: "#2563eb",
      }
    }

    const rootStyles = getComputedStyle(document.documentElement)
    return {
      background: rootStyles.getPropertyValue("--bg-primary").trim() || "#ffffff",
      color: rootStyles.getPropertyValue("--text-primary").trim() || "#111827",
      accent: rootStyles.getPropertyValue("--accent-color").trim() || "#2563eb",
    }
  }

  function buildHtmlFragmentDocument(
    content,
    { baseHref = "", withPreviewPadding = false } = {}
  ) {
    const { background, color, accent } = getHtmlPreviewThemeSnapshot()
    const baseTag = baseHref ? `\n  <base href="${escapeAttribute(baseHref)}" />` : ""
    const bodyPadding = withPreviewPadding ? "20px 24px" : "0"

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />${baseTag}
  <style>
    html, body {
      min-height: 100%;
    }
    body {
      margin: 0;
      padding: ${bodyPadding};
      box-sizing: border-box;
      background: ${background};
      color: ${color};
      font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    a {
      color: ${accent};
    }
    img, video, canvas, svg {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
${String(content || "")}
</body>
</html>`
  }

  function buildHtmlPreviewDocument(content) {
    const source = String(content || "")
    const baseHref = getHtmlPreviewBaseHref()
    if (looksLikeHtmlDocument(source)) {
      return injectBaseHrefIntoHtmlDocument(source, baseHref)
    }
    return buildHtmlFragmentDocument(source, {
      baseHref,
      withPreviewPadding: true,
    })
  }

  return {
    looksLikeHtmlDocument,
    getHtmlPreviewBaseHref,
    buildHtmlFragmentDocument,
    buildHtmlPreviewDocument,
  }
}
