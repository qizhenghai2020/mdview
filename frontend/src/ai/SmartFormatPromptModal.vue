<script setup>
import { nextTick, ref, watch } from "vue";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  initialInstruction: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["confirm", "close"]);
const instruction = ref("");
const textareaRef = ref(null);

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return;
    }

    instruction.value = props.initialInstruction || "";
    await nextTick();
    textareaRef.value?.focus();
  }
);

function confirm() {
  emit("confirm", instruction.value.trim());
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
    class="format-prompt-backdrop"
    @mousedown.self="emit('close')"
    @keydown="handleKeydown"
  >
    <section class="format-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="format-prompt-title">
      <header class="format-prompt-header">
        <div class="prompt-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z" />
            <path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17z" />
          </svg>
        </div>
        <div>
          <span class="eyebrow">SMART FORMAT</span>
          <h2 id="format-prompt-title">这次希望怎样排版？</h2>
          <p>可以补充侧重点；不填写时使用默认规则。AI 只调整 Markdown 结构，不会改动正文内容。</p>
        </div>
        <button class="prompt-close" type="button" title="关闭" @click="emit('close')">×</button>
      </header>

      <div class="format-prompt-body">
        <label for="smart-format-instruction">排版要求（可选）</label>
        <textarea
          id="smart-format-instruction"
          ref="textareaRef"
          v-model="instruction"
          maxlength="1000"
          rows="6"
          placeholder="例如：任务清单优先突出；层级不要超过三级；表格保持紧凑。"
        ></textarea>
        <div class="prompt-meta">
          <span>留空 = 使用专业 Markdown 默认排版</span>
          <span>{{ instruction.length }} / 1000</span>
        </div>
      </div>

      <footer class="format-prompt-actions">
        <span class="shortcut-hint">Ctrl + Enter 开始</span>
        <button class="prompt-secondary-btn" type="button" @click="emit('close')">取消</button>
        <button class="prompt-primary-btn" type="button" @click="confirm">开始智能排版</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.format-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3040;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.44);
  backdrop-filter: blur(7px);
}

.format-prompt-modal {
  width: min(620px, 100%);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.3);
}

.format-prompt-header {
  position: relative;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 34px;
  gap: 14px;
  align-items: start;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(135deg, var(--bg-toolbar), var(--bg-secondary));
}

.prompt-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(145deg, var(--accent-color), #0f766e);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-color) 24%, transparent);
}

.eyebrow {
  display: block;
  margin-bottom: 5px;
  color: var(--accent-color);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.format-prompt-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
}

.format-prompt-header p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.prompt-close {
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

.format-prompt-body {
  padding: 22px 24px 18px;
}

.format-prompt-body label {
  display: block;
  margin-bottom: 9px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.format-prompt-body textarea {
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

.format-prompt-body textarea:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.prompt-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.format-prompt-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-toolbar);
}

.shortcut-hint {
  margin-right: auto;
  color: var(--text-tertiary);
  font-size: 11px;
}

.prompt-primary-btn,
.prompt-secondary-btn {
  height: 38px;
  border-radius: 5px;
  padding: 0 15px;
  font-size: 13px;
  cursor: pointer;
}

.prompt-primary-btn {
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: #fff;
}

.prompt-secondary-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}

@media (max-width: 560px) {
  .format-prompt-header {
    grid-template-columns: 40px minmax(0, 1fr) 32px;
    padding: 20px 18px 16px;
  }

  .prompt-icon {
    width: 40px;
    height: 40px;
  }

  .format-prompt-body {
    padding: 18px;
  }

  .shortcut-hint {
    display: none;
  }
}
</style>
