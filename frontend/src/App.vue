<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import mermaid from 'mermaid'
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime'
import {
  OpenFileDialog,
  GetFileName,
  GetFilePath,
  ResolveImagePath,
  ReadImageAsBase64,
  RegisterFileAssociation,
  IsFileAssociationSet,
  GetStartupFile,
  ReadFileAndUpdateWatch,
  WriteFile,
  SaveFileDialog,
} from '../wailsjs/go/main/App'

const markdownContent = ref('')
const editedContent = ref('')
const originalContent = ref('') // 用于保存原始内容，判断是否有修改
const renderedHtml = ref('')
const fileName = ref('未打开文件')
const filePath = ref('')
const isDark = ref(false)
const showToc = ref(true)
const tocItems = ref([])
const activeTocId = ref('')
const isDragging = ref(false)
const zoomLevel = ref(100)
const isAssociated = ref(false)
const isAssociating = ref(false) // 关联按钮loading状态
const currentTheme = ref('elegant')
const viewMode = ref('preview') // 只有两个值: 'preview' 和 'split'
const editorRef = ref(null)
const previewRef = ref(null)
const isEditorScrolling = ref(false)
const isPreviewScrolling = ref(false)
const mermaidIdCounter = ref(0)
const isExternalChange = ref(false)
const isSaving = ref(false) // 保存中状态
const editHistory = ref([]) // 编辑历史，用于撤销
const historyIndex = ref(-1) // 当前历史位置
const MAX_HISTORY = 50 // 最大历史记录数

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: { useMaxWidth: true },
  sequence: { useMaxWidth: true },
})

// 配置 marked
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch (_) {}
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true,
})

// 自定义 renderer
const renderer = new marked.Renderer()

renderer.image = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : ''
  return `<img src="${href}" alt="${text}"${titleAttr} style="max-width:100%;" loading="lazy" />`
}

// 处理代码块 - 支持多种图表
const originalCode = renderer.code.bind(renderer)
renderer.code = function ({ text, lang }) {
  // Mermaid 图表
  if (lang === 'mermaid') {
    const id = `mermaid-${mermaidIdCounter.value++}`
    return `<div class="mermaid-wrapper" data-mermaid-id="${id}"><pre class="mermaid">${text}</pre></div>`
  }
  // Flowchart.js
  if (lang === 'flowchart' || lang === 'flow') {
    return `<div class="flowchart-wrapper"><pre class="flowchart">${text}</pre></div>`
  }
  // Chart.js 数据
  if (lang === 'chart') {
    return `<div class="chart-wrapper"><pre class="chart-data">${text}</pre></div>`
  }
  // PlantUML (需要服务端渲染，这里显示为代码)
  if (lang === 'plantuml' || lang === 'puml') {
    return `<div class="plantuml-wrapper"><pre class="plantuml">${text}</pre></div>`
  }
  // 普通代码块
  const highlighted = lang && hljs.getLanguage(lang)
    ? hljs.highlight(text, { language: lang }).value
    : hljs.highlightAuto(text).value
  return `<pre class="code-block"><code class="hljs language-${lang || 'auto'}">${highlighted}</code></pre>`
}

// TOC 提取
let headings = []
let headingCounter = {}
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens)
  const slug = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  let id = slug
  if (headingCounter[slug]) {
    headingCounter[slug]++
    id = `${slug}-${headingCounter[slug]}`
  } else {
    headingCounter[slug] = 1
  }
  headings.push({ id, text, level: depth })
  return `<h${depth} id="${id}">${text}</h${depth}>`
}

// 渲染 Markdown
async function renderMarkdown() {
  headings = []
  headingCounter = {}
  mermaidIdCounter.value = 0
  const html = marked(markdownContent.value, { renderer })
  renderedHtml.value = html
  tocItems.value = [...headings]

  // 渲染 Mermaid 图表
  await nextTick()
  await renderMermaidCharts()
}

// 渲染 Mermaid 图表
async function renderMermaidCharts() {
  const mermaidElements = document.querySelectorAll('.mermaid-wrapper pre.mermaid')
  for (const el of mermaidElements) {
    try {
      const id = el.parentElement.getAttribute('data-mermaid-id')
      const graphDefinition = el.textContent
      const { svg } = await mermaid.render(id, graphDefinition)
      el.parentElement.innerHTML = svg
    } catch (e) {
      console.warn('Mermaid 渲染失败:', e)
      el.parentElement.innerHTML = `<pre class="mermaid-error">图表渲染失败: ${e.message}</pre>`
    }
  }
}

// 监听内容变化
watch(markdownContent, () => {
  renderMarkdown()
})

// 判断是否有未保存的修改
const hasChanges = computed(() => {
  return editedContent.value !== originalContent.value
})

// 添加编辑历史记录
function addToHistory(content) {
  // 如果当前不在历史末尾，删除后面的历史
  if (historyIndex.value < editHistory.value.length - 1) {
    editHistory.value = editHistory.value.slice(0, historyIndex.value + 1)
  }
  // 添加新历史
  editHistory.value.push(content)
  // 限制历史记录数量
  if (editHistory.value.length > MAX_HISTORY) {
    editHistory.value.shift()
  }
  historyIndex.value = editHistory.value.length - 1
}

// 撤销
function undo() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    editedContent.value = editHistory.value[historyIndex.value]
    markdownContent.value = editedContent.value
  }
}

// 重做
function redo() {
  if (historyIndex.value < editHistory.value.length - 1) {
    historyIndex.value++
    editedContent.value = editHistory.value[historyIndex.value]
    markdownContent.value = editedContent.value
  }
}

// 编辑模式内容变化
let lastEditedContent = ''
watch(editedContent, (newVal, oldVal) => {
  // 如果是外部变更触发的更新，跳过
  if (isExternalChange.value) {
    isExternalChange.value = false
    lastEditedContent = newVal
    return
  }
  // 添加到历史记录（仅当用户真正编辑时）
  if (newVal !== lastEditedContent && viewMode.value === 'split') {
    addToHistory(newVal)
    lastEditedContent = newVal
  }
  markdownContent.value = editedContent.value
})

// 打开文件
async function openFile() {
  const path = await OpenFileDialog()
  if (!path) return
  await loadFile(path)
}

// 加载文件（带监听）
async function loadFile(path) {
  try {
    const content = await ReadFileAndUpdateWatch(path)
    isExternalChange.value = true
    markdownContent.value = content
    editedContent.value = content
    originalContent.value = content
    lastEditedContent = content
    // 重置编辑历史
    editHistory.value = [content]
    historyIndex.value = 0
    fileName.value = await GetFileName()
    filePath.value = await GetFilePath()
    viewMode.value = 'preview'
  } catch (e) {
    console.error('读取文件失败:', e)
  }
}

// 处理文件外部变更
async function handleFileChanged() {
  if (!filePath.value) return
  try {
    const content = await ReadFileAndUpdateWatch(filePath.value)
    isExternalChange.value = true
    markdownContent.value = content
    editedContent.value = content
    originalContent.value = content
    lastEditedContent = content
    // 重置编辑历史
    editHistory.value = [content]
    historyIndex.value = 0
  } catch (e) {
    console.warn('重新加载文件失败:', e)
  }
}

// 主题切换
const themes = [
  { id: 'default', name: '默认' },
  { id: 'dark', name: '暗色' },
  { id: 'elegant', name: '雅致' },
]

function setTheme(themeId) {
  currentTheme.value = themeId
  isDark.value = (themeId === 'dark')
  document.documentElement.setAttribute('data-theme', themeId)
}

function cycleTheme() {
  const currentIndex = themes.findIndex(t => t.id === currentTheme.value)
  const nextIndex = (currentIndex + 1) % themes.length
  setTheme(themes[nextIndex].id)
}

// 视图模式切换 - 只有两种模式：预览和分屏编辑
function toggleViewMode() {
  if (viewMode.value === 'preview') {
    // 切换到分屏编辑模式
    viewMode.value = 'split'
    editedContent.value = markdownContent.value
    lastEditedContent = markdownContent.value
    // 初始化历史记录
    if (editHistory.value.length === 0 || editHistory.value[editHistory.value.length - 1] !== editedContent.value) {
      editHistory.value = [editedContent.value]
      historyIndex.value = 0
    }
  } else {
    // 切换到预览模式
    viewMode.value = 'preview'
  }
}

// 保存文件
async function saveFile() {
  if (!filePath.value || !hasChanges.value || isSaving.value) return

  isSaving.value = true
  try {
    await WriteFile(filePath.value, editedContent.value)
    originalContent.value = editedContent.value
    // 通知用户
    console.log('文件已保存')
  } catch (e) {
    console.error('保存失败:', e)
    alert('保存失败: ' + e.message)
  } finally {
    isSaving.value = false
  }
}

// 编辑器滚动同步 - 双向比例同步
function handleEditorScroll() {
  if (isPreviewScrolling.value) return
  isEditorScrolling.value = true

  const editor = editorRef.value
  const preview = previewRef.value
  if (!editor || !preview) return

  const editorMaxScroll = editor.scrollHeight - editor.clientHeight
  const previewMaxScroll = preview.scrollHeight - preview.clientHeight

  if (editorMaxScroll <= 0 || previewMaxScroll <= 0) {
    setTimeout(() => { isEditorScrolling.value = false }, 50)
    return
  }

  const scrollRatio = editor.scrollTop / editorMaxScroll
  preview.scrollTop = scrollRatio * previewMaxScroll

  setTimeout(() => { isEditorScrolling.value = false }, 50)
}

function handlePreviewScroll() {
  if (isEditorScrolling.value) return
  isPreviewScrolling.value = true

  const editor = editorRef.value
  const preview = previewRef.value
  if (!editor || !preview) return

  const editorMaxScroll = editor.scrollHeight - editor.clientHeight
  const previewMaxScroll = preview.scrollHeight - preview.clientHeight

  if (editorMaxScroll <= 0 || previewMaxScroll <= 0) {
    setTimeout(() => { isPreviewScrolling.value = false }, 50)
    return
  }

  const scrollRatio = preview.scrollTop / previewMaxScroll
  editor.scrollTop = scrollRatio * editorMaxScroll

  setTimeout(() => { isPreviewScrolling.value = false }, 50)
}

// 缩放控制
const MIN_ZOOM = 50
const MAX_ZOOM = 200
const ZOOM_STEP = 10

function zoomIn() {
  if (zoomLevel.value < MAX_ZOOM) {
    zoomLevel.value += ZOOM_STEP
    applyZoom()
  }
}

function zoomOut() {
  if (zoomLevel.value > MIN_ZOOM) {
    zoomLevel.value -= ZOOM_STEP
    applyZoom()
  }
}

function resetZoom() {
  zoomLevel.value = 100
  applyZoom()
}

function applyZoom() {
  document.documentElement.style.setProperty('--base-font-size', `${16 * (zoomLevel.value / 100)}px`)
}

// 关联文件
async function associateFile() {
  if (isAssociating.value) return
  isAssociating.value = true
  try {
    await RegisterFileAssociation()
    isAssociated.value = true
    alert('已关联 .md 和 .markdown 文件！')
  } catch (e) {
    console.error('关联失败:', e)
    alert('关联失败，请以管理员身份运行程序后重试。')
  } finally {
    isAssociating.value = false
  }
}

// 检查关联
async function checkAssociation() {
  try {
    const result = await IsFileAssociationSet()
    isAssociated.value = result
  } catch (e) {
    console.warn('检查关联状态失败:', e)
  }
}

// 加载启动文件
async function loadStartupFile() {
  try {
    const startupFile = await GetStartupFile()
    if (startupFile) {
      await loadFile(startupFile)
      return true
    }
  } catch (e) {
    console.warn('检查启动参数失败:', e)
  }
  return false
}

// 显示欢迎内容
function showWelcome() {
  markdownContent.value = `# MD 查看器

欢迎使用 MD 查看器！

## 功能特性

- **编辑/预览**：右上角切换编辑、预览、分屏模式
- **实时同步**：分屏模式下编辑与预览同步滚动
- **图表支持**：Mermaid、Flowchart 等图表渲染
- **主题切换**：默认、暗色、雅致三种主题

## 图表示例

### Mermaid 流程图

\`\`\`mermaid
graph TD
    A[开始] --> B{条件判断}
    B -->|是| C[执行操作]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
\`\`\`

### Mermaid 时序图

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 系统
    用户->>系统: 发送请求
    系统->>系统: 处理数据
    系统->>用户: 返回结果
\`\`\`

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+O | 打开文件 |

---

> 点击右上角按钮切换编辑/预览模式
`
}

// 键盘快捷键
function handleKeyDown(e) {
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault()
    openFile()
  }
  // Ctrl+S 保存
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault()
    if (viewMode.value === 'split' && hasChanges.value) {
      saveFile()
    }
  }
  // Ctrl+Z 撤销
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault()
    if (viewMode.value === 'split') {
      undo()
    }
  }
  // Ctrl+Y 重做
  if (e.ctrlKey && e.key === 'y') {
    e.preventDefault()
    if (viewMode.value === 'split') {
      redo()
    }
  }
}

// 拖拽处理
function handleDragOver(e) {
  e.preventDefault()
  e.stopPropagation()
  if (!isDragging.value) {
    isDragging.value = true
  }
}

function handleDragLeave(e) {
  e.preventDefault()
  e.stopPropagation()
  // 检查是否真的离开了容器
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX
  const y = e.clientY
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    isDragging.value = false
  }
}

async function handleDrop(e) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false

  const files = e.dataTransfer.files
  if (files.length > 0) {
    const file = files[0]
    if (file.name.match(/\.(md|markdown|mdown|mkdn|mkd|mdwn)$/i)) {
      // 使用后端加载文件，这样可以正确设置路径和监听
      const path = file.path || file.name
      if (path && path !== file.name) {
        await loadFile(path)
      } else {
        // 如果没有路径信息，使用 FileReader 读取
        const reader = new FileReader()
        reader.onload = async (ev) => {
          const content = ev.target.result
          markdownContent.value = content
          editedContent.value = content
          originalContent.value = content
          lastEditedContent = content
          editHistory.value = [content]
          historyIndex.value = 0
          fileName.value = file.name
          filePath.value = ''
        }
        reader.readAsText(file)
      }
    }
  }
}

// TOC 滚动
function scrollToHeading(id) {
  activeTocId.value = id
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function tocIndent(level) {
  return { paddingLeft: `${(level - 1) * 16 + 8}px` }
}

// 处理图片
function processImagePaths() {
  nextTick(async () => {
    const container = document.querySelector('.markdown-body')
    if (!container) return
    const images = container.querySelectorAll('img')
    for (const img of images) {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) continue
      try {
        const resolvedPath = await ResolveImagePath(src)
        const base64 = await ReadImageAsBase64(resolvedPath)
        if (base64) {
          img.setAttribute('src', base64)
        }
      } catch (e) {
        console.warn('图片加载失败:', src, e)
      }
    }
  })
}

watch(renderedHtml, () => {
  processImagePaths()
})

onMounted(async () => {
  document.addEventListener('keydown', handleKeyDown)
  checkAssociation()
  setTheme('elegant')

  // 监听文件变更事件
  EventsOn('file-changed', handleFileChanged)

  const loaded = await loadStartupFile()
  if (!loaded) {
    showWelcome()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  EventsOff('file-changed')
})
</script>

<template>
  <div
    class="app-container"
    :class="{ dark: isDark, dragging: isDragging, 'split-mode': viewMode === 'split' }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- 拖拽遮罩 -->
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-hint">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="12" y2="12"/>
          <line x1="15" y1="15" x2="12" y2="12"/>
        </svg>
        <p>释放以打开 Markdown 文件</p>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="toolbar-btn" @click="openFile" title="打开文件 (Ctrl+O)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>打开</span>
        </button>
        <button class="toolbar-btn" @click="showToc = !showToc" :class="{ active: showToc }" title="目录">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="15" y2="12"/>
            <line x1="3" y1="18" x2="18" y2="18"/>
          </svg>
          <span>目录</span>
        </button>
        <!-- 保存按钮 - 仅在分屏编辑模式下显示 -->
        <button
          v-if="viewMode === 'split'"
          class="toolbar-btn save-btn"
          @click="saveFile"
          :disabled="!hasChanges || isSaving"
          :class="{ 'has-changes': hasChanges }"
          title="保存 (Ctrl+S)"
        >
          <svg v-if="!isSaving" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span v-else class="loading-spinner-sm"></span>
          <span>保存</span>
        </button>
      </div>
      <div class="toolbar-center">
        <span class="file-name" :title="filePath">{{ fileName }}</span>
      </div>
      <div class="toolbar-right">
        <!-- 缩放控制 -->
        <div class="zoom-controls">
          <button class="toolbar-btn zoom-btn" @click="zoomOut" :disabled="zoomLevel <= MIN_ZOOM" title="缩小">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <button class="toolbar-btn zoom-value" @click="resetZoom" title="还原">{{ zoomLevel }}%</button>
          <button class="toolbar-btn zoom-btn" @click="zoomIn" :disabled="zoomLevel >= MAX_ZOOM" title="放大">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
        </div>
        <!-- 视图模式切换按钮 -->
        <button class="toolbar-btn view-btn" @click="toggleViewMode" :title="viewMode === 'preview' ? '切换到编辑模式' : '切换到预览模式'">
          <svg v-if="viewMode === 'preview'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="view-name">{{ viewMode === 'preview' ? '编辑' : '预览' }}</span>
        </button>
        <!-- 关联按钮 -->
        <button class="toolbar-btn associate-btn" @click="associateFile" :class="{ associated: isAssociated, loading: isAssociating }" :title="isAssociated ? '已关联' : '关联文件'" :disabled="isAssociating">
          <svg v-if="!isAssociating" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span v-else class="loading-spinner"></span>
        </button>
        <!-- 主题按钮 -->
        <button class="toolbar-btn theme-btn" @click="cycleTheme" :title="'主题: ' + (themes.find(t => t.id === currentTheme)?.name)">
          <svg v-if="currentTheme === 'dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <svg v-else-if="currentTheme === 'elegant'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <span class="theme-name">{{ themes.find(t => t.id === currentTheme)?.name }}</span>
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- TOC 侧边栏 -->
      <div class="toc-sidebar" v-if="showToc && tocItems.length > 0">
        <div class="toc-header">目录</div>
        <div class="toc-list">
          <div
            v-for="item in tocItems"
            :key="item.id"
            class="toc-item"
            :class="{ active: activeTocId === item.id, [`toc-h${item.level}`]: true }"
            :style="tocIndent(item.level)"
            @click="scrollToHeading(item.id)"
          >
            {{ item.text }}
          </div>
        </div>
      </div>

      <!-- 分屏模式 -->
      <template v-if="viewMode === 'split'">
        <div class="split-container">
          <textarea
            ref="editorRef"
            class="split-editor"
            v-model="editedContent"
            @scroll="handleEditorScroll"
            placeholder="在此输入 Markdown 内容..."
            spellcheck="false"
          ></textarea>
        </div>
        <div class="split-divider"></div>
        <div class="split-preview" ref="previewRef" @scroll="handlePreviewScroll">
          <div class="markdown-body" v-html="renderedHtml"></div>
        </div>
      </template>

      <!-- 预览模式 -->
      <template v-else>
        <div class="content-area" @scroll="handlePreviewScroll">
          <div class="markdown-body" v-html="renderedHtml"></div>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
/* CSS 变量 - 默认主题 */
:root, [data-theme="light"], [data-theme="default"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fa;
  --bg-toolbar: #ffffff;
  --bg-toc: #f6f8fa;
  --bg-toc-hover: #eaeef2;
  --bg-toc-active: #dbe4eb;
  --bg-drag: rgba(255, 255, 255, 0.95);
  --bg-editor: #fafbfc;
  --text-primary: #1f2328;
  --text-secondary: #656d76;
  --text-tertiary: #8b949e;
  --border-color: #d0d7de;
  --border-toolbar: #d0d7de;
  --accent-color: #0969da;
  --accent-hover: #0550ae;
  --code-bg: #f6f8fa;
  --code-border: #d0d7de;
  --blockquote-border: #d0d7de;
  --blockquote-bg: #f6f8fa;
  --table-border: #d0d7de;
  --table-stripe: #f6f8fa;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  --scrollbar-thumb: #c1c8cd;
  --scrollbar-track: transparent;
  --btn-hover: rgba(0,0,0,0.06);
  --btn-active: rgba(0,0,0,0.1);
}

/* 暗色主题 */
[data-theme="dark"] {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-toolbar: #161b22;
  --bg-toc: #161b22;
  --bg-toc-hover: #1c2129;
  --bg-toc-active: #1c2a3a;
  --bg-drag: rgba(13, 17, 23, 0.95);
  --bg-editor: #0d1117;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --border-color: #30363d;
  --border-toolbar: #21262d;
  --accent-color: #58a6ff;
  --accent-hover: #79c0ff;
  --code-bg: #161b22;
  --code-border: #30363d;
  --blockquote-border: #30363d;
  --blockquote-bg: #161b22;
  --table-border: #30363d;
  --table-stripe: #161b22;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
  --scrollbar-thumb: #484f58;
  --scrollbar-track: transparent;
  --btn-hover: rgba(255,255,255,0.06);
  --btn-active: rgba(255,255,255,0.1);
}

/* 雅致主题 */
[data-theme="elegant"] {
  --bg-primary: #f6f1e8;
  --bg-secondary: #fbf7f1;
  --bg-toolbar: #fffdf8;
  --bg-toc: rgba(255,255,255,0.68);
  --bg-toc-hover: rgba(15, 118, 110, 0.08);
  --bg-toc-active: rgba(15, 118, 110, 0.12);
  --bg-drag: rgba(246, 241, 232, 0.95);
  --bg-editor: #fffdf8;
  --text-primary: #161616;
  --text-secondary: #5c5c5c;
  --text-tertiary: #8a8a8a;
  --border-color: rgba(22, 22, 22, 0.12);
  --border-toolbar: rgba(22, 22, 22, 0.12);
  --accent-color: #0f766e;
  --accent-hover: #0d5d57;
  --code-bg: #111827;
  --code-border: rgba(255,255,255,0.08);
  --blockquote-border: rgba(15, 118, 110, 0.14);
  --blockquote-bg: rgba(15, 118, 110, 0.08);
  --table-border: rgba(22, 22, 22, 0.12);
  --table-stripe: rgba(255,255,255,0.5);
  --shadow-sm: 0 10px 30px rgba(25, 25, 25, 0.06);
  --shadow-md: 0 10px 30px rgba(25, 25, 25, 0.1);
  --scrollbar-thumb: rgba(22, 22, 22, 0.18);
  --scrollbar-track: transparent;
  --btn-hover: rgba(15, 118, 110, 0.08);
  --btn-active: rgba(15, 118, 110, 0.14);
  --font-display: "Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, serif;
}

[data-theme="elegant"] .app-container {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0)),
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.05), transparent 28%),
    radial-gradient(circle at left bottom, rgba(180, 83, 9, 0.05), transparent 24%),
    var(--bg-primary);
}

[data-theme="elegant"] .toolbar { background: var(--bg-toolbar); box-shadow: var(--shadow-sm); }
[data-theme="elegant"] .toc-sidebar { background: var(--bg-toc); border: 1px solid var(--border-color); border-radius: 14px; margin: 12px; box-shadow: var(--shadow-sm); }
[data-theme="elegant"] .toc-header { border-bottom-color: var(--border-color); font-family: var(--font-display); }
[data-theme="elegant"] .toc-item:hover { background: var(--bg-toc-hover); transform: translateX(2px); }
[data-theme="elegant"] .toc-item.active { background: var(--bg-toc-active); color: var(--accent-color); }
[data-theme="elegant"] .content-area { padding: 32px 48px; }
[data-theme="elegant"] .split-preview { padding: 24px 32px; }
[data-theme="elegant"] .markdown-body { font-family: var(--font-body); line-height: 1.8; margin: 0 auto; }
[data-theme="elegant"] .markdown-body h1, [data-theme="elegant"] .markdown-body h2, [data-theme="elegant"] .markdown-body h3, [data-theme="elegant"] .markdown-body h4 { font-family: var(--font-display); font-weight: 600; }
[data-theme="elegant"] .markdown-body h1 { font-size: clamp(1.8rem, 3vw, 2.6rem); border-bottom: 1px solid var(--border-color); }
[data-theme="elegant"] .markdown-body h2 { font-size: clamp(1.4rem, 2vw, 1.8rem); border-bottom: 1px solid var(--border-color); }
[data-theme="elegant"] .markdown-body code { background: rgba(15, 23, 42, 0.06); border-radius: 6px; padding: 0.12em 0.35em; }
[data-theme="elegant"] .markdown-body pre { background: #111827; color: #f9fafb; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); margin-left: 0; margin-right: 0; }
[data-theme="elegant"] .markdown-body pre code { background: transparent; color: inherit; }
[data-theme="elegant"] .markdown-body blockquote { background: var(--blockquote-bg); border-left-color: var(--accent-color); border-radius: 0 12px 12px 0; margin-left: 0; margin-right: 0; }
[data-theme="elegant"] .markdown-body table { background: rgba(255,255,255,0.7); overflow-x: auto; margin: 16px 0; }
[data-theme="elegant"] .markdown-body table th { background: rgba(15, 118, 110, 0.08); }
[data-theme="elegant"] .markdown-body img { border-radius: 12px; box-shadow: var(--shadow-sm); display: block; margin: 16px auto; max-width: 90%; }
[data-theme="elegant"] .markdown-body ul, [data-theme="elegant"] .markdown-body ol { margin-left: 1em; }
[data-theme="elegant"] .markdown-body hr { margin: 24px auto; max-width: 80%; }

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body { height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", Helvetica, Arial, sans-serif; }
#app { height: 100%; }

.app-container { height: 100%; display: flex; flex-direction: column; background: var(--bg-primary); color: var(--text-primary); position: relative; }

.drag-overlay { position: absolute; inset: 0; background: var(--bg-drag); z-index: 1000; display: flex; align-items: center; justify-content: center; border: 3px dashed var(--accent-color); border-radius: 8px; margin: 4px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
.app-container.dragging .drag-overlay { opacity: 1; pointer-events: auto; }
.drag-hint { text-align: center; color: var(--accent-color); }
.drag-hint svg { margin-bottom: 12px; }
.drag-hint p { font-size: 18px; font-weight: 500; }

.toolbar { display: flex; align-items: center; height: 44px; padding: 0 12px; background: var(--bg-toolbar); border-bottom: 1px solid var(--border-toolbar); flex-shrink: 0; -webkit-app-region: drag; user-select: none; }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 4px; -webkit-app-region: no-drag; }
.toolbar-center { flex: 1; text-align: center; overflow: hidden; }
.file-name { font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; display: inline-block; }

.toolbar-btn { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border: none; background: transparent; color: var(--text-secondary); border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.15s ease; -webkit-app-region: no-drag; }
.toolbar-btn:hover { background: var(--btn-hover); color: var(--text-primary); }
.toolbar-btn.active { background: var(--btn-active); color: var(--accent-color); }
.toolbar-btn span { line-height: 1; }

.zoom-controls { display: flex; align-items: center; gap: 2px; margin-right: 8px; padding-right: 8px; border-right: 1px solid var(--border-color); }
.zoom-btn { padding: 5px 6px; }
.zoom-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.zoom-value { padding: 5px 8px; font-size: 12px; font-weight: 500; min-width: 42px; justify-content: center; }

.view-btn { margin-right: 4px; }
.view-btn .view-name { font-size: 12px; max-width: 36px; }
.associate-btn { margin-right: 4px; }
.associate-btn.associated { color: var(--accent-color); }
.associate-btn.associated svg { fill: var(--accent-color); fill-opacity: 0.2; }
.associate-btn.loading { opacity: 0.7; cursor: wait; }
.theme-btn { margin-right: 4px; }
.theme-btn .theme-name { font-size: 12px; max-width: 40px; }

/* Loading spinner */
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid var(--text-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.main-content { flex: 1; display: flex; overflow: hidden; min-height: 0; }

.toc-sidebar { width: auto; min-width: 120px; max-width: 500px; background: var(--bg-toc); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; flex-shrink: 0; }
.toc-header { padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-tertiary); border-bottom: 1px solid var(--border-color); flex-shrink: 0; white-space: nowrap; }
.toc-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 0; }
.toc-item { padding: 6px 16px; font-size: 13px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: all 0.15s ease; border-left: 2px solid transparent; }
.toc-item:hover { background: var(--bg-toc-hover); color: var(--text-primary); }
.toc-item.active { background: var(--bg-toc-active); color: var(--accent-color); border-left-color: var(--accent-color); }
.toc-h1 { font-weight: 600; }
.toc-h2 { font-weight: 500; }
.toc-h3 { font-weight: 400; font-size: 12px; }

/* 编辑器样式 */
.edit-area { flex: 1; display: flex; overflow: hidden; }
.editor { width: 100%; height: 100%; padding: 24px; border: none; background: var(--bg-editor); color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; line-height: 1.6; resize: none; outline: none; }
.editor::placeholder { color: var(--text-tertiary); }

/* 分屏模式 */
.split-container { flex: 1; display: flex; overflow: hidden; }
.split-editor { flex: 1; padding: 20px; border: none; background: var(--bg-editor); color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; line-height: 1.6; resize: none; outline: none; }
.split-divider { width: 1px; background: var(--border-color); flex-shrink: 0; }
.split-preview { flex: 1; overflow-y: auto; padding: 20px 24px; }

/* 保存按钮样式 */
.save-btn.has-changes:not(:disabled) { color: var(--accent-color); background: var(--btn-hover); }
.save-btn.has-changes:not(:disabled):hover { background: var(--accent-color); color: white; }

.content-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 40px 48px; scroll-behavior: smooth; min-width: 0; }

/* 滚动条 */
.content-area::-webkit-scrollbar, .toc-list::-webkit-scrollbar, .editor::-webkit-scrollbar, .split-editor::-webkit-scrollbar, .split-preview::-webkit-scrollbar { width: 8px; }
.content-area::-webkit-scrollbar-track, .toc-list::-webkit-scrollbar-track, .editor::-webkit-scrollbar-track, .split-editor::-webkit-scrollbar-track, .split-preview::-webkit-scrollbar-track { background: var(--scrollbar-track); }
.content-area::-webkit-scrollbar-thumb, .toc-list::-webkit-scrollbar-thumb, .editor::-webkit-scrollbar-thumb, .split-editor::-webkit-scrollbar-thumb, .split-preview::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
.content-area::-webkit-scrollbar-thumb:hover, .toc-list::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }

/* Markdown 样式 */
.markdown-body { margin: 0 auto; font-size: var(--base-font-size, 16px); line-height: 1.7; color: var(--text-primary); word-wrap: break-word; overflow-wrap: break-word; max-width: 100%; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.3; color: var(--text-primary); scroll-margin-top: 20px; }
.markdown-body h1 { font-size: 2em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: 0.875em; }
.markdown-body h6 { font-size: 0.85em; color: var(--text-secondary); }
.markdown-body p { margin-bottom: 16px; }
.markdown-body a { color: var(--accent-color); text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; color: var(--accent-hover); }
.markdown-body strong { font-weight: 600; }
.markdown-body blockquote { padding: 0 1em; margin: 0 0 16px 0; color: var(--text-secondary); border-left: 4px solid var(--blockquote-border); background: var(--blockquote-bg); border-radius: 0 4px 4px 0; }
.markdown-body code { padding: 0.2em 0.4em; margin: 0; font-size: 85%; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code-bg); border: 1px solid var(--code-border); border-radius: 4px; }
.markdown-body pre { margin-bottom: 16px; padding: 16px; overflow: auto; font-size: 85%; line-height: 1.5; background: var(--code-bg); border: 1px solid var(--code-border); border-radius: 8px; white-space: pre-wrap; word-break: break-word; }
.markdown-body pre code { padding: 0; margin: 0; font-size: 100%; background: transparent; border: none; border-radius: 0; }
.markdown-body table { border-collapse: collapse;margin-bottom: 16px; overflow-x: auto; }
.markdown-body table th, .markdown-body table td { padding: 8px 13px; border: 1px solid var(--table-border); }
.markdown-body table th { font-weight: 600; background: var(--bg-secondary); }
.markdown-body table tr:nth-child(2n) { background: var(--table-stripe); }
.markdown-body img { max-width: 100%; border-radius: 6px; margin: 8px 0; }
.markdown-body hr { height: 1px; margin: 24px 0; background: var(--border-color); border: none; }
.markdown-body ul, .markdown-body ol { margin-bottom: 16px; padding-left: 2em; }
.markdown-body li { margin-bottom: 4px; }
.markdown-body li + li { margin-top: 4px; }

/* 图表样式 */
.mermaid-wrapper { margin: 16px 0; text-align: center; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; overflow-x: auto; }
.mermaid-wrapper svg { max-width: 100%; height: auto; }
.mermaid-error { color: #f85149; text-align: left; padding: 8px; }
.flowchart-wrapper, .chart-wrapper, .plantuml-wrapper { margin: 16px 0; padding: 16px; background: var(--code-bg); border-radius: 8px; overflow-x: auto; }

/* 代码块 */
.code-block { background: var(--code-bg); border-radius: 8px; }
[data-theme="elegant"] .code-block { background: #111827; }
</style>