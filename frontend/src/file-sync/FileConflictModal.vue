<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  fileName: { type: String, default: "当前文档" },
  resolving: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "use-current", "use-external"]);
</script>

<template>
  <div v-if="visible" class="conflict-backdrop" @mousedown.self="emit('close')">
    <section
      class="conflict-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="file-conflict-title"
      aria-describedby="file-conflict-description"
    >
      <div class="conflict-mark" aria-hidden="true">!</div>
      <div class="conflict-content">
        <span class="conflict-eyebrow">FILE CONFLICT</span>
        <h2 id="file-conflict-title">检测到两处编辑</h2>
        <p id="file-conflict-description">
          {{ fileName }} 在本软件中有未保存修改，同时磁盘文件也被其他程序修改。请选择要保留的版本。
        </p>

        <div class="conflict-options">
          <button
            class="conflict-option is-current"
            type="button"
            :disabled="resolving"
            @click="emit('use-current')"
          >
            <strong>以当前文档为准</strong>
            <span>保留本软件中的编辑，并覆盖磁盘上的外部版本。</span>
          </button>
          <button
            class="conflict-option"
            type="button"
            :disabled="resolving"
            @click="emit('use-external')"
          >
            <strong>以外部变更为准</strong>
            <span>加载磁盘上的最新内容，放弃本软件中尚未保存的编辑。</span>
          </button>
        </div>

        <div class="conflict-footer">
          <span v-if="resolving" class="conflict-progress">正在处理版本...</span>
          <button type="button" :disabled="resolving" @click="emit('close')">暂不处理</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.conflict-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px);
}

.conflict-modal {
  width: min(620px, 100%);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  padding: 24px;
  border: 1px solid color-mix(in srgb, #f59e0b 38%, var(--border-color));
  border-radius: 18px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.32);
}

.conflict-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
  font-size: 22px;
  font-weight: 800;
}

.conflict-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: #d97706;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.conflict-content h2 {
  margin: 0;
  font-size: 21px;
}

.conflict-content > p {
  margin: 9px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.conflict-options {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}

.conflict-option {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 11px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.conflict-option:hover:not(:disabled) {
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 8%, var(--bg-secondary));
  transform: translateY(-1px);
}

.conflict-option.is-current {
  border-color: color-mix(in srgb, var(--accent-color) 45%, var(--border-color));
}

.conflict-option strong {
  font-size: 13px;
}

.conflict-option span {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.conflict-option:disabled {
  opacity: 0.58;
  cursor: wait;
}

.conflict-footer {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 18px;
}

.conflict-footer button {
  padding: 7px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.conflict-footer button:hover:not(:disabled) {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.conflict-progress {
  margin-right: auto;
  color: var(--accent-color);
  font-size: 12px;
}

@media (max-width: 560px) {
  .conflict-modal {
    grid-template-columns: 1fr;
  }
}
</style>
