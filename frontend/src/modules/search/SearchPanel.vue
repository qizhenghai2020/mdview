<template>
  <section class="search-panel" aria-label="搜索">
    <div class="search-input-row">
      <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <input
        ref="inputRef"
        class="search-input"
        type="search"
        :value="query"
        placeholder="搜索工作区文件"
        aria-label="搜索工作区文件"
        autocomplete="off"
        @input="handleInput"
      />
      <button
        class="search-filter-button"
        :class="{ active: matchCase }"
        type="button"
        title="区分大小写"
        aria-label="区分大小写"
        :aria-pressed="matchCase"
        @click="emit('update:matchCase', !matchCase)"
      >
        <span aria-hidden="true">Aa</span>
      </button>
      <button
        class="search-filter-button"
        :class="{ active: matchWholeWord }"
        type="button"
        title="全字段匹配"
        aria-label="全字段匹配"
        :aria-pressed="matchWholeWord"
        @click="emit('update:matchWholeWord', !matchWholeWord)"
      >
        <span aria-hidden="true">ab</span>
      </button>
      <button
        v-if="query"
        class="search-clear-button"
        type="button"
        title="清除搜索"
        aria-label="清除搜索"
        @click="clearSearch"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      </button>
    </div>

    <div v-if="query" class="search-status" aria-live="polite">
      <span v-if="loading">正在搜索...</span>
      <span v-else-if="totalMatches">找到 {{ totalMatches }} 个结果</span>
      <span v-else>未找到匹配内容</span>
      <span v-if="truncated" class="search-truncated">已显示前 500 条</span>
    </div>

    <div v-if="groups.length" class="search-results">
      <section
        v-for="(group, groupIndex) in groups"
        :key="group.filePath"
        class="search-file-group"
      >
        <button
          class="search-file-header"
          type="button"
          :title="group.filePath"
          :aria-expanded="isGroupExpanded(group.filePath)"
          :aria-controls="`search-group-${groupIndex}`"
          @click="toggleGroup(group.filePath)"
        >
          <span
            class="search-group-chevron"
            :class="{ expanded: isGroupExpanded(group.filePath) }"
            aria-hidden="true"
          >
            <svg viewBox="0 0 16 16" fill="none">
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </svg>
          </span>
          <span class="search-file-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M5 2.5h6l4 4v11H5v-15Z" />
              <path d="M11 2.5v4h4" />
            </svg>
          </span>
          <span class="search-file-name">{{ group.fileName }}</span>
          <span class="search-file-count">{{ group.matchCount }}</span>
        </button>

        <div
          v-if="isGroupExpanded(group.filePath)"
          :id="`search-group-${groupIndex}`"
          class="search-group-matches"
        >
          <button
            v-for="match in group.matches"
            :key="match.id"
            class="search-match"
            :class="{ active: activeResultId === match.id }"
            type="button"
            :title="`${group.filePath}：第 ${match.line} 行`"
            @click="emit('select', match)"
          >
            <span class="search-line-number">{{ match.line }}</span>
            <span class="search-match-preview">
              <template v-for="(part, index) in match.parts" :key="`${match.id}-${index}`">
                <mark v-if="part.matched">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </span>
          </button>
        </div>
      </section>
    </div>

    <div v-else-if="!query" class="search-empty">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <span>输入关键词开始搜索</span>
    </div>
  </section>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";

const props = defineProps({
  query: {
    type: String,
    default: "",
  },
  groups: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  totalMatches: {
    type: Number,
    default: 0,
  },
  truncated: {
    type: Boolean,
    default: false,
  },
  activeResultId: {
    type: String,
    default: "",
  },
  matchCase: {
    type: Boolean,
    default: false,
  },
  matchWholeWord: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:query",
  "update:matchCase",
  "update:matchWholeWord",
  "select",
]);
const inputRef = ref(null);
const collapsedFilePaths = ref(new Set());

watch(
  () => props.groups,
  (nextGroups) => {
    const availablePaths = new Set(nextGroups.map((group) => group.filePath));
    collapsedFilePaths.value = new Set(
      [...collapsedFilePaths.value].filter((path) => availablePaths.has(path))
    );
  },
  { immediate: true }
);

function isGroupExpanded(filePath) {
  return !collapsedFilePaths.value.has(filePath);
}

function toggleGroup(filePath) {
  const nextPaths = new Set(collapsedFilePaths.value);
  if (nextPaths.has(filePath)) {
    nextPaths.delete(filePath);
  } else {
    nextPaths.add(filePath);
  }
  collapsedFilePaths.value = nextPaths;
}

function handleInput(event) {
  emit("update:query", event.target.value);
}

function clearSearch() {
  emit("update:query", "");
  void nextTick(() => inputRef.value?.focus({ preventScroll: true }));
}

function focusInput() {
  void nextTick(() => {
    inputRef.value?.focus({ preventScroll: true });
    inputRef.value?.select();
  });
}

defineExpose({ focusInput });
</script>

<style scoped>
.search-panel {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 10px 10px 8px;
  padding: 0 6px;
  min-height: 34px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 6px;
}

.search-input-row:focus-within {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 18%, transparent);
}

.search-input-icon,
.search-clear-button svg,
.search-file-header svg,
.search-empty svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-width: 1.7;
}

.search-input-icon {
  color: var(--text-tertiary);
}

.search-input {
  min-width: 0;
  flex: 1;
  height: 32px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.search-filter-button {
  display: grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1;
}

.search-filter-button:hover {
  background: var(--bg-toc-hover);
  color: var(--text-primary);
}

.search-filter-button.active {
  border-color: var(--accent-color);
  background: var(--bg-toc-active);
  color: var(--accent-color);
  font-weight: 700;
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-clear-button {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.search-clear-button:hover {
  background: var(--bg-toc-hover);
  color: var(--text-primary);
}

.search-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 0 12px 8px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.search-truncated {
  color: var(--accent-color);
}

.search-results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 0 12px;
}

.search-file-group {
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
}

.search-file-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 9px 12px 6px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.search-file-header:hover {
  background: var(--bg-toc-hover);
  color: var(--text-primary);
}

.search-group-chevron,
.search-file-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--text-tertiary);
}

.search-group-chevron {
  width: 12px;
  height: 16px;
  transition: transform 0.15s ease;
}

.search-group-chevron.expanded {
  transform: rotate(90deg);
}

.search-group-chevron svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.7;
}

.search-file-icon svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.5;
}

.search-file-icon {
  color: var(--text-tertiary);
}

.search-group-matches {
  min-width: 0;
}

.search-file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}

.search-file-count {
  min-width: 18px;
  margin-left: auto;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-size: 10px;
  text-align: center;
}

.search-match {
  display: grid;
  grid-template-columns: 35px minmax(0, 1fr);
  width: 100%;
  min-height: 31px;
  align-items: center;
  gap: 0;
  padding: 4px 10px 4px 0;
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.search-match:hover {
  background: var(--bg-toc-hover);
  color: var(--text-primary);
}

.search-match.active {
  border-left-color: var(--accent-color);
  background: var(--bg-toc-active);
  color: var(--text-primary);
}

.search-line-number {
  padding-right: 7px;
  color: var(--text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  text-align: right;
}

.search-match-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.search-match-preview mark {
  padding: 1px 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent-color) 25%, transparent);
  color: var(--text-primary);
  font-weight: 700;
}

.search-empty {
  display: flex;
  flex: 1;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.search-empty svg {
  width: 18px;
  height: 18px;
}
</style>
