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
});

const emit = defineEmits(["confirm", "close"]);
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
          <p>可以写界面质感、颜色、按钮/滚动条/圆角、Markdown 表格和任务列表风格；不填写时会自动生成一套完整主题。</p>
        </div>
        <button class="theme-prompt-close" type="button" title="关闭" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="theme-prompt-body">
        <label for="smart-theme-prompt">生成需求（可选）</label>
        <textarea
          id="smart-theme-prompt"
          ref="textareaRef"
          v-model="prompt"
          maxlength="800"
          rows="6"
          placeholder="例如：类似苹果系统的浅色半透明毛玻璃，全局圆角、柔和按钮、细分割线，Markdown 表格圆角卡片，任务列表像计划卡片。"
        ></textarea>
        <div class="theme-prompt-meta">
          <span>留空 = 使用默认智能主题策略</span>
          <span>{{ prompt.length }} / 800</span>
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
  width: min(640px, 100%);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 16px;
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
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--accent-color) 14%, transparent), transparent 34%),
    linear-gradient(135deg, var(--bg-toolbar), var(--bg-secondary));
}

.theme-prompt-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 15px;
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
  border-radius: 9px;
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
  padding: 22px 24px 18px;
}

.theme-prompt-body label {
  display: block;
  margin-bottom: 9px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.theme-prompt-body textarea {
  width: 100%;
  min-height: 142px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 13px 14px;
  outline: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.theme-prompt-body textarea:focus {
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
  border-radius: 7px;
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
