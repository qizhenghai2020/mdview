<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import mermaid from 'mermaid'

const props = defineProps({
  code: {
    type: String,
    required: true
  }
})

const rendered = ref('')
const error = ref('')
const containerId = `mermaid-${Math.random().toString(36).slice(2, 11)}`

// 初始化 mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true
  },
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 10,
    diagramMarginY: 10,
    actorMargin: 50,
    width: 150,
    height: 65
  }
})

async function renderChart() {
  try {
    error.value = ''
    const { svg } = await mermaid.render(containerId, props.code)
    rendered.value = svg
  } catch (e) {
    error.value = e.message || '图表渲染失败'
    console.warn('Mermaid 渲染错误:', e)
  }
}

watch(() => props.code, () => {
  nextTick(renderChart)
}, { immediate: true })

onMounted(renderChart)
</script>

<template>
  <div class="mermaid-container">
    <div v-if="error" class="mermaid-error">
      <p>⚠️ 图表渲染失败</p>
      <pre>{{ error }}</pre>
    </div>
    <div v-else class="mermaid-content" v-html="rendered"></div>
  </div>
</template>

<style scoped>
.mermaid-container {
  margin: 16px 0;
  text-align: center;
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

.mermaid-content {
  display: flex;
  justify-content: center;
}

.mermaid-content svg {
  max-width: 100%;
  height: auto;
}

.mermaid-error {
  color: #f85149;
  text-align: left;
}

.mermaid-error p {
  margin-bottom: 8px;
  font-weight: 500;
}

.mermaid-error pre {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>