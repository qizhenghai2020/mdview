<script setup>
import { nextTick, ref, watch } from "vue";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  initialPrompt: {
    type: String,
    default: "",
  },
  historyItems: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["confirm", "close", "delete-history"]);
const prompt = ref("");
const textareaRef = ref(null);

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return;
    }

    prompt.value = props.initialPrompt || "";
    await nextTick();
    textareaRef.value?.focus();
  }
);

function confirm() {
  emit("confirm", prompt.value.trim());
}

function selectHistory(item) {
  prompt.value = String(item?.prompt || "");
  nextTick(() => {
    textareaRef.value?.focus();
  });
}

function deleteHistory(itemId) {
  emit("delete-history", itemId);
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    emit("close");
    return;
  }

  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    confirm();
  }
}

function formatHistoryDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHistoryPreview(item) {
  const text = String(item?.prompt || "").trim();
  return text || "默认智能主题策略";
}
</script>

<template>
  <div
    v-if="props.visible"
    class="theme-prompt-backdrop"
    @mousedown.self="emit('close')"
    @keydown="handleKeydown"
  >
    <section
      class="theme-prompt-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-prompt-title"
    >
      <header class="theme-prompt-header">
        <div class="theme-prompt-icon" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path d="M12 3l1.5 4.4L17 9l-3.5 1.6L12 15l-1.5-4.4L7 9l3.5-1.6L12 3z" />
            <path d="M4 14.5l.9 2.6 2.6.9-2.6.9L4 21.5l-.9-2.6-2.6-.9 2.6-.9L4 14.5z" />
            <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
          </svg>
        </div>
        <div>
          <span class="theme-prompt-eyebrow">AI THEME</span>
          <h2 id="theme-prompt-title">想生成什么样的主题？</h2>
          <p>
            左侧可以直接复用历史需求；右侧填写这次的生成要求。可以描述界面质感、颜色、按钮/滚动条/圆角、Markdown
            表格和任务列表风格。
          </p>
        </div>
        <button class="theme-prompt-close" type="button" title="关闭" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="theme-prompt-body">
        <aside class="theme-prompt-history">
          <div class="theme-prompt-history-header">
            <strong>历史生成</strong>
            <span>{{ props.historyItems.length }} 条</span>
          </div>

          <div v-if="props.historyItems.length" class="theme-prompt-history-list">
            <button
              v-for="item in props.historyItems"
              :key="item.id"
              class="theme-history-item"
              type="button"
              @click="selectHistory(item)"
            >
              <div class="theme-history-copy">
                <strong>{{ getHistoryPreview(item) }}</strong>
                <span>{{ formatHistoryDate(item.createdAt) }}</span>
              </div>
              <span
                class="theme-history-delete"
                role="button"
                tabindex="0"
                title="删除记录"
                @click.stop="deleteHistory(item.id)"
                @keydown.enter.prevent="deleteHistory(item.id)"
                @keydown.space.prevent="deleteHistory(item.id)"
              >
                ×
              </span>
            </button>
          </div>

          <div v-else class="theme-prompt-history-empty">
            还没有历史生成记录。每次点击“开始生成”后，需求会自动保存在这里。
          </div>
        </aside>

        <div class="theme-prompt-editor">
          <label for="smart-theme-prompt">生成需求（可选）</label>
          <textarea
            id="smart-theme-prompt"
            ref="textareaRef"
            v-model="prompt"
            maxlength="800"
            rows="8"
            placeholder="例如：类似苹果系统的浅色半透明毛玻璃，全局圆角、柔和按钮、细分割线，Markdown 表格圆角卡片，任务列表像计划卡片。"
          ></textarea>
          <div class="theme-prompt-meta">
            <span>留空 = 使用默认智能主题策略</span>
            <span>{{ prompt.length }} / 800</span>
          </div>
        </div>
      </div>

      <footer class="theme-prompt-actions">
        <span class="theme-prompt-shortcut">Ctrl + Enter 开始</span>
        <button class="theme-prompt-secondary-btn" type="button" @click="emit('close')">
          取消
        </button>
        <button class="theme-prompt-primary-btn" type="button" @click="confirm">
          开始生成
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.theme-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3060;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.44);
  backdrop-filter: blur(7px);
}

.theme-prompt-modal {
  width: min(920px, 100%);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--ai-card-radius, 16px);
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 28px 82px rgba(15, 23, 42, 0.32);
}

.theme-prompt-header {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) 34px;
  gap: 14px;
  align-items: start;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border-color);
  background:
    radial-gradient(
      circle at 8% 0%,
      color-mix(in srgb, var(--accent-color) 14%, transparent),
      transparent 34%
    ),
    linear-gradient(135deg, var(--bg-toolbar), var(--bg-secondary));
}

.theme-prompt-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: var(--ai-card-radius, 15px);
  color: #fff;
  background: linear-gradient(145deg, var(--accent-color), var(--accent-hover));
  box-shadow: 0 12px 26px color-mix(in srgb, var(--accent-color) 25%, transparent);
}

.theme-prompt-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: var(--accent-color);
  font-size: 10px;
  letter-spacing: 0.15em;
}

.theme-prompt-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
}

.theme-prompt-header p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.theme-prompt-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: var(--ai-control-radius, 9px);
  background: transparent;
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.theme-prompt-close:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.theme-prompt-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 18px;
  padding: 22px 24px 18px;
}

.theme-prompt-history {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--ai-card-radius, 14px);
  background: var(--bg-toolbar);
}

.theme-prompt-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.theme-prompt-history-header strong {
  color: var(--text-primary);
  font-size: 13px;
}

.theme-prompt-history-header span,
.theme-prompt-history-empty,
.theme-history-copy span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.theme-prompt-history-list {
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-history-item {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 11px;
  border: 1px solid var(--border-color);
  border-radius: var(--ai-control-radius, 12px);
  background: var(--bg-primary);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.theme-history-item:hover {
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-primary));
}

.theme-history-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.theme-history-copy strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: normal;
  word-break: break-word;
}

.theme-history-delete {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: grid;
  place-items: center;
  border-radius: var(--ai-control-radius, 8px);
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
}

.theme-history-delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.theme-prompt-history-empty {
  padding: 14px;
  line-height: 1.7;
}

.theme-prompt-editor {
  min-width: 0;
}

.theme-prompt-editor label {
  display: block;
  margin-bottom: 9px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.theme-prompt-editor textarea {
  width: 100%;
  min-height: 142px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: var(--ai-control-radius, 12px);
  padding: 13px 14px;
  outline: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.theme-prompt-editor textarea:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.theme-prompt-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.theme-prompt-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-toolbar);
}

.theme-prompt-shortcut {
  margin-right: auto;
  color: var(--text-tertiary);
  font-size: 11px;
}

.theme-prompt-primary-btn,
.theme-prompt-secondary-btn {
  height: 38px;
  border-radius: var(--ai-control-radius, 7px);
  padding: 0 15px;
  font-size: 13px;
  cursor: pointer;
}

.theme-prompt-primary-btn {
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: #fff;
}

.theme-prompt-secondary-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}

@media (max-width: 820px) {
  .theme-prompt-body {
    grid-template-columns: 1fr;
  }

  .theme-prompt-history-list {
    max-height: 180px;
  }
}

@media (max-width: 560px) {
  .theme-prompt-header {
    grid-template-columns: 40px minmax(0, 1fr) 32px;
    padding: 20px 18px 16px;
  }

  .theme-prompt-icon {
    width: 40px;
    height: 40px;
  }

  .theme-prompt-body {
    padding: 18px;
  }

  .theme-prompt-actions {
    flex-wrap: wrap;
  }

  .theme-prompt-shortcut {
    width: 100%;
  }
}
</style>
