<template>
  <div
    v-if="props.visible"
    class="format-failure-backdrop"
    @mousedown.self="emit('close')"
  >
    <section class="format-failure-modal" role="dialog" aria-modal="true">
      <div class="format-failure-icon">!</div>
      <div class="format-failure-copy">
        <span class="eyebrow">AI FORMAT</span>
        <h2>AI排版没有完成</h2>
        <p>{{ props.message || "当前模型返回的内容未通过安全校验，原文没有被修改。" }}</p>
      </div>

      <div v-if="props.detail" class="format-detail-panel">
        <span class="format-detail-label">详细信息</span>
        <pre>{{ props.detail }}</pre>
      </div>

      <div v-if="props.progressSteps.length" class="format-progress-panel">
        <span class="format-detail-label">最近进度</span>
        <div class="format-progress-list">
          <div
            v-for="item in props.progressSteps"
            :key="item.id"
            class="format-progress-item"
          >
            <span class="format-progress-time">{{ item.time }}</span>
            <span class="format-progress-text">{{ item.text }}</span>
          </div>
        </div>
      </div>

      <label class="format-model-field">
        <span>换一个已启用模型重试</span>
        <select
          :value="props.modelId"
          @change="emit('update:modelId', $event.target.value)"
        >
          <option v-if="props.models.length === 0" value="">暂无已启用模型</option>
          <option v-for="model in props.models" :key="model.id" :value="model.id">
            {{ getAIModelDisplayName(model) }}
          </option>
        </select>
      </label>

      <div class="format-failure-actions">
        <button class="format-secondary-btn" type="button" @click="emit('open-settings')">
          管理模型
        </button>
        <button
          class="format-primary-btn"
          type="button"
          :disabled="!props.modelId"
          @click="emit('retry')"
        >
          重试
        </button>
        <button class="format-text-btn" type="button" @click="emit('close')">取消</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { getAIModelDisplayName } from "@/shared/ai/model";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    default: "",
  },
  detail: {
    type: String,
    default: "",
  },
  models: {
    type: Array,
    default: () => [],
  },
  modelId: {
    type: String,
    default: "",
  },
  progressSteps: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:modelId", "retry", "close", "open-settings"]);
</script>

<style scoped>
.format-failure-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(6px);
}

.format-failure-modal {
  width: min(800px, calc(100vw - 32px));
  padding: 25px;
  border: 1px solid var(--border-color);
  border-radius: 17px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
}

.format-failure-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #b45309;
  font-weight: 800;
}

.format-failure-copy {
  margin-top: 16px;
}

.eyebrow {
  color: var(--accent-color);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.format-failure-copy h2 {
  margin: 7px 0 0;
  font-size: 20px;
}

.format-failure-copy p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.format-model-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 12px;
}

.format-model-field select {
  height: 37px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  background: var(--bg-toolbar);
  color: var(--text-primary);
}

.format-detail-panel,
.format-progress-panel {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.format-detail-label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.format-detail-panel pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  font-family: Consolas, "SFMono-Regular", monospace;
}

.format-progress-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.format-progress-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.format-progress-time {
  flex: 0 0 auto;
  min-width: 56px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.format-progress-text {
  flex: 1;
}

.format-failure-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.format-primary-btn,
.format-secondary-btn,
.format-text-btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.format-primary-btn {
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: #fff;
}

.format-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.format-secondary-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-toolbar);
  color: var(--text-primary);
}

.format-text-btn {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
}
</style>
