<template>
  <div
    v-if="props.visible"
    class="format-preview-backdrop"
    @mousedown.self="emit('close')"
  >
    <section class="format-preview-modal" role="dialog" aria-modal="true">
      <header class="format-preview-header">
        <div>
          <span class="eyebrow">AI FORMAT PREVIEW</span>
          <h2>确认是否使用AI排版结果</h2>
          <p>
            左右两侧均为渲染后的阅读效果，方便直接比较层级、留白、列表、表格和图表。确认后才会写回文档。
          </p>
        </div>
        <button class="preview-close" type="button" title="关闭" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="preview-grid">
        <article class="preview-pane">
          <div class="pane-title">
            <strong>排版前效果</strong>
            <span>{{ originalStats.lines }} 行 / {{ originalStats.chars }} 字符</span>
          </div>
          <div
            ref="originalScrollRef"
            class="preview-scroll"
            @scroll="syncPreviewScroll(originalScrollRef, formattedScrollRef)"
          >
            <MarkdownPreviewPane
              :content="props.originalContent"
              :resolve-image-path="props.resolveImagePath"
              :read-image-as-base64="props.readImageAsBase64"
            />
          </div>
        </article>

        <article class="preview-pane is-formatted">
          <div class="pane-title">
            <strong>排版后效果</strong>
            <span>{{ formattedStats.lines }} 行 / {{ formattedStats.chars }} 字符</span>
          </div>
          <div
            ref="formattedScrollRef"
            class="preview-scroll"
            @scroll="syncPreviewScroll(formattedScrollRef, originalScrollRef)"
          >
            <MarkdownPreviewPane
              :content="props.formattedContent"
              :resolve-image-path="props.resolveImagePath"
              :read-image-as-base64="props.readImageAsBase64"
            />
          </div>
        </article>
      </div>

      <footer class="format-preview-actions">
        <button class="preview-secondary-btn" type="button" @click="emit('close')">
          不使用
        </button>
        <button class="preview-primary-btn" type="button" @click="emit('use')">
          使用排版结果
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import MarkdownPreviewPane from "./MarkdownPreviewPane.vue";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  originalContent: {
    type: String,
    default: "",
  },
  formattedContent: {
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

const emit = defineEmits(["use", "close"]);
const originalScrollRef = ref(null);
const formattedScrollRef = ref(null);
let syncingScroll = false;

function countLines(content) {
  if (!content) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
}

const originalStats = computed(() => ({
  lines: countLines(props.originalContent),
  chars: props.originalContent.length,
}));

const formattedStats = computed(() => ({
  lines: countLines(props.formattedContent),
  chars: props.formattedContent.length,
}));

function syncPreviewScroll(source, target) {
  if (syncingScroll || !source || !target) {
    return;
  }

  syncingScroll = true;

  const sourceMaxTop = source.scrollHeight - source.clientHeight;
  const targetMaxTop = target.scrollHeight - target.clientHeight;
  target.scrollTop =
    sourceMaxTop > 0 ? (source.scrollTop / sourceMaxTop) * targetMaxTop : 0;

  const sourceMaxLeft = source.scrollWidth - source.clientWidth;
  const targetMaxLeft = target.scrollWidth - target.clientWidth;
  target.scrollLeft =
    sourceMaxLeft > 0 ? (source.scrollLeft / sourceMaxLeft) * targetMaxLeft : 0;

  requestAnimationFrame(() => {
    syncingScroll = false;
  });
}
</script>

<style scoped>
.format-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(7px);
}

.format-preview-modal {
  width: min(1180px, 100%);
  height: min(780px, 88vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.32);
}

.format-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(135deg, var(--bg-toolbar), var(--bg-secondary));
}

.eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--accent-color);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.format-preview-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
}

.format-preview-header p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.preview-close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.preview-close:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.preview-grid {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
  background: var(--bg-secondary);
}

.preview-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-primary);
}

.preview-pane.is-formatted {
  border-color: color-mix(in srgb, var(--accent-color) 28%, var(--border-color));
}

.pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-toolbar);
}

.pane-title strong {
  font-size: 13px;
  color: var(--text-primary);
}

.pane-title span {
  color: var(--text-secondary);
  font-size: 11px;
}

.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--bg-primary);
  scrollbar-gutter: stable;
}

.format-preview-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-toolbar);
}

.preview-primary-btn,
.preview-secondary-btn {
  height: 36px;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  cursor: pointer;
}

.preview-primary-btn {
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: #fff;
}

.preview-secondary-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}

@media (max-width: 860px) {
  .format-preview-backdrop {
    align-items: flex-start;
    padding: 12px;
  }

  .format-preview-modal {
    height: calc(100vh - 24px);
  }

  .preview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
