<template>
  <div
    ref="containerRef"
    class="rendered-preview markdown-body"
    v-html="renderedHtml"
  ></div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Marked, Renderer } from "marked";
import {
  createCodeBlockRenderer,
  escapeCodeHtml,
  renderHighlightedCodeBlock,
} from "@/shared/markdown/codeBlockHighlight";
import {
  loadMermaid,
  resolveMermaidThemeFromDocument,
} from "@/shared/markdown/mermaidRuntime";
import {
  postProcessMarkdownHtml,
  resolveMarkdownImagesInContainer,
} from "@/shared/markdown/renderPostProcess";

const props = defineProps({
  content: {
    type: String,
    default: "",
  },
  resolveImagePath: {
    type: Function,
    default: null,
  },
  readImageAsBase64: {
    type: Function,
    default: null,
  },
});

const containerRef = ref(null);
const renderedHtml = ref("");
const instanceId = `format-preview-${Math.random().toString(36).slice(2)}`;
let renderVersion = 0;
let mermaidCounter = 0;
const imageBase64Cache = new Map();
const MAX_IMAGE_BASE64_CACHE_ENTRIES = 24;
const MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;
let currentCodeBlockRenderer = renderHighlightedCodeBlock;

function createMarkdownParser() {
  const renderer = new Renderer();

  renderer.code = ({ text, lang }) => {
    const normalizedLang = String(lang || "")
      .trim()
      .toLowerCase();
    if (normalizedLang === "mermaid") {
      const id = `${instanceId}-mermaid-${mermaidCounter++}`;
      return `<div class="mermaid-wrapper" data-mermaid-id="${id}"><pre class="mermaid">${escapeCodeHtml(
        text
      )}</pre></div>`;
    }

    return currentCodeBlockRenderer(text, normalizedLang);
  };

  return new Marked({
    renderer,
    gfm: true,
    breaks: true,
  });
}

const markdownParser = createMarkdownParser();

async function resolveImages(version) {
  const container = containerRef.value;
  if (!container) {
    return;
  }

  await resolveMarkdownImagesInContainer({
    container,
    resolveImagePath: props.resolveImagePath,
    readImageAsBase64: props.readImageAsBase64,
    cache: imageBase64Cache,
    maxValueLength: MAX_IMAGE_BASE64_LENGTH,
    maxCacheEntries: MAX_IMAGE_BASE64_CACHE_ENTRIES,
    shouldContinue: () => version === renderVersion,
  });
}

async function renderMermaid(version) {
  if (!containerRef.value) {
    return;
  }

  const elements = containerRef.value.querySelectorAll(".mermaid-wrapper pre.mermaid");
  if (!elements.length) {
    return;
  }

  const mermaid = await loadMermaid(resolveMermaidThemeFromDocument());
  for (const element of elements) {
    if (version !== renderVersion) {
      return;
    }

    const wrapper = element.parentElement;
    const id = wrapper?.getAttribute("data-mermaid-id");
    if (!wrapper || !id) {
      continue;
    }

    try {
      const { svg } = await mermaid.render(id, element.textContent || "");
      if (version === renderVersion) {
        wrapper.innerHTML = svg;
      }
    } catch (error) {
      wrapper.replaceChildren();
      const message = document.createElement("pre");
      message.className = "mermaid-error";
      message.textContent = `图表渲染失败: ${error.message || error}`;
      wrapper.appendChild(message);
    }
  }
}

async function renderContent() {
  const version = ++renderVersion;
  mermaidCounter = 0;
  currentCodeBlockRenderer = createCodeBlockRenderer({
    documentLength: String(props.content || "").length,
  });
  renderedHtml.value = postProcessMarkdownHtml(markdownParser.parse(props.content || ""));
  await nextTick();
  if (version !== renderVersion) {
    return;
  }

  const jobs = [];
  if (renderedHtml.value.includes("<img")) {
    jobs.push(resolveImages(version));
  }
  if (renderedHtml.value.includes("mermaid-wrapper")) {
    jobs.push(renderMermaid(version));
  }
  await Promise.all(jobs);
}

watch(() => props.content, renderContent, { immediate: true });

onBeforeUnmount(() => {
  renderVersion += 1;
});
</script>

<style scoped>
.rendered-preview {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  padding: 20px 22px 36px;
  font-size: 14px;
}

.rendered-preview :deep(> :first-child) {
  margin-top: 0;
}

.rendered-preview :deep(table) {
  width: 100%;
}

.rendered-preview :deep(.mermaid-wrapper) {
  min-height: 80px;
}
</style>
