<template>
  <aside class="style-config-panel">
    <div class="panel-header">
      <h2>样式配置</h2>
      <div class="panel-actions">
        <button
          v-if="showReset"
          class="icon-btn"
          type="button"
          title="恢复插件默认值"
          @click="emit('reset')"
        >
          ↺
        </button>
        <button class="icon-btn" type="button" title="收起面板" @click="closePanel">
          ✕
        </button>
      </div>
    </div>

    <div class="panel-scroll">
      <section class="control-section">
        <button class="section-toggle" type="button" @click="toggleSection('theme')">
          <span>版式</span>
          <span>{{ panelState.sections.theme ? "▾" : "▸" }}</span>
        </button>

        <template v-if="panelState.sections.theme">
          <div class="section-body">
            <div v-for="control in layoutControls" :key="control.key" class="slider-item">
              <div class="slider-header">
                <span>{{ control.label }}</span>
                <div class="slider-meta">
                  <button
                    v-if="styleConfig[control.key] !== null"
                    class="inline-reset-btn"
                    type="button"
                    @click="clearNumericValue(control.key)"
                  >
                    跟随主题
                  </button>
                  <span class="slider-value">
                    {{ effectiveMetrics[control.key] }}{{ control.unit }}
                  </span>
                </div>
              </div>
              <input
                class="app-slider"
                type="range"
                :min="control.min"
                :max="control.max"
                :step="control.step"
                :value="effectiveMetrics[control.key]"
                @input="updateNumericValue(control.key, $event.target.value)"
              />
            </div>
          </div>

          <div class="section-body">
            <div
              v-for="control in spacingControls"
              :key="control.key"
              class="slider-item"
            >
              <div class="slider-header">
                <span>{{ control.label }}</span>
                <div class="slider-meta">
                  <button
                    v-if="styleConfig[control.key] !== null"
                    class="inline-reset-btn"
                    type="button"
                    @click="clearNumericValue(control.key)"
                  >
                    跟随主题
                  </button>
                  <span class="slider-value">
                    {{ effectiveMetrics[control.key] }}{{ control.unit }}
                  </span>
                </div>
              </div>
              <input
                class="app-slider"
                type="range"
                :min="control.min"
                :max="control.max"
                :step="control.step"
                :value="effectiveMetrics[control.key]"
                @input="updateNumericValue(control.key, $event.target.value)"
              />
            </div>
          </div>

          <div class="section-body">
            <label class="toggle-row">
              <span>
                <strong>主题圆角[全局]</strong>
                <small>开启时使用当前主题默认圆角，关闭后全部圆角统一为 0px</small>
              </span>
              <span class="switch">
                <input
                  type="checkbox"
                  :checked="styleConfig.themeRoundedCorners"
                  @change="
                    updateBooleanValue('themeRoundedCorners', $event.target.checked)
                  "
                />
                <span class="switch-track"></span>
              </span>
            </label>

            <label class="toggle-row">
              <span>
                <strong>表格表头对齐[预览模式]</strong>
                <small>控制未单独指定列对齐时的表头默认对齐方式</small>
              </span>
              <select
                class="app-select compact-select"
                :value="styleConfig.tableHeaderAlign"
                @change="updateStringValue('tableHeaderAlign', $event.target.value)"
              >
                <option
                  v-for="option in tableHeaderAlignOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="toggle-row">
              <span>
                <strong>表格宽度填满容器[预览模式]</strong>
                <small>关闭时按内容宽度常规显示，可横向滚动</small>
              </span>
              <span class="switch">
                <input
                  type="checkbox"
                  :checked="styleConfig.tableFullWidth"
                  @change="updateBooleanValue('tableFullWidth', $event.target.checked)"
                />
                <span class="switch-track"></span>
              </span>
            </label>
          </div>
        </template>
      </section>

      <section class="control-section">
        <button class="section-toggle" type="button" @click="toggleSection('sizes')">
          <span>标题字号</span>
          <span>{{ panelState.sections.sizes ? "▾" : "▸" }}</span>
        </button>
        <div v-if="panelState.sections.sizes" class="section-body">
          <div v-for="control in sizeControls" :key="control.key" class="slider-item">
            <div class="slider-header">
              <span>{{ control.label }}</span>
              <div class="slider-meta">
                <button
                  v-if="styleConfig[control.key] !== null"
                  class="inline-reset-btn"
                  type="button"
                  @click="clearNumericValue(control.key)"
                >
                  跟随主题
                </button>
                <span class="slider-value">
                  {{ effectiveMetrics[control.key] }}{{ control.unit }}
                </span>
              </div>
            </div>
            <input
              class="app-slider"
              type="range"
              :min="control.min"
              :max="control.max"
              :step="control.step"
              :value="effectiveMetrics[control.key]"
              @input="updateNumericValue(control.key, $event.target.value)"
            />
          </div>
        </div>
      </section>

      <section class="control-section">
        <button class="section-toggle" type="button" @click="toggleSection('presets')">
          <span>配色预设</span>
          <span>{{ panelState.sections.presets ? "▾" : "▸" }}</span>
        </button>
        <div v-if="panelState.sections.presets" class="section-body presets-grid">
          <button
            v-for="preset in COLOR_PRESETS"
            :key="preset.name"
            class="preset-btn"
            type="button"
            :title="preset.name"
            @click="applyPreset(preset)"
          >
            <span class="preset-name">{{ preset.name }}</span>
            <span class="preset-dots">
              <span
                class="preset-dot"
                :style="{ backgroundColor: preset.colors.h1 }"
              ></span>
              <span
                class="preset-dot"
                :style="{ backgroundColor: preset.colors.h2 }"
              ></span>
              <span
                class="preset-dot"
                :style="{ backgroundColor: preset.colors.h3 }"
              ></span>
              <span
                class="preset-dot"
                :style="{ backgroundColor: preset.colors.p }"
              ></span>
            </span>
          </button>
        </div>
      </section>

      <section class="control-section">
        <button class="section-toggle" type="button" @click="toggleSection('overrides')">
          <span>自定义</span>
          <span>{{ panelState.sections.overrides ? "▾" : "▸" }}</span>
        </button>
        <div v-if="panelState.sections.overrides" class="section-body">
          <div class="element-tabs">
            <button
              v-for="tab in ELEMENT_TABS"
              :key="tab.key"
              class="tab-btn"
              :class="{ active: panelState.activeTab === tab.key }"
              type="button"
              @click="selectTab(tab.key)"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="override-card">
            <div class="override-row">
              <label class="override-label">颜色</label>
              <div class="color-controls">
                <input
                  class="color-swatch"
                  type="color"
                  :value="getColorInputValue(activeElementStyle.color)"
                  :disabled="activeElementStyle.color === 'inherit'"
                  @input="
                    updateElementStyle(panelState.activeTab, 'color', $event.target.value)
                  "
                />
                <select
                  class="app-select compact-select"
                  :value="activeElementStyle.color === 'inherit' ? 'inherit' : 'custom'"
                  @change="
                    updateElementStyle(
                      panelState.activeTab,
                      'color',
                      $event.target.value === 'inherit' ? 'inherit' : '#374151'
                    )
                  "
                >
                  <option value="inherit">跟随主题</option>
                  <option value="custom">自定义</option>
                </select>
                <input
                  v-if="activeElementStyle.color !== 'inherit'"
                  class="color-input"
                  type="text"
                  :value="activeElementStyle.color"
                  @input="
                    updateElementStyle(panelState.activeTab, 'color', $event.target.value)
                  "
                />
              </div>
            </div>

            <div class="override-row vertical-row">
              <label class="override-label">字体</label>
              <select
                class="app-select"
                :value="activeElementStyle.fontFamily"
                @change="
                  updateElementStyle(
                    panelState.activeTab,
                    'fontFamily',
                    $event.target.value
                  )
                "
              >
                <option
                  v-for="font in registeredFontOptions"
                  :key="font.value"
                  :value="font.value"
                >
                  {{ font.label }}
                </option>
              </select>
              <small class="font-source-hint">
                将 .ttf/.otf/.woff/.woff2 字体放到 exe 同目录的 fonts
                文件夹，重新打开样式面板后刷新。
              </small>
            </div>

            <div class="override-row vertical-row">
              <label class="override-label">字重</label>
              <div class="segmented-control">
                <button
                  class="seg-btn"
                  :class="{ active: activeElementStyle.bold === 'inherit' }"
                  type="button"
                  @click="updateElementStyle(panelState.activeTab, 'bold', 'inherit')"
                >
                  跟随主题
                </button>
                <button
                  class="seg-btn"
                  :class="{ active: activeElementStyle.bold === true }"
                  type="button"
                  @click="updateElementStyle(panelState.activeTab, 'bold', true)"
                >
                  加粗
                </button>
                <button
                  class="seg-btn"
                  :class="{ active: activeElementStyle.bold === false }"
                  type="button"
                  @click="updateElementStyle(panelState.activeTab, 'bold', false)"
                >
                  常规
                </button>
              </div>
            </div>

            <div class="override-row vertical-row">
              <label class="override-label">字形</label>
              <div class="segmented-control">
                <button
                  class="seg-btn"
                  :class="{ active: activeElementStyle.italic === 'inherit' }"
                  type="button"
                  @click="updateElementStyle(panelState.activeTab, 'italic', 'inherit')"
                >
                  跟随主题
                </button>
                <button
                  class="seg-btn"
                  :class="{ active: activeElementStyle.italic === true }"
                  type="button"
                  @click="updateElementStyle(panelState.activeTab, 'italic', true)"
                >
                  斜体
                </button>
                <button
                  class="seg-btn"
                  :class="{ active: activeElementStyle.italic === false }"
                  type="button"
                  @click="updateElementStyle(panelState.activeTab, 'italic', false)"
                >
                  常规
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="control-section">
        <button
          class="section-toggle"
          type="button"
          @click="toggleSection('smartThemes')"
        >
          <span>智能主题</span>
          <span>{{ panelState.sections.smartThemes ? "▾" : "▸" }}</span>
        </button>
        <SmartThemeSection
          v-if="panelState.sections.smartThemes"
          :themes="props.smartThemes"
          :current-theme="currentTheme"
          :generating="props.generatingSmartTheme"
          @generate="emit('generate-smart-theme')"
          @apply="emit('apply-smart-theme', $event)"
          @delete="emit('delete-smart-theme', $event)"
        />
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed } from "vue";
import { COLOR_PRESETS, ELEMENT_TABS } from "./constants";
import { registeredFontOptions } from "./fontRegistry";
import SmartThemeSection from "./SmartThemeSection.vue";

const styleConfig = defineModel("config", { required: true });
const panelState = defineModel("panelState", { required: true });

const props = defineProps({
  currentTheme: {
    type: String,
    required: true,
  },
  themes: {
    type: Array,
    default: () => [],
  },
  effectiveMetrics: {
    type: Object,
    required: true,
  },
  showReset: {
    type: Boolean,
    default: false,
  },
  smartThemes: {
    type: Array,
    default: () => [],
  },
  generatingSmartTheme: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "theme-change",
  "reset",
  "generate-smart-theme",
  "apply-smart-theme",
  "delete-smart-theme",
]);

const layoutControls = [
  {
    key: "contentWidth",
    label: "内容宽度",
    min: 720,
    max: 1440,
    step: 20,
    unit: "px",
  },
];

const spacingControls = [
  {
    key: "paddingHorizontal",
    label: "水平留白",
    min: 0,
    max: 80,
    step: 2,
    unit: "px",
  },
  // {
  //   key: "paddingVertical",
  //   label: "垂直留白",
  //   min: 0,
  //   max: 80,
  //   step: 2,
  //   unit: "px",
  // },
];

const sizeControls = [
  { key: "bodySize", label: "正文", min: 12, max: 24, step: 1, unit: "px" },
  { key: "h1Size", label: "H1", min: 20, max: 52, step: 1, unit: "px" },
  { key: "h2Size", label: "H2", min: 16, max: 40, step: 1, unit: "px" },
  { key: "h3Size", label: "H3", min: 14, max: 32, step: 1, unit: "px" },
  { key: "h4Size", label: "H4", min: 12, max: 28, step: 1, unit: "px" },
  { key: "h5Size", label: "H5", min: 11, max: 24, step: 1, unit: "px" },
  { key: "h6Size", label: "H6", min: 10, max: 22, step: 1, unit: "px" },
];

const tableHeaderAlignOptions = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
];

const activeElementStyle = computed(
  () => styleConfig.value[panelState.value.activeTab] || styleConfig.value.global
);

function replaceStyleConfig(patch) {
  styleConfig.value = {
    ...styleConfig.value,
    ...patch,
  };
}

function replacePanelState(patch) {
  panelState.value = {
    ...panelState.value,
    ...patch,
  };
}

function toggleSection(key) {
  replacePanelState({
    sections: {
      ...panelState.value.sections,
      [key]: !panelState.value.sections[key],
    },
  });
}

function updateNumericValue(key, value) {
  replaceStyleConfig({
    [key]: Number(value),
  });
}

function clearNumericValue(key) {
  replaceStyleConfig({
    [key]: null,
  });
}

function updateBooleanValue(key, value) {
  replaceStyleConfig({
    [key]: Boolean(value),
  });
}

function updateStringValue(key, value) {
  replaceStyleConfig({
    [key]: String(value),
  });
}

function selectTab(key) {
  replacePanelState({
    activeTab: key,
  });
}

function updateElementStyle(elementKey, property, value) {
  replaceStyleConfig({
    [elementKey]: {
      ...styleConfig.value[elementKey],
      [property]: value,
    },
  });
}

function applyPreset(preset) {
  replaceStyleConfig({
    global: {
      ...styleConfig.value.global,
      color: "inherit",
    },
    h1: {
      ...styleConfig.value.h1,
      color: preset.colors.h1,
    },
    h2: {
      ...styleConfig.value.h2,
      color: preset.colors.h2,
    },
    h3: {
      ...styleConfig.value.h3,
      color: preset.colors.h3,
    },
    p: {
      ...styleConfig.value.p,
      color: preset.colors.p,
    },
    strong: {
      ...styleConfig.value.strong,
      color: preset.colors.strong,
    },
    a: {
      ...styleConfig.value.a,
      color: preset.colors.a,
    },
  });
}

function closePanel() {
  replacePanelState({
    visible: false,
    visibilityTouched: true,
  });
}

function getColorInputValue(color) {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color || "")) {
    return color;
  }

  return "#374151";
}
</script>

<style scoped>
.style-config-panel {
  width: 320px;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-toolbar);
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-header p {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.panel-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  scrollbar-width: none;
}

.panel-scroll::-webkit-scrollbar {
  width: 0px; /* 设置宽度为 0 */
  height: 0px; /* 设置高度为 0 (水平滚动条) */
  background: transparent; /* 可选，确保透明 */
  display: none; /* 或者使用 display:none 彻底移除 */
}

.control-section + .control-section {
  margin-top: 12px;
}

.control-section {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  overflow: hidden;
}

.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: none;
  background: var(--btn-hover);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.section-body {
  padding: 14px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.app-select {
  width: 100%;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-toolbar);
  color: var(--text-primary);
  padding: 0 10px;
  outline: none;
}

.compact-select {
  width: 86px;
}

.slider-item + .slider-item {
  margin-top: 12px;
}

.slider-item:first-of-type {
  margin-top: 12px;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.slider-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-value {
  color: var(--text-primary);
  font-weight: 600;
}

.inline-reset-btn {
  border: none;
  background: transparent;
  color: var(--accent-color);
  font-size: 11px;
  cursor: pointer;
}

.inline-reset-btn:hover {
  text-decoration: underline;
}

.app-slider {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--border-color);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.app-slider::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 50%;
  background: var(--accent-color);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-toolbar);
  cursor: pointer;
}

.toggle-row strong,
.toggle-row small {
  display: block;
}

.toggle-row strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.toggle-row small {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
}

.switch {
  position: relative;
  flex: 0 0 auto;
  width: 48px;
  height: 28px;
}

.switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--border-color);
  transition: background 0.15s ease;
}

.switch-track::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-primary);
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease;
}

.switch input:checked + .switch-track {
  background: var(--accent-color);
}

.switch input:checked + .switch-track::after {
  transform: translateX(20px);
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.preset-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-toolbar);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  border-color: var(--accent-color);
  transform: translateY(-1px);
}

.preset-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.preset-dots {
  display: flex;
  gap: 4px;
}

.preset-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.element-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.tab-btn {
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-toolbar);
  color: var(--text-secondary);
  padding: 8px 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn.active {
  border-color: var(--accent-color);
  background: var(--btn-active);
  color: var(--accent-color);
}

.override-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-toolbar);
  padding: 12px;
}

.override-row + .override-row {
  margin-top: 12px;
}

.override-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.vertical-row {
  flex-direction: column;
  align-items: stretch;
}

.font-source-hint {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.override-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.color-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-swatch {
  width: 28px;
  height: 28px;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.color-swatch:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.color-input {
  width: 60px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 0 4px;
  outline: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.seg-btn {
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.seg-btn.active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: #ffffff;
}
</style>
