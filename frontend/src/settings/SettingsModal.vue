<script setup>
import { computed, ref, watch } from "vue";
import { buildModelTestFingerprint, createModel, createRequestHeader } from "./constants";

const settings = defineModel("settings", { required: true });

const props = defineProps({
  testModel: {
    type: Function,
    default: null,
  },
  initialSection: {
    type: String,
    default: "general",
  },
});

const emit = defineEmits(["close"]);

const SETTINGS_SECTIONS = new Set(["general", "models"]);

function normalizeSection(section) {
  return SETTINGS_SECTIONS.has(section) ? section : "general";
}

const activeSection = ref(normalizeSection(props.initialSection));
const selectedModelId = ref(settings.value.models[0]?.id || "");
const testingModelId = ref("");

const persistenceOptions = [
  { key: "theme", label: "主题" },
  { key: "zoom", label: "右上角缩放" },
  { key: "viewMode", label: "预览 / 编辑 / 分栏模式" },
  { key: "tocWidth", label: "左侧目录宽度" },
  { key: "splitWidth", label: "分栏编辑宽度" },
];

const selectedModel = computed(() => {
  return (
    settings.value.models.find((model) => model.id === selectedModelId.value) || null
  );
});

const selectedModelStatus = computed(() => {
  if (!selectedModel.value) {
    return { label: "未选择", tone: "untested" };
  }

  if (selectedModel.value.verified && selectedModel.value.testStatus === "passed") {
    return { label: "测试通过", tone: "passed" };
  }

  if (selectedModel.value.testStatus === "failed") {
    return { label: "测试失败", tone: "failed" };
  }

  return { label: "待测试", tone: "untested" };
});

function selectModel(modelId) {
  selectedModelId.value = modelId;
}

function canEnableModel(model) {
  return Boolean(model?.verified && model?.testStatus === "passed");
}

function resetActiveModelIfNeeded(model) {
  if (settings.value.activeModelId === model?.id) {
    settings.value.activeModelId = "";
  }
}

function invalidateModelTest(model, message = "配置已修改，请重新测试") {
  if (!model) {
    return;
  }

  model.verified = false;
  model.enabled = false;
  model.testStatus = "untested";
  model.testMessage = message;
  model.testedAt = "";
  model.testedFingerprint = "";
  resetActiveModelIfNeeded(model);
}

function addModel() {
  const model = createModel();
  settings.value.models.push(model);
  selectedModelId.value = model.id;
}

function removeModel(modelId) {
  const index = settings.value.models.findIndex((model) => model.id === modelId);
  if (index < 0) {
    return;
  }

  const removed = settings.value.models[index];
  settings.value.models.splice(index, 1);
  resetActiveModelIfNeeded(removed);

  if (!settings.value.activeModelId) {
    settings.value.activeModelId =
      settings.value.models.find((model) => model.enabled && model.verified)?.id || "";
  }

  selectedModelId.value =
    settings.value.models[Math.min(index, settings.value.models.length - 1)]?.id || "";
}

function addRequestHeader(model) {
  if (!Array.isArray(model.headers)) {
    model.headers = [];
  }
  model.headers.push(createRequestHeader());
}

function removeRequestHeader(model, headerId) {
  if (!Array.isArray(model?.headers)) {
    return;
  }
  const index = model.headers.findIndex((header) => header.id === headerId);
  if (index >= 0) {
    model.headers.splice(index, 1);
  }
}

function setActiveModel(model) {
  if (!canEnableModel(model) || !model.enabled) {
    return;
  }

  settings.value.activeModelId = model.id;
}

function updateModelEnabled(model, checked) {
  if (!model) {
    return;
  }

  if (checked && !canEnableModel(model)) {
    model.enabled = false;
    return;
  }

  model.enabled = checked;
  if (!checked) {
    resetActiveModelIfNeeded(model);
  }
}

function formatTestedAt(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function runModelTest(model) {
  if (!model) {
    return;
  }

  if (!props.testModel) {
    model.verified = false;
    model.enabled = false;
    model.testStatus = "failed";
    model.testMessage = "当前环境不支持模型测试，请在桌面应用中使用。";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model);
    resetActiveModelIfNeeded(model);
    return;
  }

  if (!String(model.baseUrl || "").trim() || !String(model.model || "").trim()) {
    model.verified = false;
    model.enabled = false;
    model.testStatus = "failed";
    model.testMessage = "请至少填写接口地址和模型名称，再进行测试。";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model);
    resetActiveModelIfNeeded(model);
    return;
  }

  testingModelId.value = model.id;

  try {
    const responseText = await props.testModel({
      name: model.name,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.model,
      timeout: model.timeout,
      formatTimeout: model.formatTimeout,
      headers: model.headers,
    });

    model.verified = true;
    model.enabled = true;
    model.testStatus = "passed";
    model.testMessage = responseText
      ? `测试通过：${String(responseText).slice(0, 80)}`
      : "测试通过，可以启用";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model);

    if (!settings.value.activeModelId) {
      settings.value.activeModelId = model.id;
    }
  } catch (error) {
    model.verified = false;
    model.enabled = false;
    model.testStatus = "failed";
    model.testMessage = error?.message || String(error) || "模型测试失败";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model);
    resetActiveModelIfNeeded(model);
  } finally {
    testingModelId.value = "";
  }
}

watch(
  () => props.initialSection,
  (section) => {
    activeSection.value = normalizeSection(section);
  },
  { immediate: true }
);

watch(
  () => settings.value.models.map((model) => model.id),
  (modelIds) => {
    if (!modelIds.includes(selectedModelId.value)) {
      selectedModelId.value = modelIds[0] || "";
    }
  },
  { immediate: true }
);

const lastKnownFingerprints = new Map();

watch(
  () =>
    settings.value.models.map((model) => ({
      id: model.id,
      fingerprint: buildModelTestFingerprint(model),
    })),
  (entries) => {
    const nextFingerprints = new Map();

    entries.forEach(({ id, fingerprint }) => {
      nextFingerprints.set(id, fingerprint);
      const previousFingerprint = lastKnownFingerprints.get(id);

      if (previousFingerprint !== undefined && previousFingerprint !== fingerprint) {
        const target = settings.value.models.find((model) => model.id === id);
        invalidateModelTest(target);
      }
    });

    lastKnownFingerprints.clear();
    nextFingerprints.forEach((fingerprint, id) => {
      lastKnownFingerprints.set(id, fingerprint);
    });
  },
  { immediate: true }
);

function close() {
  emit("close");
}
</script>

<template>
  <div class="settings-backdrop" @mousedown.self="close">
    <section class="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
      <header class="settings-header">
        <div>
          <h2>设置</h2>
        </div>
        <button class="settings-close" type="button" title="关闭设置" @click="close">
          ×
        </button>
      </header>

      <div class="settings-body">
        <nav class="settings-nav" aria-label="设置分类">
          <button
            class="settings-nav-item"
            :class="{ active: activeSection === 'general' }"
            type="button"
            @click="activeSection = 'general'"
          >
            <span class="settings-nav-icon">◌</span>
            常规配置
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSection === 'models' }"
            type="button"
            @click="activeSection = 'models'"
          >
            <span class="settings-nav-icon">◇</span>
            模型配置
          </button>
        </nav>

        <div class="settings-content">
          <template v-if="activeSection === 'general'">
            <div class="settings-section-heading">
              <div>
                <h3>常规配置</h3>
                <p>持久化配置信息</p>
              </div>
            </div>

            <div class="persistence-card">
              <div
                v-for="option in persistenceOptions"
                :key="option.key"
                class="persistence-row"
              >
                <div>
                  <strong>{{ option.label }}</strong>
                  <span>是否在刷新或重新打开程序后恢复</span>
                </div>
                <label class="switch">
                  <input v-model="settings.persistence[option.key]" type="checkbox" />
                  <span class="switch-track"></span>
                </label>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="settings-section-heading">
              <div>
                <h3>模型配置</h3>
                <p>支持 OpenAI 兼容的 Chat Completions 接口，测试通过后才能启用。</p>
              </div>
              <button class="settings-primary-btn" type="button" @click="addModel">
                + 添加模型
              </button>
            </div>

            <div class="model-manager">
              <aside class="model-list">
                <div v-if="settings.models.length === 0" class="model-empty">
                  <span>还没有模型</span>
                  <button class="settings-link-btn" type="button" @click="addModel">
                    添加第一个模型
                  </button>
                </div>
                <button
                  v-for="model in settings.models"
                  :key="model.id"
                  class="model-list-item"
                  :class="{ active: selectedModelId === model.id }"
                  type="button"
                  @click="selectModel(model.id)"
                >
                  <span class="model-list-main">
                    <strong>{{ model.name || "未命名模型" }}</strong>
                    <small>{{ model.model || "未填写模型名" }}</small>
                  </span>
                  <span class="model-list-state">
                    <span
                      class="model-status-dot"
                      :class="{
                        enabled: model.enabled,
                        current: settings.activeModelId === model.id,
                        passed: model.verified,
                        failed: model.testStatus === 'failed',
                      }"
                    ></span>
                    <small>
                      {{
                        settings.activeModelId === model.id
                          ? "当前"
                          : model.verified
                          ? "已测"
                          : model.testStatus === "failed"
                          ? "失败"
                          : "待测"
                      }}
                    </small>
                  </span>
                </button>
              </aside>

              <div v-if="selectedModel" class="model-form">
                <div class="model-form-header">
                  <div style="display: flex; align-items: center;">
                    <h4>{{ selectedModel.name || "未命名模型" }}</h4>
                    <div
                      class="test-status-pill"
                      :class="`is-${selectedModelStatus.tone}`"
                    >
                      {{ selectedModelStatus.label }}
                    </div>
                  </div>
                  <div class="model-form-actions">
                    <button
                      class="settings-secondary-btn"
                      type="button"
                      :disabled="testingModelId === selectedModel.id"
                      @click="runModelTest(selectedModel)"
                    >
                      {{ testingModelId === selectedModel.id ? "测试中..." : "测试模型" }}
                    </button>
                    <button
                      class="settings-secondary-btn"
                      type="button"
                      :disabled="
                        settings.activeModelId === selectedModel.id ||
                        !selectedModel.enabled
                      "
                      @click="setActiveModel(selectedModel)"
                    >
                      {{
                        settings.activeModelId === selectedModel.id
                          ? "当前模型"
                          : "设为当前"
                      }}
                    </button>
                    <button
                      class="settings-danger-btn"
                      type="button"
                      @click="removeModel(selectedModel.id)"
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div class="model-form-grid">
                  <label class="settings-field settings-field-wide">
                    <span>显示名称</span>
                    <input
                      v-model="selectedModel.name"
                      type="text"
                      placeholder="例如：公司模型"
                    />
                  </label>
                  <label class="settings-field settings-field-wide">
                    <span>接口地址</span>
                    <input
                      v-model="selectedModel.baseUrl"
                      type="url"
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>
                  <label class="settings-field settings-field-wide">
                    <span>API Key</span>
                    <input
                      v-model="selectedModel.apiKey"
                      type="password"
                      placeholder="仅保存在本机"
                    />
                  </label>
                  <label class="settings-field">
                    <span>模型名称</span>
                    <input
                      v-model="selectedModel.model"
                      type="text"
                      placeholder="例如：gpt-4o-mini"
                    />
                  </label>
                  <label class="settings-field">
                    <span>测试超时（秒）</span>
                    <input
                      v-model.number="selectedModel.timeout"
                      type="number"
                      min="5"
                      max="300"
                    />
                  </label>
                  <label class="settings-field">
                    <span>智能排版超时（秒）</span>
                    <input
                      v-model.number="selectedModel.formatTimeout"
                      type="number"
                      min="30"
                      max="1800"
                    />
                  </label>
                </div>

                <section class="custom-headers-section">
                  <div class="custom-headers-heading">
                    <div>
                      <strong>自定义请求头</strong>
                    </div>
                    <button
                      class="settings-secondary-btn"
                      type="button"
                      @click="addRequestHeader(selectedModel)"
                    >
                      + 添加请求头
                    </button>
                  </div>

                  <div v-if="selectedModel.headers?.length" class="custom-header-list">
                    <div
                      v-for="header in selectedModel.headers"
                      :key="header.id"
                      class="custom-header-row"
                    >
                      <label class="header-enabled" title="是否发送此请求头">
                        <input v-model="header.enabled" type="checkbox" />
                      </label>
                      <input
                        v-model="header.name"
                        type="text"
                        placeholder="请求头名称，如 X-API-Key"
                        aria-label="请求头名称"
                      />
                      <input
                        v-model="header.value"
                        type="password"
                        placeholder="请求头值（仅保存在本机）"
                        aria-label="请求头值"
                      />
                      <button
                        class="custom-header-remove"
                        type="button"
                        title="删除请求头"
                        @click="removeRequestHeader(selectedModel, header.id)"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </section>

                <!-- <div class="model-test-summary" :class="`is-${selectedModelStatus.tone}`">
                  <strong>{{ selectedModelStatus.label }}</strong>
                  <span>
                    {{
                      selectedModel.testMessage ||
                      "测试通过后，才能启用并参与智能排版。"
                    }}
                  </span>
                  <small v-if="selectedModel.testedAt">
                    最近测试：{{ formatTestedAt(selectedModel.testedAt) }}
                  </small>
                </div> -->

                <label class="model-enabled-row">
                  <span>
                    <strong>启用此模型</strong>
                    <small>必须先测试通过，才能启用并参与智能排版。</small>
                  </span>
                  <span class="switch">
                    <input
                      :checked="selectedModel.enabled"
                      :disabled="!canEnableModel(selectedModel) && !selectedModel.enabled"
                      type="checkbox"
                      @change="updateModelEnabled(selectedModel, $event.target.checked)"
                    />
                    <span class="switch-track"></span>
                  </span>
                </label>
              </div>

              <div v-else class="model-form model-form-empty">
                <span class="model-empty-mark">◇</span>
                <h4>选择或添加一个模型</h4>
                <p>测试通过的模型才会出现在智能排版的可用列表里。</p>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(7px);
}

.settings-modal {
  width: min(1200px, 100%);
  max-height: min(870px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(135deg, var(--bg-toolbar), var(--bg-secondary));
}

.settings-header h2,
.settings-section-heading h3,
.model-form h4 {
  margin: 0;
  color: var(--text-primary);
}

.settings-header p,
.settings-section-heading p,
.model-form-empty p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.settings-close {
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

.settings-close:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.settings-body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.settings-nav {
  width: 190px;
  flex-shrink: 0;
  padding: 18px 12px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}

.settings-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}

.settings-nav-item + .settings-nav-item {
  margin-top: 5px;
}

.settings-nav-item:hover,
.settings-nav-item.active {
  background: var(--btn-active);
  color: var(--accent-color);
}

.settings-nav-icon {
  width: 19px;
  color: currentColor;
  font-size: 18px;
  text-align: center;
}

.settings-content {
  min-width: 0;
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.settings-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.persistence-card {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-toolbar);
}

.persistence-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
}

.persistence-row + .persistence-row {
  border-top: 1px solid var(--border-color);
}

.persistence-row strong,
.persistence-row span,
.model-enabled-row strong,
.model-enabled-row small {
  display: block;
}

.persistence-row span,
.model-enabled-row small {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
  display: inline-block;
}

.switch input {
  position: absolute;
  opacity: 0;
}

.switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--border-color);
  cursor: pointer;
  transition: background 0.18s ease;
}

.switch-track::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2);
  transition: transform 0.18s ease;
}

.switch input:checked + .switch-track {
  background: var(--accent-color);
}

.switch input:checked + .switch-track::after {
  transform: translateX(18px);
}

.settings-primary-btn,
.settings-secondary-btn,
.settings-danger-btn,
.settings-link-btn {
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}

.settings-primary-btn {
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: #fff;
}

.settings-secondary-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-toolbar);
  color: var(--text-primary);
}

.settings-danger-btn {
  border: 1px solid color-mix(in srgb, #ef4444 55%, var(--border-color));
  background: transparent;
  color: #dc2626;
}

.settings-link-btn {
  border: 0;
  background: transparent;
  color: var(--accent-color);
}

.settings-secondary-btn:disabled,
.settings-primary-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.model-manager {
  min-height: 400px;
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-toolbar);
}

.model-list {
  min-width: 0;
  padding: 10px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.model-list-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 11px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.model-list-item + .model-list-item {
  margin-top: 5px;
}

.model-list-item:hover,
.model-list-item.active {
  border-color: color-mix(in srgb, var(--accent-color) 35%, var(--border-color));
  background: var(--btn-active);
}

.model-list-main {
  min-width: 0;
}

.model-list-main strong,
.model-list-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-list-main small {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 11px;
}

.model-list-state {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.model-list-state small {
  color: var(--text-secondary);
  font-size: 11px;
}

.model-status-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--border-color);
}

.model-status-dot.enabled,
.model-status-dot.passed {
  background: #10b981;
}

.model-status-dot.failed {
  background: #ef4444;
}

.model-status-dot.current {
  background: var(--accent-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-color) 15%, transparent);
}

.model-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 12px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

.model-form {
  min-width: 0;
  padding: 22px;
}

.model-form-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-color);
}

.model-form-actions {
  display: flex;
  gap: 8px;
}

.eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--accent-color);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.test-status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 10px;
}

.test-status-pill.is-passed {
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
}

.test-status-pill.is-failed {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.12);
}

.test-status-pill.is-untested {
  color: #92400e;
  background: rgba(245, 158, 11, 0.14);
}

.model-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
  padding: 20px 0;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
}

.settings-field-wide {
  grid-column: 1 / -1;
}

.settings-field input {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.settings-field input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.custom-headers-section {
  padding: 10px 0;
  border-top: 1px solid var(--border-color);
}

.custom-headers-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.custom-headers-heading div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.custom-headers-heading strong {
  color: var(--text-primary);
  font-size: 13px;
}

.custom-headers-heading small,
.custom-headers-empty {
  color: var(--text-secondary);
  font-size: 11px;
}

.custom-header-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 14px;
}

.custom-header-row {
  display: grid;
  grid-template-columns: 24px minmax(140px, 0.8fr) minmax(180px, 1.2fr) 32px;
  align-items: center;
  gap: 8px;
}

.custom-header-row > input {
  min-width: 0;
  height: 36px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.custom-header-row > input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.header-enabled {
  display: grid;
  place-items: center;
}

.custom-header-remove {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
}

.custom-header-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.custom-headers-empty {
  margin: 12px 0 0;
}

.model-test-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 15px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
}

.model-test-summary strong {
  font-size: 12px;
}

.model-test-summary span,
.model-test-summary small {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.model-test-summary.is-passed {
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.08);
}

.model-test-summary.is-failed {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(239, 68, 68, 0.06);
}

.model-test-summary.is-untested {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.06);
}

.model-enabled-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid var(--border-color);
  margin-top: 18px;
}

.model-form-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  text-align: center;
}

.model-empty-mark {
  color: var(--accent-color);
  font-size: 42px;
}

@media (max-width: 760px) {
  .settings-backdrop {
    align-items: flex-start;
    padding: 12px;
  }

  .settings-body {
    display: block;
    overflow: auto;
  }

  .settings-nav {
    width: auto;
    display: flex;
    gap: 6px;
    padding: 10px;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .settings-nav-item {
    width: auto;
  }

  .model-manager {
    grid-template-columns: 1fr;
  }

  .model-list {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .model-form-header {
    flex-direction: column;
  }

  .model-form-actions {
    flex-wrap: wrap;
  }

  .model-form-grid {
    grid-template-columns: 1fr;
  }

  .custom-headers-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .custom-header-row {
    grid-template-columns: 24px minmax(0, 1fr) 32px;
  }

  .custom-header-row > input:nth-of-type(2) {
    grid-column: 2 / 3;
  }
}
</style>
