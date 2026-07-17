<script setup>
import { getSmartThemeStyleLabel } from "./smartThemes";

const props = defineProps({
  themes: {
    type: Array,
    default: () => [],
  },
  currentTheme: {
    type: String,
    default: "",
  },
  generating: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["generate", "apply", "delete"]);

function isBuiltInTheme(theme) {
  return Boolean(theme?.builtIn || theme?.locked);
}
</script>

<template>
  <div class="section-body smart-theme-section">
    <button
      class="generate-theme-btn"
      type="button"
      :disabled="props.generating"
      @click="emit('generate')"
    >
      <span v-if="props.generating" class="theme-spinner"></span>
      <span>{{ props.generating ? "生成中..." : "AI生成主题" }}</span>
    </button>

    <div v-if="props.themes.length" class="smart-theme-list">
      <article
        v-for="theme in props.themes"
        :key="theme.id"
        class="smart-theme-card"
        :class="{ active: props.currentTheme === theme.id, builtin: isBuiltInTheme(theme) }"
      >
        <div class="smart-theme-main">
          <div class="smart-theme-title">
            <strong>{{ theme.name }}</strong>
            <div class="smart-theme-tags">
              <span v-if="isBuiltInTheme(theme)">内置</span>
              <span>{{ theme.mode === "dark" ? "深色" : "浅色" }}</span>
              <span>{{ getSmartThemeStyleLabel(theme.style) }}</span>
            </div>
          </div>
          <p>{{ theme.description }}</p>
        </div>

        <div class="smart-theme-footer">
          <div class="theme-swatches" aria-hidden="true">
            <span :style="{ backgroundColor: theme.palette?.background }"></span>
            <span :style="{ backgroundColor: theme.palette?.surface }"></span>
            <span :style="{ backgroundColor: theme.palette?.accent }"></span>
            <span :style="{ backgroundColor: theme.palette?.text }"></span>
          </div>

          <div class="smart-theme-actions">
            <button
              class="theme-apply-btn"
              type="button"
              :disabled="props.currentTheme === theme.id"
              @click="emit('apply', theme.id)"
            >
              {{ props.currentTheme === theme.id ? "使用中" : "切换" }}
            </button>
            <button
              v-if="!isBuiltInTheme(theme)"
              class="theme-delete-btn"
              type="button"
              title="删除主题"
              @click="emit('delete', theme.id)"
            >
              删除
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="smart-theme-empty">
      还没有生成过主题。可以先点一次“AI生成主题”，试试水晶、拟物或专业深色风格。
    </div>
  </div>
</template>

<style scoped>
.smart-theme-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.smart-theme-hero {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--accent-color) 20%, var(--border-color));
  border-radius: 12px;
  background: radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--accent-color) 12%, transparent),
      transparent 36%
    ),
    var(--bg-toolbar);
}

.generate-theme-btn {
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--accent-color);
  border-radius: 5px;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-color) 24%, transparent);
}

.generate-theme-btn:disabled {
  opacity: 0.68;
  cursor: wait;
}

.theme-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 999px;
  animation: theme-spin 0.8s linear infinite;
}

.smart-theme-hero p,
.smart-theme-empty,
.smart-theme-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.smart-theme-list {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.smart-theme-list::-webkit-scrollbar {
  width: 8px;
}

.smart-theme-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--scrollbar-thumb);
}

.smart-theme-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-toolbar);
}

.smart-theme-card.active {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 12%, transparent);
}

.smart-theme-card.builtin {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent-color) 7%, transparent),
      transparent 42%
    ),
    var(--bg-toolbar);
}

.smart-theme-main {
  min-width: 0;
}

.smart-theme-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.smart-theme-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 13px;
}

.smart-theme-tags {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  flex-shrink: 0;
}

.smart-theme-tags span {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
  font-size: 10px;
  font-weight: 700;
}

.smart-theme-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.theme-swatches {
  display: flex;
  gap: 5px;
  margin-top: 0;
}

.theme-swatches span {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
}

.smart-theme-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.theme-apply-btn,
.theme-delete-btn {
  height: 28px;
  border-radius: 8px;
  padding: 0 9px;
  font-size: 11px;
  cursor: pointer;
}

.theme-apply-btn {
  border: 1px solid var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
  font-weight: 700;
}

.theme-apply-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.theme-delete-btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

.theme-delete-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.smart-theme-empty {
  padding: 10px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: var(--bg-toolbar);
}

@keyframes theme-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
