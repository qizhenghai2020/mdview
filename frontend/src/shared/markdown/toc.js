export function buildTocItem(id, text, level) {
  return {
    id,
    text,
    level,
    indentStyle: { "--toc-indent": `${(level - 1) * 16 + 8}px` },
  };
}

export function createHeadingSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createHeadingId(text, counter) {
  const slug = createHeadingSlug(text);
  let id = slug;
  if (counter[slug]) {
    counter[slug] += 1;
    id = `${slug}-${counter[slug]}`;
  } else {
    counter[slug] = 1;
  }
  return id;
}

export function stripInlineMarkdownForToc(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function extractTocItemsFast(content) {
  const counter = {};
  const items = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedStart = line.trimStart();
    const fenceMatch = trimmedStart.match(/^([`~]{3,})/);

    if (fenceMatch) {
      const currentFence = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = currentFence[0];
        fenceLength = currentFence.length;
        continue;
      }
      if (currentFence[0] === fenceChar && currentFence.length >= fenceLength) {
        inFence = false;
        fenceChar = "";
        fenceLength = 0;
        continue;
      }
    }

    if (inFence) {
      continue;
    }

    const atxMatch = line.match(/^\s{0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
    if (atxMatch) {
      const text = stripInlineMarkdownForToc(atxMatch[2]);
      if (text) {
        items.push(buildTocItem(createHeadingId(text, counter), text, atxMatch[1].length));
      }
      continue;
    }

    const nextLine = lines[index + 1];
    if (!nextLine || !line.trim()) {
      continue;
    }

    const setextMatch = nextLine.match(/^\s{0,3}(=+|-+)\s*$/);
    if (!setextMatch) {
      continue;
    }

    const text = stripInlineMarkdownForToc(line);
    if (!text) {
      continue;
    }

    items.push(buildTocItem(createHeadingId(text, counter), text, setextMatch[1][0] === "=" ? 1 : 2));
    index += 1;
  }

  return items;
}

export function createRenderedHeadingCollector() {
  let headings = [];
  let headingCounter = {};

  function reset() {
    headings = [];
    headingCounter = {};
  }

  function rememberState() {
    return {
      headings,
      headingCounter,
    };
  }

  function restoreState(state) {
    headings = Array.isArray(state?.headings) ? state.headings : [];
    headingCounter =
      state?.headingCounter && typeof state.headingCounter === "object" ? state.headingCounter : {};
  }

  function captureHeading(text, depth) {
    const id = createHeadingId(text, headingCounter);
    const item = buildTocItem(id, text, depth);
    headings.push(item);
    return item;
  }

  function getItems() {
    return headings.slice();
  }

  return {
    reset,
    rememberState,
    restoreState,
    captureHeading,
    getItems,
  };
}

export function createTocExtractor({ marked, fastThreshold = 60000 }) {
  let lastExtractedTocSource = "";
  let lastExtractedTocItems = [];

  function extract(source) {
    const content = String(source || "");
    if (content === lastExtractedTocSource) {
      return lastExtractedTocItems;
    }
    if (!content.trim()) {
      lastExtractedTocSource = content;
      lastExtractedTocItems = [];
      return [];
    }

    const mayContainAtxHeading = /^\s{0,3}#{1,6}\s+\S/m.test(content);
    const mayContainSetextHeading = /^[^\n]+\n(?:=+|-+)\s*$/m.test(content);
    if (!mayContainAtxHeading && !mayContainSetextHeading) {
      lastExtractedTocSource = content;
      lastExtractedTocItems = [];
      return [];
    }

    const items =
      content.length >= fastThreshold
        ? extractTocItemsFast(content)
        : (() => {
            const counter = {};
            return marked
              .lexer(content, { gfm: true, breaks: true })
              .filter((token) => token?.type === "heading" && token.depth >= 1 && token.depth <= 6)
              .map((token) => {
                const text = String(token.text || "").trim();
                return buildTocItem(createHeadingId(text, counter), text, token.depth);
              });
          })();

    lastExtractedTocSource = content;
    lastExtractedTocItems = items;
    return items;
  }

  function rememberRendered(source, items) {
    lastExtractedTocSource = String(source || "");
    lastExtractedTocItems = Array.isArray(items) ? items : [];
  }

  return {
    extract,
    rememberRendered,
  };
}

export function createTocSyncController({
  markdownContent,
  tocItems,
  isMarkdownDocument,
  showToc,
  sidebarSection,
  getDocumentPerformanceProfile,
  extractTocItemsFromMarkdown,
}) {
  let queuedTocSyncRafId = 0;
  let queuedTocSyncTimer = 0;

  function syncTocFromMarkdown() {
    if (!isMarkdownDocument.value) {
      tocItems.value = [];
      return;
    }

    tocItems.value = extractTocItemsFromMarkdown(markdownContent.value);
  }

  function shouldSyncTocInLiveMode() {
    return showToc.value && sidebarSection.value === "outline";
  }

  function cancelScheduledTocSync() {
    if (queuedTocSyncTimer) {
      clearTimeout(queuedTocSyncTimer);
      queuedTocSyncTimer = 0;
    }
    if (queuedTocSyncRafId) {
      cancelAnimationFrame(queuedTocSyncRafId);
      queuedTocSyncRafId = 0;
    }
  }

  function scheduleTocSync(options = {}) {
    const { immediate = false } = options;

    if (!shouldSyncTocInLiveMode()) {
      return;
    }

    if (typeof window === "undefined") {
      syncTocFromMarkdown();
      return;
    }

    cancelScheduledTocSync();

    const profile = getDocumentPerformanceProfile(markdownContent.value.length);

    if (immediate) {
      queuedTocSyncRafId = window.requestAnimationFrame(() => {
        queuedTocSyncRafId = 0;
        syncTocFromMarkdown();
      });
      return;
    }

    queuedTocSyncTimer = window.setTimeout(() => {
      queuedTocSyncTimer = 0;
      queuedTocSyncRafId = window.requestAnimationFrame(() => {
        queuedTocSyncRafId = 0;
        syncTocFromMarkdown();
      });
    }, profile.tocSyncDelay);
  }

  return {
    syncTocFromMarkdown,
    shouldSyncTocInLiveMode,
    scheduleTocSync,
    cancelScheduledTocSync,
  };
}
