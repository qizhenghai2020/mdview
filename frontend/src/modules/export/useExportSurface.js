import { nextTick } from "vue"

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ")
}

function sanitizeFileNameSegment(value) {
  const fallback = "markdown-export"
  return (
    String(value || fallback)
      .replace(/\.[^.\\/]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || fallback
  )
}

function applyExportHostPresentation(host, width) {
  host.style.position = "fixed"
  host.style.left = "-100000px"
  host.style.top = "0"
  host.style.width = `${width}px`
  host.style.padding = "48px"
  host.style.background = "var(--bg-primary)"
  host.style.color = "var(--text-primary)"
  host.style.pointerEvents = "none"
  host.style.zIndex = "-1"
}

export function useExportSurface({
  fileName,
  previewRef,
  styleConfigVars,
  zoomLevel,
  currentTheme,
  isSmartThemeId,
  isMarkdownDocument,
  renderedHtml,
  markdownContent,
  marked,
  renderer,
  renderMarkdown,
  createCodeBlockRenderer,
  setCurrentCodeBlockRenderer,
  postProcessMarkdownHtml,
  renderedHeadingCollector,
  mermaidIdCounter,
  markdownTableController,
  loadMermaid,
  resolveMermaidThemeFromDocument,
  resourceShell,
}) {
  function getExportBaseName() {
    return sanitizeFileNameSegment(
      fileName.value && fileName.value !== "未打开文件" ? fileName.value : "markdown-export"
    )
  }

  function getExportWidth() {
    const previewWidth =
      previewRef.value?.clientWidth ||
      document.querySelector(".content-area")?.clientWidth ||
      document.querySelector(".split-preview")?.clientWidth ||
      900
    return Math.round(Math.min(1120, Math.max(760, previewWidth || 900)))
  }

  function getExportCssVars() {
    const mergedVars = {
      ...styleConfigVars.value,
      "--base-font-size": `${16 * (zoomLevel.value / 100)}px`,
    }

    return Object.entries(mergedVars)
      .filter(([key, value]) => key.startsWith("--") && value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${value};`)
      .join(" ")
  }

  function isInlineResourceUrl(value) {
    return /^(data:|blob:|about:|#)/i.test(String(value || "").trim())
  }

  function isRemoteResourceUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim())
  }

  function fileUrlToLocalPath(value) {
    if (!/^file:\/\//i.test(String(value || "").trim())) {
      return ""
    }

    try {
      const url = new URL(value)
      const decodedPath = decodeURIComponent(url.pathname || "")
      if (/^\/[a-z]:/i.test(decodedPath)) {
        return decodedPath.slice(1).replaceAll("/", "\\")
      }
      return decodedPath.replaceAll("/", "\\")
    } catch (_) {
      return ""
    }
  }

  async function readResourceViaFetch(resource) {
    if (typeof fetch !== "function" || typeof FileReader === "undefined") {
      return ""
    }

    try {
      const response = await fetch(resource)
      if (!response.ok) {
        return ""
      }

      const blob = await response.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => resolve("")
        reader.readAsDataURL(blob)
      })
    } catch (_) {
      return ""
    }
  }

  async function inlineResourceAsDataUrl(resource, { preferFileResolution = false } = {}) {
    const src = String(resource || "").trim()
    if (!src || isInlineResourceUrl(src)) {
      return src
    }

    const filePath = fileUrlToLocalPath(src)
    if (filePath) {
      return (await resourceShell?.readImageAsBase64(filePath)) || src
    }

    if (isRemoteResourceUrl(src)) {
      return (await resourceShell?.readImageAsBase64(src)) || (await readResourceViaFetch(src)) || src
    }

    if (!preferFileResolution) {
      const fetched = await readResourceViaFetch(src)
      if (fetched) {
        return fetched
      }
    }

    try {
      const resolvedPath = await resourceShell?.resolveImagePath(src)
      const base64 = await resourceShell?.readImageAsBase64(resolvedPath)
      if (base64) {
        return base64
      }
    } catch (_) {
      // Fall through to fetch-based resolution below.
    }

    return (await readResourceViaFetch(src)) || src
  }

  async function inlineCssResourceUrls(cssText, options = {}) {
    const text = String(cssText || "")
    const resourceMatches = Array.from(
      text.matchAll(/url\(\s*(["']?)(?!data:|blob:|about:|#)([^"')]+)\1\s*\)/gi)
    )

    if (!resourceMatches.length) {
      return text
    }

    let output = text
    const resources = [...new Set(resourceMatches.map((match) => match[2].trim()))]
    for (const resource of resources) {
      const inlined = await inlineResourceAsDataUrl(resource, options)
      if (inlined && inlined !== resource) {
        output = output.replaceAll(resource, inlined)
      }
    }

    return output
  }

  async function inlineCssUrlsInElement(container) {
    const styledElements = Array.from(container.querySelectorAll("[style]"))
    for (const element of styledElements) {
      const styleText = element.getAttribute("style")
      const inlinedStyle = await inlineCssResourceUrls(styleText, {
        preferFileResolution: true,
      })
      if (inlinedStyle !== styleText) {
        element.setAttribute("style", inlinedStyle)
      }
    }
  }

  async function collectExportStyleText() {
    const styleTexts = []
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || [])
        styleTexts.push(rules.map((rule) => rule.cssText).join("\n"))
      } catch (_) {
        // Cross-origin stylesheets cannot be read; exported document still includes fallback CSS below.
      }
    }

    styleTexts.push(`
    html, body {
      min-height: 100%;
      margin: 0;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", Helvetica, Arial, sans-serif;
    }
    body {
      overflow: auto;
    }
    .export-document {
      min-height: 100vh;
      padding: 48px;
      background: var(--bg-primary);
      color: var(--text-primary);
    }
    .export-render-surface {
      width: 100%;
      background: var(--bg-primary);
      color: var(--text-primary);
    }
    .export-render-surface .markdown-body,
    .export-render-surface .plain-text-preview {
      width: min(100%, var(--viewer-content-max-width, 100%));
      max-width: 100%;
      margin: 0 auto;
    }
    .export-render-surface .plain-text-preview {
      white-space: pre-wrap;
      word-break: break-word;
    }
  `)

    return inlineCssResourceUrls(styleTexts.filter(Boolean).join("\n"))
  }

  async function inlineImagesInElement(container) {
    const images = Array.from(container.querySelectorAll("img, image"))
    for (const img of images) {
      const src =
        img.getAttribute("src") ||
        img.getAttribute("href") ||
        img.getAttribute("xlink:href")
      if (!src || isInlineResourceUrl(src)) {
        continue
      }

      try {
        const base64 = await inlineResourceAsDataUrl(src, { preferFileResolution: true })
        if (base64) {
          if (img.hasAttribute("src")) {
            img.setAttribute("src", base64)
          }
          if (img.hasAttribute("href")) {
            img.setAttribute("href", base64)
          }
          if (img.hasAttribute("xlink:href")) {
            img.setAttribute("xlink:href", base64)
          }
        }
      } catch (error) {
        console.warn("导出时图片内联失败:", src, error)
      }
    }
  }

  async function waitForImages(container) {
    const images = Array.from(container.querySelectorAll("img"))
    await Promise.all(
      images.map((img) => {
        if (img.complete) {
          return Promise.resolve()
        }
        return new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })
      })
    )
  }

  async function renderMermaidChartsInElement(container) {
    const elements = Array.from(container.querySelectorAll(".mermaid-wrapper pre.mermaid"))
    if (!elements.length) {
      return
    }

    const mermaid = await loadMermaid(resolveMermaidThemeFromDocument())
    for (const el of elements) {
      try {
        const graphDefinition = el.textContent
        const id = `export-mermaid-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const { svg } = await mermaid.render(id, graphDefinition)
        el.parentElement.innerHTML = svg
      } catch (error) {
        console.warn("导出时 Mermaid 渲染失败:", error)
        el.parentElement.innerHTML = `<pre class="mermaid-error">图表渲染失败: ${
          error?.message || error
        }</pre>`
      }
    }
  }

  function renderMarkdownHtmlForExport(content) {
    const previousHeadingState = renderedHeadingCollector.rememberState()
    const previousMermaidIdCounter = mermaidIdCounter.value
    const previousTableRenderCounter = markdownTableController.getRenderCounter()

    try {
      renderedHeadingCollector.reset()
      mermaidIdCounter.value = 0
      markdownTableController.resetRenderCounter()
      setCurrentCodeBlockRenderer(
        createCodeBlockRenderer({
          documentLength: String(content || "").length,
        })
      )
      return postProcessMarkdownHtml(marked(content || "", { renderer }))
    } finally {
      renderedHeadingCollector.restoreState(previousHeadingState)
      mermaidIdCounter.value = previousMermaidIdCounter
      markdownTableController.restoreRenderCounter(previousTableRenderCounter)
    }
  }

  function createExportHost() {
    const host = document.createElement("div")
    host.className = "export-render-host"
    host.setAttribute("data-theme", currentTheme.value)
    if (isSmartThemeId(currentTheme.value)) {
      host.setAttribute("data-ai-theme", "true")
    }
    host.setAttribute("style", getExportCssVars())
    applyExportHostPresentation(host, getExportWidth())
    return host
  }

  async function createExportSurface(contentOverride = null) {
    if (contentOverride === null) {
      await renderMarkdown()
    }
    await nextTick()

    const host = createExportHost()
    const surface = document.createElement("div")
    surface.className = "export-render-surface"

    if (isMarkdownDocument.value) {
      const html =
        contentOverride === null
          ? renderedHtml.value
          : renderMarkdownHtmlForExport(contentOverride)
      surface.innerHTML = `<div class="markdown-body">${html}</div>`
    } else {
      surface.innerHTML = `<pre class="plain-text-preview standalone"><code>${escapeHtml(
        contentOverride === null ? markdownContent.value : contentOverride
      )}</code></pre>`
    }

    host.appendChild(surface)
    document.body.appendChild(host)

    await inlineImagesInElement(surface)
    await inlineCssUrlsInElement(surface)
    await renderMermaidChartsInElement(surface)
    await inlineImagesInElement(surface)
    await inlineCssUrlsInElement(surface)
    await waitForImages(surface)
    await nextTick()

    return { host, surface }
  }

  async function createCurrentPreviewExportSurface() {
    await nextTick()

    const previewRoot = previewRef.value
    if (!previewRoot) {
      return null
    }

    const sourceNode = isMarkdownDocument.value
      ? previewRoot.querySelector(".markdown-body")
      : previewRoot.querySelector(".plain-text-preview")
    if (!sourceNode) {
      return null
    }

    const host = createExportHost()
    const surface = document.createElement("div")
    surface.className = "export-render-surface"
    surface.appendChild(sourceNode.cloneNode(true))
    host.appendChild(surface)
    document.body.appendChild(host)

    await inlineImagesInElement(surface)
    await inlineCssUrlsInElement(surface)
    await waitForImages(surface)
    await nextTick()

    return { host, surface }
  }

  return {
    getExportBaseName,
    getExportCssVars,
    collectExportStyleText,
    createExportSurface,
    createCurrentPreviewExportSurface,
  }
}
