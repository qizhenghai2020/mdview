<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Marked, Renderer } from "marked";
import hljs from "highlight.js";
import mermaid from "mermaid";

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function enhanceTaskListHtml(html) {
  if (typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div class="markdown-root">${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) {
    return html;
  }

  root.querySelectorAll("li").forEach((item) => {
    const checkbox = Array.from(item.children).find(
      (child) => child.tagName === "INPUT" && child.getAttribute("type") === "checkbox"
    );
    if (!checkbox) {
      return;
    }

    const isComplete = checkbox.hasAttribute("checked");
    item.classList.add("task-list-item", isComplete ? "is-complete" : "is-pending");
    checkbox.classList.add("task-list-checkbox");
    checkbox.setAttribute("aria-hidden", "true");
    item.parentElement?.classList.add("task-list");

    const badge = doc.createElement("span");
    badge.className = "task-status-badge";
    badge.textContent = isComplete ? "已完成" : "待执行";

    const content = doc.createElement("div");
    content.className = "task-list-content";
    Array.from(item.childNodes)
      .filter((node) => node !== checkbox)
      .forEach((node) => content.appendChild(node));

    if (content.firstChild?.nodeType === Node.TEXT_NODE) {
      content.firstChild.textContent = content.firstChild.textContent.replace(/^\s+/, "");
    }

    item.appendChild(badge);
    item.appendChild(content);
  });

  return root.innerHTML;
}

function createMarkdownParser() {
  const renderer = new Renderer();

  renderer.code = ({ text, lang }) => {
    if (String(lang || "").toLowerCase() === "mermaid") {
      const id = `${instanceId}-mermaid-${mermaidCounter++}`;
      return `<div class="mermaid-wrapper" data-mermaid-id="${id}"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
    }

    const language = lang && hljs.getLanguage(lang) ? lang : "";
    const highlighted = language
      ? hljs.highlight(text, { language }).value
      : hljs.highlightAuto(text).value;
    return `<pre class="code-block"><code class="hljs${language ? ` language-${language}` : ""}">${highlighted}</code></pre>`;
  };

  return new Marked({
    renderer,
    gfm: true,
    breaks: true,
  });
}

const markdownParser = createMarkdownParser();

async function resolveImages(version) {
  if (!props.resolveImagePath || !props.readImageAsBase64 || !containerRef.value) {
    return;
  }

  const images = containerRef.value.querySelectorAll("img");
  for (const image of images) {
    if (version !== renderVersion) {
      return;
    }

    const src = image.getAttribute("src");
    if (!src || /^(?:data:|https?:\/\/)/i.test(src)) {
      continue;
    }

    try {
      const resolvedPath = await props.resolveImagePath(src);
      const base64 = await props.readImageAsBase64(resolvedPath);
      if (base64 && version === renderVersion) {
        image.setAttribute("src", base64);
      }
    } catch (error) {
      console.warn("智能排版预览图片加载失败:", src, error);
    }
  }
}

async function renderMermaid(version) {
  if (!containerRef.value) {
    return;
  }

  const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "loose",
    flowchart: { useMaxWidth: true },
    sequence: { useMaxWidth: true },
  });

  const elements = containerRef.value.querySelectorAll(".mermaid-wrapper pre.mermaid");
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
  renderedHtml.value = enhanceTaskListHtml(markdownParser.parse(props.content || ""));
  await nextTick();
  if (version !== renderVersion) {
    return;
  }

  await Promise.all([resolveImages(version), renderMermaid(version)]);
}

watch(() => props.content, renderContent, { immediate: true });

onBeforeUnmount(() => {
  renderVersion += 1;
});
</script>

<template>
  <div ref="containerRef" class="rendered-preview markdown-body" v-html="renderedHtml"></div>
</template>

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
