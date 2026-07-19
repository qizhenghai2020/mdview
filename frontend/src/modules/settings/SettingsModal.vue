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
            <span class="settings-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 6h6" />
                <path d="M14 6h6" />
                <path d="M10 4v4" />
                <path d="M4 12h10" />
                <path d="M18 10v4" />
                <path d="M22 12h-4" />
                <path d="M4 18h12" />
                <path d="M20 16v4" />
                <path d="M22 18h-2" />
              </svg>
            </span>
            常规配置
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSection === 'models' }"
            type="button"
            @click="activeSection = 'models'"
          >
            <span class="settings-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="4" y="5" width="16" height="6" rx="2" />
                <rect x="4" y="13" width="16" height="6" rx="2" />
                <path d="M8 8h.01" />
                <path d="M8 16h.01" />
                <path d="M12 8h4" />
                <path d="M12 16h4" />
              </svg>
            </span>
            模型配置
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSection === 'features' }"
            type="button"
            @click="activeSection = 'features'"
          >
            <span class="settings-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l1.9 4.85L19 9.75l-4 3.15L16.1 18 12 15.25 7.9 18 9 12.9 5 9.75l5.1-1.9L12 3z"
                />
              </svg>
            </span>
            功能特色
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSection === 'changelog' }"
            type="button"
            @click="activeSection = 'changelog'"
          >
            <span class="settings-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 6h8" />
                <path d="M8 10h8" />
                <path d="M8 14h5" />
                <path d="M6 3h9l3 3v15H6z" />
                <path d="M15 3v4h4" />
              </svg>
            </span>
            更新日志
          </button>
          <button
            class="settings-nav-item"
            :class="{ active: activeSection === 'about' }"
            type="button"
            @click="activeSection = 'about'"
          >
            <span class="settings-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 10v5" />
                <path d="M12 7.5h.01" />
              </svg>
            </span>
            关于我们
          </button>
        </nav>

        <div class="settings-content">
          <template v-if="activeSection === 'general'">
            <div class="settings-section-heading">
              <div>
                <h3>常规配置</h3>
              </div>
            </div>

            <div class="navigation-default-card">
              <div class="navigation-default-copy">
                <strong>左侧导航默认页签</strong>
                <span>
                  设置每次打开文件或文件夹后，左侧导航优先激活“文件”还是“大纲”。
                </span>
              </div>
              <label class="navigation-default-select">
                <select v-model="settings.sidebarDefaultSection">
                  <option
                    v-for="option in sidebarDefaultOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <small>
                  {{
                    sidebarDefaultOptions.find(
                      (option) => option.value === settings.sidebarDefaultSection
                    )?.description
                  }}
                </small>
              </label>
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

            <div class="browser-zoom-card">
              <div class="browser-zoom-copy">
                <strong>浏览器缩放</strong>
                <span>
                  还原整个软件界面的浏览器缩放。也可以按住 Ctrl +
                  鼠标滚轮缩放；这不是右上角的正文内容缩放。
                </span>
              </div>
              <div class="browser-zoom-actions">
                <span>{{ props.browserZoomLevel }}%</span>
                <button
                  class="settings-secondary-btn"
                  type="button"
                  :disabled="props.browserZoomLevel === 100"
                  @click="emit('reset-browser-zoom')"
                >
                  还原 100%
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="activeSection === 'models'">
            <div class="settings-section-heading">
              <div>
                <h3>供应商与模型</h3>
                <p>供应商是父级，模型归属在对应供应商下面，新增模型请在供应商内部操作。</p>
              </div>
              <div class="settings-section-actions">
                <button class="settings-primary-btn" type="button" @click="addProvider">
                  + 添加供应商
                </button>
              </div>
            </div>

            <div class="model-manager">
              <aside class="provider-tree">
                <div class="provider-list-head">
                  <strong>供应商</strong>
                  <small>{{ settings.providers.length }} 个</small>
                </div>
                <div v-if="settings.providers.length === 0" class="model-empty">
                  <span>还没有供应商</span>
                  <button class="settings-link-btn" type="button" @click="addProvider">
                    添加供应商
                  </button>
                </div>
                <article
                  v-for="provider in settings.providers"
                  :key="provider.id"
                  class="provider-tree-item"
                  :class="{
                    active: selectedProviderId === provider.id,
                    current: providerHasActiveModel(provider),
                  }"
                >
                  <button
                    class="provider-tree-head"
                    type="button"
                    @click="selectProvider(provider.id)"
                  >
                    <span class="model-list-main">
                      <strong>{{ provider.name || "未命名供应商" }}</strong>
                      <small>{{ provider.baseUrl || "未填写接口地址" }}</small>
                    </span>
                    <span class="model-list-state">
                      <span
                        class="model-status-dot"
                        :class="{ current: providerHasActiveModel(provider) }"
                      ></span>
                      <small>{{ getProviderModelCount(provider) }} 个模型</small>
                    </span>
                  </button>
                </article>
              </aside>

              <div v-if="selectedProvider" class="provider-workspace">
                <section class="provider-config-panel">
                  <div class="provider-config-head">
                    <div>
                      <span class="detail-kicker">供应商设置</span>
                      <h4>{{ selectedProvider.name || "未命名供应商" }}</h4>
                    </div>
                    <div class="provider-form-actions">
                      <button
                        v-if="
                          selectedProvider &&
                          !isBuiltinProvider(selectedProvider.id)
                        "
                        class="settings-danger-btn"
                        type="button"
                        @click="removeProvider(selectedProvider.id)"
                      >
                        删除供应商
                      </button>
                    </div>
                  </div>

                  <div class="model-form-grid">
                    <label class="settings-field settings-field-wide">
                      <span>供应商名称</span>
                      <input
                        v-model="selectedProvider.name"
                        type="text"
                        placeholder="例如：OpenAI / DeepSeek / 公司网关"
                      />
                    </label>
                    <label class="settings-field settings-field-half">
                      <span>接口地址</span>
                      <input
                        v-model="selectedProvider.baseUrl"
                        type="url"
                        placeholder="https://api.openai.com/v1"
                      />
                    </label>
                    <label
                      v-if="!isBuiltinProvider(selectedProvider.id)"
                      class="settings-field settings-field-half"
                    >
                      <span>API Key</span>
                      <input
                        v-model="selectedProvider.apiKey"
                        type="password"
                        placeholder="仅保存在本机"
                      />
                    </label>
                    <div v-else class="settings-field settings-field-half builtin-key-note">
                      <span>API Key</span>
                      <strong>内置密钥已随应用加载，不在界面显示</strong>
                    </div>
                    <label class="settings-field settings-field-third">
                      <span>测试超时（秒）</span>
                      <input
                        v-model.number="selectedProvider.timeout"
                        type="number"
                        min="5"
                        max="300"
                      />
                    </label>
                    <label class="settings-field settings-field-third">
                      <span>AI排版超时（秒）</span>
                      <input
                        v-model.number="selectedProvider.formatTimeout"
                        type="number"
                        min="30"
                        max="1800"
                      />
                    </label>
                    <label class="settings-field settings-field-third">
                      <span>响应方式</span>
                      <select v-model="selectedProvider.responseMode">
                        <option value="standard">普通返回</option>
                        <option value="stream">流式返回</option>
                      </select>
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
                        @click="addRequestHeader(selectedProvider)"
                      >
                        + 添加请求头
                      </button>
                    </div>

                    <div
                      v-if="selectedProvider.headers?.length"
                      class="custom-header-list"
                    >
                      <div
                        v-for="header in selectedProvider.headers"
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
                          @click="removeRequestHeader(selectedProvider, header.id)"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <p v-else class="custom-headers-empty">没有自定义请求头。</p>
                  </section>

                  <section class="request-template-section">
                    <div class="request-template-heading">
                      <div>
                        <strong>请求参数模板</strong>
                        <small>
                          可选。为空时使用 OpenAI 兼容请求；填写后可用
                          <code v-pre>{{ model }}</code
                          >、<code v-pre>{{ messages }}</code
                          >、<code v-pre>{{ userPrompt }}</code>
                          等变量。
                        </small>
                      </div>
                    </div>
                    <textarea
                      v-model="selectedProvider.requestTemplate"
                      class="request-template-input"
                      spellcheck="false"
                      placeholder='例如：{"model":"{{model}}","messages":"{{messages}}"}'
                    ></textarea>
                  </section>

                  <section class="provider-model-panel">
                    <div class="provider-model-list-head">
                      <div>
                        <strong>模型列表</strong>
                        <small>当前供应商下的模型，只在这里新增和删除。</small>
                      </div>
                      <button
                        class="settings-secondary-btn"
                        type="button"
                        @click="addModelToProvider(selectedProvider.id)"
                      >
                        + 新增模型
                      </button>
                    </div>

                    <div v-if="providerModels.length" class="provider-model-list">
                      <div
                        v-for="model in providerModels"
                        :key="model.id"
                        class="provider-model-row"
                        :class="{ active: selectedModelId === model.id }"
                        @click="selectModel(model.id)"
                      >
                        <label class="provider-model-name-field">
                          <span>模型名称</span>
                          <input
                            v-model="model.model"
                            type="text"
                            placeholder="例如：gpt-4o-mini"
                            @focus="selectModel(model.id)"
                          />
                        </label>
                        <div class="provider-model-status">
                          <span>状态</span>
                          <div>
                            <span
                              class="model-status-dot"
                              :class="{
                                enabled: model.enabled,
                                current: settings.activeModelId === model.id,
                                passed: model.verified,
                                failed: model.testStatus === 'failed',
                              }"
                            ></span>
                            <em>{{ getModelStateLabel(model) }}</em>
                            <button
                              class="settings-link-btn"
                              type="button"
                              :disabled="testingModelId === model.id"
                              @click.stop="runModelTest(model)"
                            >
                              {{ testingModelId === model.id ? "测试中..." : "测试" }}
                            </button>
                          </div>
                        </div>
                        <label v-if="canEnableModel(model)" class="provider-model-enabled">
                          <span>启用</span>
                          <span class="switch">
                            <input
                              :checked="model.enabled"
                              :disabled="!canEnableModel(model) && !model.enabled"
                              type="checkbox"
                              @click.stop
                              @change="updateModelEnabled(model, $event.target.checked)"
                            />
                            <span class="switch-track"></span>
                          </span>
                        </label>
                        <div v-else class="provider-model-enabled provider-model-disabled">
                          <span>启用</span>
                          <small>先测试</small>
                        </div>
                        <button
                          v-if="!isBuiltinModel(model.id)"
                          class="provider-model-remove"
                          type="button"
                          title="删除模型"
                          @click.stop="removeModel(model.id)"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <p v-else class="provider-model-empty">
                      当前供应商还没有模型，点击“新增模型”开始配置。
                    </p>
                  </section>
                </section>

              </div>

              <div v-else class="model-form model-form-empty">
                <span class="model-empty-mark">◇</span>
                <h4>选择或添加一个供应商</h4>
                <p>供应商下面可以添加多个模型。</p>
              </div>
            </div>
          </template>

          <template v-else-if="activeSection === 'features'">
            <div class="settings-section-heading">
              <div>
                <h3>功能特色</h3>
                <p>围绕 Markdown 阅读、编辑、AI 辅助和桌面工作流做的增强能力。</p>
              </div>
            </div>

            <section class="feature-hero">
              <div class="feature-hero-copy">
                <span class="about-eyebrow">FEATURES</span>
                <h4>不只是一个 Markdown 预览器</h4>
                <p>
                  这里把程序里比较有代表性的增强功能集中整理了一下，方便快速了解目前这套工具能做什么。
                </p>
              </div>

              <div class="feature-hero-badges">
                <span
                  v-for="badge in featureSummaryBadges"
                  :key="badge"
                  class="feature-hero-badge"
                >
                  {{ badge }}
                </span>
              </div>
            </section>

            <section class="feature-grid">
              <article
                v-for="feature in featureHighlights"
                :key="feature.title"
                class="feature-card"
              >
                <div class="feature-card-head">
                  <span class="feature-card-icon" aria-hidden="true">{{
                    feature.icon
                  }}</span>
                  <div>
                    <h4>{{ feature.title }}</h4>
                    <p>{{ feature.description }}</p>
                  </div>
                </div>

                <div class="feature-card-tags">
                  <span v-for="tag in feature.tags" :key="tag" class="feature-card-tag">
                    {{ tag }}
                  </span>
                </div>
              </article>
            </section>
          </template>

          <template v-else-if="activeSection === 'changelog'">
            <div class="settings-section-heading">
              <div>
                <h3>更新日志</h3>
                <p>内容直接读取 `docs/更新日志.md`，打包时会自动同步到这里。</p>
              </div>
              <span v-if="latestChangelogTitle" class="changelog-sync-badge">
                最新：{{ latestChangelogTitle }}
              </span>
            </div>

            <section class="changelog-card">
              <div class="changelog-card-head">
                <div>
                  <span class="about-eyebrow">RELEASE NOTES</span>
                  <h4>当前版本更新内容</h4>
                  <p>
                    每次维护完 `docs/更新日志.md` 再打包，这里的显示内容就会自动跟着更新。
                  </p>
                </div>
              </div>

              <div v-if="changelogSections.length" class="changelog-list">
                <article
                  v-for="section in changelogSections"
                  :key="section.title"
                  class="changelog-section"
                >
                  <div class="changelog-section-head">
                    <h5>{{ section.title }}</h5>
                    <span class="changelog-section-count"
                      >{{ section.items.length }} 项</span
                    >
                  </div>
                  <p v-if="section.summary" class="changelog-section-summary">
                    {{ section.summary }}
                  </p>
                  <ul class="changelog-items">
                    <li v-for="item in section.items" :key="item">
                      {{ item }}
                    </li>
                  </ul>
                </article>
              </div>
              <pre v-else class="changelog-raw">{{ changelogMarkdownRaw }}</pre>
            </section>
          </template>

          <template v-else>
            <div class="settings-section-heading">
              <div>
                <h3>关于我们</h3>
                <p>MD 查看器作者与联系信息</p>
              </div>
            </div>

            <section class="about-card">
              <div class="about-brand">
                <div class="about-brand-mark" aria-hidden="true">
                  <img
                    :src="appLogoUrl"
                    class="about-brand-logo"
                    alt=""
                    draggable="false"
                  />
                </div>
                <div>
                  <span class="about-eyebrow">MARKDOWN VIEWER</span>
                  <h4>MD 查看器</h4>
                  <p>专注于 Markdown 与文本文件的阅读、编辑和整理。</p>
                </div>
              </div>

              <dl class="about-details">
                <div class="about-detail-row">
                  <dt>版本</dt>
                  <dd>v1.0.2</dd>
                </div>
                <div class="about-detail-row">
                  <dt>作者</dt>
                  <dd>
                    <a
                      class="about-link"
                      href="https://github.com/qizhenghai2020/mdview"
                      target="_blank"
                      rel="noreferrer"
                      @click.prevent="openExternalUrl('https://github.com/qizhenghai2020/mdview')"
                    >
                      qizhenghai2020/mdview
                    </a>
                  </dd>
                </div>
                <div class="about-detail-row">
                  <dt>邮箱</dt>
                  <dd>522681219@qq.com</dd>
                </div>
                <div class="about-detail-row">
                  <dt>绿泡泡</dt>
                  <dd>cookieqzh</dd>
                </div>
              </dl>
            </section>
          </template>
        </div>
      </div>
    </section>

    <div
      v-if="modelTestDetail"
      class="model-test-detail-backdrop"
      @mousedown.self="closeModelTestDetail"
    >
      <section class="model-test-detail-modal" role="dialog" aria-modal="true">
        <header class="model-test-detail-header">
          <div>
            <h3>模型测试明细</h3>
            <p
              class="model-test-detail-status"
              :class="modelTestDetail.success ? 'is-passed' : 'is-failed'"
            >
              {{
                modelTestDetail.message ||
                (modelTestDetail.success ? "测试通过" : "测试失败")
              }}
            </p>
          </div>
          <button class="settings-close" type="button" @click="closeModelTestDetail">
            ×
          </button>
        </header>

        <div class="model-test-detail-body">
          <div class="model-test-detail-meta">
            <span
              >请求：{{ modelTestDetail.method }}
              {{ modelTestDetail.endpoint || "未发送" }}</span
            >
            <span v-if="modelTestDetail.statusCode">
              HTTP {{ modelTestDetail.statusCode }}
            </span>
            <span v-if="modelTestDetail.contentPath">
              内容字段：{{ modelTestDetail.contentPath }}
            </span>
          </div>

          <div class="model-test-detail-grid">
            <section class="model-test-detail-card">
              <h4>请求体</h4>
              <pre>{{ modelTestDetail.requestBody || "无" }}</pre>
            </section>
            <section class="model-test-detail-card">
              <h4>原始响应体</h4>
              <pre>{{ modelTestDetail.responseBody || "无" }}</pre>
            </section>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import {
  BUILTIN_DEFAULT_MODEL_ID,
  BUILTIN_DEFAULT_PROVIDER_ID,
  buildModelTestFingerprint,
  buildResolvedModelConfig,
  createModel,
  createProvider,
  createRequestHeader,
} from "./constants";
import { hasConfiguredAIModel } from "@/shared/ai/model";
import appLogoUrl from "@/assets/app-logo.png";
import changelogMarkdownRaw from "../../../../docs/更新日志.md?raw";

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
  browserZoomLevel: {
    type: Number,
    default: 100,
  },
});

const emit = defineEmits(["close", "reset-browser-zoom"]);

const SETTINGS_SECTIONS = new Set([
  "general",
  "models",
  "features",
  "changelog",
  "about",
]);

function normalizeSection(section) {
  return SETTINGS_SECTIONS.has(section) ? section : "general";
}

const activeSection = ref(normalizeSection(props.initialSection));
const selectedProviderId = ref(settings.value.providers[0]?.id || "");
const selectedModelId = ref(
  settings.value.models.find((model) => model.providerId === selectedProviderId.value)?.id ||
    settings.value.models[0]?.id ||
    ""
);
const testingModelId = ref("");
const modelTestDetail = ref(null);

const persistenceOptions = [
  { key: "theme", label: "主题" },
  { key: "zoom", label: "内容缩放" },
  { key: "viewMode", label: "预览 / 编辑 / 分栏模式" },
  { key: "showToc", label: "左侧导航开启/关闭" },
  { key: "tocWidth", label: "左侧目录宽度" },
  { key: "splitWidth", label: "分栏编辑宽度" },
];

const sidebarDefaultOptions = [
  {
    value: "auto",
    label: "自动判断",
    description: "单文件默认打开大纲，多文件或文件夹默认打开文件列表",
  },
  {
    value: "outline",
    label: "始终大纲",
    description: "打开文档后优先显示 Markdown 大纲，没有大纲时自动回退",
  },
  {
    value: "files",
    label: "始终文件",
    description: "打开文档后优先显示左侧文件列表",
  },
];

const featureSummaryBadges = [
  "预览 / 编辑 / 分栏",
  "AI 排版",
  "AI 智能主题",
  "文件树 / 大纲",
  "表格增强",
  "本地同步",
];

const featureHighlights = [
  {
    icon: "◫",
    title: "三种工作模式",
    description:
      "支持预览、编辑、分栏三种工作流，阅读、源码修改和对照编辑可以按场景快速切换。",
    tags: ["预览模式", "编辑模式", "分栏编辑"],
  },
  {
    icon: "☰",
    title: "文件与大纲导航",
    description:
      "支持多文件、多目录工作区，配合左侧文件树和 Markdown 大纲快速定位内容，还能记住常用界面状态。",
    tags: ["文件树", "文档大纲", "状态记忆"],
  },
  {
    icon: "✦",
    title: "AI 排版辅助",
    description:
      "内置模型管理、测试与智能排版流程，支持输入排版要求，并在应用前查看前后对比结果。",
    tags: ["模型配置", "排版要求", "结果预览"],
  },
  {
    icon: "◌",
    title: "主题与样式定制",
    description:
      "支持智能主题、元素级样式覆盖、表格宽度和表头对齐等细节配置，让阅读风格更贴合个人习惯。",
    tags: ["智能主题", "样式配置", "表格样式"],
  },
  {
    icon: "▤",
    title: "表格与任务清单增强",
    description:
      "预览区支持表格列宽拖动与缓存，任务清单也有更丰富的显示样式，适合计划、记录和整理场景。",
    tags: ["列宽拖动", "列宽缓存", "任务清单"],
  },
  {
    icon: "⇄",
    title: "桌面本地协作能力",
    description:
      "支持外部文件变更同步、冲突保护、常见文本与代码文件查看编辑，并兼顾中文编码兼容性。",
    tags: ["外部同步", "冲突保护", "多格式文本"],
  },
];

function parseChangelogSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections = [];
  let currentSection = null;

  const ensureSection = (title = "未分类更新") => {
    if (!currentSection) {
      currentSection = {
        title,
        summary: "",
        items: [],
      };
      sections.push(currentSection);
    }

    return currentSection;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const sectionTitleMatch = trimmed.match(/^##\s+(.+)$/);
    if (sectionTitleMatch) {
      currentSection = {
        title: sectionTitleMatch[1].trim(),
        summary: "",
        items: [],
      };
      sections.push(currentSection);
      return;
    }

    if (/^#\s+/.test(trimmed)) {
      return;
    }

    if (/^- /.test(trimmed)) {
      ensureSection().items.push(trimmed.replace(/^-+\s*/, "").trim());
      return;
    }

    const targetSection = ensureSection();
    if (targetSection.items.length > 0) {
      const lastIndex = targetSection.items.length - 1;
      targetSection.items[
        lastIndex
      ] = `${targetSection.items[lastIndex]} ${trimmed}`.trim();
      return;
    }

    targetSection.summary = targetSection.summary
      ? `${targetSection.summary} ${trimmed}`
      : trimmed;
  });

  return sections.filter(
    (section) => section.title || section.summary || section.items.length
  );
}

const changelogSections = parseChangelogSections(changelogMarkdownRaw);
const latestChangelogTitle = changelogSections[0]?.title || "";

function openExternalUrl(url) {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }

  try {
    BrowserOpenURL(target);
  } catch (_) {
    window.open(target, "_blank", "noopener,noreferrer");
  }
}

const providersById = computed(() => {
  return new Map(
    (Array.isArray(settings.value.providers) ? settings.value.providers : []).map((provider) => [
      provider.id,
      provider,
    ])
  );
});

const selectedProvider = computed(() => {
  return (
    providersById.value.get(String(selectedProviderId.value || "")) ||
    settings.value.providers[0] ||
    null
  );
});

const providerModels = computed(() => {
  const providerId = String(selectedProvider.value?.id || "");
  if (!providerId) {
    return [];
  }

  return settings.value.models.filter(
    (model) => String(model.providerId || "") === providerId
  );
});

function selectModel(modelId) {
  const model = settings.value.models.find((item) => item.id === modelId) || null;
  if (model) {
    selectedProviderId.value = model.providerId;
    selectedModelId.value = model.id;
  }
}

function getModelsForProvider(providerId) {
  const normalizedProviderId = String(providerId || "");
  return settings.value.models.filter(
    (model) => String(model.providerId || "") === normalizedProviderId
  );
}

function getPreferredModelIdForProvider(providerId) {
  const models = getModelsForProvider(providerId);
  return (
    models.find((model) => model.id === settings.value.activeModelId)?.id ||
    models[0]?.id ||
    ""
  );
}

function selectProvider(providerId) {
  selectedProviderId.value = String(providerId || "");
  selectedModelId.value = getPreferredModelIdForProvider(selectedProviderId.value);
}

function getProviderModelCount(provider) {
  return getModelsForProvider(provider?.id).length;
}

function providerHasActiveModel(provider) {
  return getModelsForProvider(provider?.id).some(
    (model) => model.id === settings.value.activeModelId
  );
}

function getModelStateLabel(model) {
  if (settings.value.activeModelId === model?.id && model?.enabled) {
    return "使用中";
  }
  if (model?.verified && model?.testStatus === "passed") {
    return "可使用";
  }
  if (model?.testStatus === "failed") {
    return "失败";
  }
  return "待测";
}

function isBuiltinProvider(providerId) {
  return String(providerId || "") === BUILTIN_DEFAULT_PROVIDER_ID;
}

function isBuiltinModel(modelId) {
  return String(modelId || "") === BUILTIN_DEFAULT_MODEL_ID;
}

function getModelProvider(model) {
  if (!model) {
    return settings.value.providers[0] || null;
  }

  return (
    providersById.value.get(String(model.providerId || "")) ||
    settings.value.providers[0] ||
    null
  );
}

function canEnableModel(model) {
  return Boolean(model?.verified && model?.testStatus === "passed");
}

function resetActiveModelIfNeeded(model) {
  if (settings.value.activeModelId === model?.id) {
    settings.value.activeModelId = "";
  }
}

function useExclusiveModel(model) {
  if (!canEnableModel(model)) {
    return false;
  }

  settings.value.models.forEach((item) => {
    item.enabled = item.id === model.id;
  });
  settings.value.activeModelId = model.id;
  selectedProviderId.value = model.providerId;
  selectedModelId.value = model.id;
  return true;
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

function ensureProviderList() {
  if (!Array.isArray(settings.value.providers)) {
    settings.value.providers = [];
  }
  if (settings.value.providers.length === 0) {
    settings.value.providers.push(createProvider());
  }
  return settings.value.providers;
}

function syncActiveModelSelection() {
  const activeModel = settings.value.models.find(
    (model) =>
      model.id === settings.value.activeModelId && model.enabled && model.verified
  );
  if (activeModel) {
    settings.value.models.forEach((model) => {
      model.enabled = model.id === activeModel.id;
    });
    return;
  }

  const fallbackModel = settings.value.models.find(
    (model) => model.enabled && model.verified
  );
  if (fallbackModel) {
    useExclusiveModel(fallbackModel);
    return;
  }

  settings.value.activeModelId = "";
}

function addProvider() {
  const provider = createProvider();
  ensureProviderList().push(provider);
  selectedProviderId.value = provider.id;
  selectedModelId.value = "";
  return provider;
}

function removeProvider(providerId) {
  if (isBuiltinProvider(providerId)) {
    return;
  }

  const index = settings.value.providers.findIndex((provider) => provider.id === providerId);
  if (index < 0) {
    return;
  }

  settings.value.providers.splice(index, 1);
  const fallbackProvider =
    settings.value.providers[0]?.id || addProvider().id;

  settings.value.models.forEach((model) => {
    if (model.providerId === providerId) {
      model.providerId = fallbackProvider;
      invalidateModelTest(model, "供应商已变更，请重新测试");
    }
  });

  if (selectedProviderId.value === providerId) {
    selectedProviderId.value = fallbackProvider;
    selectedModelId.value = getPreferredModelIdForProvider(fallbackProvider);
  }

  syncActiveModelSelection();
}

function updateModelProvider(model, providerId) {
  if (!model) {
    return;
  }

  const nextProviderId = String(providerId || "");
  if (model.providerId === nextProviderId) {
    return;
  }

  model.providerId = nextProviderId;
  invalidateModelTest(model, "供应商已变更，请重新测试");
  selectedProviderId.value = nextProviderId;
  selectedModelId.value = model.id;
}

function addModel() {
  addModelToProvider(selectedProvider.value?.id);
}

function addModelToProvider(providerId) {
  const provider =
    providersById.value.get(String(providerId || "")) ||
    selectedProvider.value ||
    ensureProviderList()[0] ||
    addProvider();
  const model = createModel(provider?.id || "");
  settings.value.models.push(model);
  selectedProviderId.value = model.providerId;
  selectedModelId.value = model.id;
  return model;
}

function removeModel(modelId) {
  if (isBuiltinModel(modelId)) {
    return;
  }

  const index = settings.value.models.findIndex((model) => model.id === modelId);
  if (index < 0) {
    return;
  }

  const removed = settings.value.models[index];
  settings.value.models.splice(index, 1);
  resetActiveModelIfNeeded(removed);

  syncActiveModelSelection();

  selectedModelId.value = getPreferredModelIdForProvider(selectedProviderId.value);
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
  useExclusiveModel(model);
}

function updateModelEnabled(model, checked) {
  if (!model) {
    return;
  }

  if (checked && !canEnableModel(model)) {
    model.enabled = false;
    return;
  }

  if (checked) {
    useExclusiveModel(model);
    return;
  }

  model.enabled = false;
  resetActiveModelIfNeeded(model);
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

function formatJsonLike(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch (_) {
      return trimmed;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function openModelTestDetail(result, fallbackMessage = "") {
  modelTestDetail.value = {
    success: Boolean(result?.success),
    message: String(result?.message || fallbackMessage || ""),
    content: String(result?.content || ""),
    contentPath: String(result?.contentPath || ""),
    endpoint: String(result?.endpoint || ""),
    method: String(result?.method || "POST"),
    statusCode: Number(result?.statusCode || 0),
    requestBody: formatJsonLike(result?.requestBody),
    responseBody: formatJsonLike(result?.responseBody),
  };
}

function closeModelTestDetail() {
  modelTestDetail.value = null;
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
    model.testedFingerprint = buildModelTestFingerprint(model, getModelProvider(model));
    resetActiveModelIfNeeded(model);
    return;
  }

  const provider = getModelProvider(model);
  const resolvedModel = buildResolvedModelConfig(model, provider);

  if (!hasConfiguredAIModel(resolvedModel)) {
    model.verified = false;
    model.enabled = false;
    model.testStatus = "failed";
    model.testMessage = "请至少填写供应商接口地址和模型名称，再进行测试。";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model, provider);
    resetActiveModelIfNeeded(model);
    return;
  }

  testingModelId.value = model.id;

  try {
    const responseText = await props.testModel(resolvedModel);

    const result =
      responseText && typeof responseText === "object"
        ? responseText
        : {
            success: true,
            message: "测试通过",
            content: String(responseText || ""),
          };
    openModelTestDetail(result, "测试完成");

    if (!result.success) {
      throw new Error(result.message || "模型测试失败");
    }

    model.verified = true;
    model.testStatus = "passed";
    model.testMessage = result.content
      ? `测试通过：${String(result.content).slice(0, 80)}`
      : "测试通过，可以启用";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model, provider);
  } catch (error) {
    if (!modelTestDetail.value) {
      openModelTestDetail(null, error?.message || String(error) || "模型测试失败");
    }
    model.verified = false;
    model.enabled = false;
    model.testStatus = "failed";
    model.testMessage = error?.message || String(error) || "模型测试失败";
    model.testedAt = new Date().toISOString();
    model.testedFingerprint = buildModelTestFingerprint(model, provider);
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
  () => settings.value.providers.map((provider) => provider.id),
  (providerIds) => {
    const fallbackProviderId = providerIds[0] || addProvider().id;
    if (!providerIds.includes(selectedProviderId.value)) {
      selectedProviderId.value = fallbackProviderId;
    }
    settings.value.models.forEach((model) => {
      if (!providerIds.includes(model.providerId)) {
        model.providerId = fallbackProviderId;
        invalidateModelTest(model, "供应商已变更，请重新测试");
      }
    });
    if (!providerModels.value.some((model) => model.id === selectedModelId.value)) {
      selectedModelId.value = getPreferredModelIdForProvider(selectedProviderId.value);
    }
  },
  { immediate: true }
);

watch(
  () =>
    settings.value.models.map((model) => ({
      id: model.id,
      providerId: model.providerId,
    })),
  () => {
    const providerIds = settings.value.providers.map((provider) => provider.id);
    if (!providerIds.includes(selectedProviderId.value)) {
      selectedProviderId.value = providerIds[0] || "";
    }
    if (!providerModels.value.some((model) => model.id === selectedModelId.value)) {
      selectedModelId.value = getPreferredModelIdForProvider(selectedProviderId.value);
    }
  },
  { deep: true, immediate: true }
);

const lastKnownFingerprints = new Map();

watch(
  () =>
    settings.value.models.map((model) => ({
      id: model.id,
      fingerprint: buildModelTestFingerprint(model, getModelProvider(model)),
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
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
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
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-secondary) 10%, transparent);
  color: currentColor;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.settings-nav-icon svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 1.85;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-nav-item:hover .settings-nav-icon,
.settings-nav-item.active .settings-nav-icon {
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 16%, transparent);
}

.settings-content {
  min-width: 0;
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.settings-body,
.settings-nav,
.settings-content,
.model-test-detail-body,
.model-test-detail-card pre {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.settings-body::-webkit-scrollbar,
.settings-nav::-webkit-scrollbar,
.settings-content::-webkit-scrollbar,
.model-test-detail-body::-webkit-scrollbar,
.model-test-detail-card pre::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.settings-body::-webkit-scrollbar-track,
.settings-nav::-webkit-scrollbar-track,
.settings-content::-webkit-scrollbar-track,
.model-test-detail-body::-webkit-scrollbar-track,
.model-test-detail-card pre::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.settings-body::-webkit-scrollbar-thumb,
.settings-nav::-webkit-scrollbar-thumb,
.settings-content::-webkit-scrollbar-thumb,
.model-test-detail-body::-webkit-scrollbar-thumb,
.model-test-detail-card pre::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border: 2px solid transparent;
  border-radius: var(--app-scrollbar-radius, 999px);
  background-clip: content-box;
}

.settings-body::-webkit-scrollbar-thumb:hover,
.settings-nav::-webkit-scrollbar-thumb:hover,
.settings-content::-webkit-scrollbar-thumb:hover,
.model-test-detail-body::-webkit-scrollbar-thumb:hover,
.model-test-detail-card pre::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
  background-clip: content-box;
}

.settings-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.settings-section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.persistence-card {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-toolbar);
}

.navigation-default-card,
.browser-zoom-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-toolbar);
}

.navigation-default-card {
  margin-top: 0;
  margin-bottom: 14px;
}

.navigation-default-copy,
.browser-zoom-copy {
  min-width: 0;
}

.navigation-default-copy strong,
.navigation-default-copy span,
.browser-zoom-copy strong,
.browser-zoom-copy span {
  display: block;
}

.navigation-default-copy span,
.browser-zoom-copy span {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.navigation-default-select {
  width: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.navigation-default-select select {
  width: 100%;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 0 10px;
  outline: none;
}

.navigation-default-select select:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 12%, transparent);
}

.navigation-default-select small {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.browser-zoom-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.browser-zoom-actions > span {
  min-width: 48px;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.feature-hero,
.changelog-card,
.about-card {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: radial-gradient(
      circle at 92% 8%,
      color-mix(in srgb, var(--accent-color) 13%, transparent),
      transparent 34%
    ),
    var(--bg-toolbar);
}

.feature-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px;
}

.feature-hero-copy {
  min-width: 0;
}

.feature-hero-copy h4,
.changelog-card-head h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 22px;
}

.feature-hero-copy p,
.changelog-card-head p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.75;
}

.feature-hero-badges {
  max-width: 330px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.feature-hero-badge,
.feature-card-tag,
.changelog-sync-badge,
.changelog-section-count {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.feature-hero-badge {
  padding: 7px 12px;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.feature-card,
.changelog-section {
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-toolbar);
}

.feature-card {
  padding: 18px;
}

.feature-card-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.feature-card-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
  color: var(--accent-color);
  font-size: 20px;
  font-weight: 700;
}

.feature-card h4,
.changelog-section h5 {
  margin: 0;
  color: var(--text-primary);
}

.feature-card h4 {
  font-size: 15px;
}

.feature-card p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.feature-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.feature-card-tag {
  padding: 6px 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.changelog-sync-badge {
  padding: 7px 12px;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
}

.changelog-card-head {
  padding: 24px 26px 0;
}

.changelog-list {
  display: grid;
  gap: 14px;
  padding: 16px 26px 26px;
}

.changelog-section {
  padding: 18px;
}

.changelog-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.changelog-section-count {
  padding: 5px 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.changelog-section-summary {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.changelog-items {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
}

.changelog-items li + li {
  margin-top: 10px;
}

.changelog-raw {
  margin: 0;
  padding: 24px 26px 26px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.about-brand {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 26px;
  border-bottom: 1px solid var(--border-color);
}

.about-brand-mark {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-color) 28%, transparent);
  border-radius: 20px;
  background: radial-gradient(
      circle at 28% 22%,
      color-mix(in srgb, #ffffff 28%, transparent),
      transparent 34%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--accent-color) 20%, var(--bg-primary)),
      color-mix(in srgb, var(--accent-color) 8%, var(--bg-secondary))
    );
  box-shadow: 0 12px 28px color-mix(in srgb, var(--accent-color) 28%, transparent);
}

.about-brand-logo {
  width: 48px;
  height: 48px;
  object-fit: contain;
  user-select: none;
}

.about-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: var(--accent-color);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.about-brand h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 22px;
}

.about-brand p {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.about-details {
  margin: 0;
  padding: 8px 26px;
}

.about-detail-row {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 15px 0;
}

.about-detail-row + .about-detail-row {
  border-top: 1px solid var(--border-color);
}

.about-detail-row dt {
  color: var(--text-secondary);
  font-size: 12px;
}

.about-detail-row dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  user-select: text;
}

.about-link {
  color: var(--accent-color);
  text-decoration: none;
  word-break: break-all;
}

.about-link:hover {
  text-decoration: underline;
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

.persistence-row > div > strong,
.persistence-row > div > span {
  display: block;
}

.persistence-row > div > span {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.switch {
  position: relative;
  width: 48px;
  min-width: 48px;
  height: 28px;
  min-height: 28px;
  flex: 0 0 48px;
  display: block;
  overflow: hidden;
  font-size: 0;
  line-height: 0;
}

.switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
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
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2);
  transition: transform 0.18s ease;
}

.switch input:checked + .switch-track {
  background: var(--accent-color);
}

.switch input:checked + .switch-track::after {
  transform: translateX(20px);
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
.settings-primary-btn:disabled,
.settings-link-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.model-manager {
  min-height: 400px;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-toolbar);
}

.provider-tree {
  min-width: 0;
  padding: 10px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.provider-tree {
  overflow: auto;
}

.provider-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 4px 12px;
  color: var(--text-primary);
  font-size: 13px;
}

.provider-list-head small {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.provider-tree-item {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 72%, var(--bg-secondary));
}

.provider-tree-item + .provider-tree-item {
  margin-top: 8px;
}

.provider-tree-item:hover,
.provider-tree-item.active {
  border-color: color-mix(in srgb, var(--accent-color) 28%, var(--border-color));
  background: var(--bg-primary);
}

.provider-tree-head {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.provider-tree-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 10px;
}

.provider-model-panel {
  padding: 14px 0 10px;
  border-top: 1px solid var(--border-color);
}

.provider-model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.provider-model-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0;
  color: var(--text-secondary);
}

.provider-model-list-head div {
  min-width: 0;
}

.provider-model-list-head strong,
.provider-model-list-head small {
  display: block;
}

.provider-model-list-head strong {
  color: var(--text-primary);
  font-size: 13px;
}

.provider-model-list-head small {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.provider-model-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(170px, auto) 72px 52px;
  align-items: center;
  gap: 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 58%, var(--bg-primary));
  padding: 10px;
}

.provider-model-row:hover,
.provider-model-row.active {
  border-color: color-mix(in srgb, var(--accent-color) 24%, transparent);
  background: var(--btn-active);
}

.provider-model-name-field,
.provider-model-status {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.provider-model-name-field input {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 0 10px;
  font-size: 12px;
}

.provider-model-name-field input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.provider-model-status > div {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.provider-model-status em {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 3px 7px;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  color: var(--accent-color);
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.provider-model-empty {
  color: var(--text-secondary);
  font-size: 11px;
}

.provider-model-enabled {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 34px;
  justify-items: center;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.provider-model-enabled .switch {
  flex: none;
  margin-top: 0;
}

.provider-model-disabled small {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.provider-model-remove {
  width: auto;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  padding: 0 7px;
  align-self: end;
}

.provider-model-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.provider-model-empty {
  margin: 12px 0 0;
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

.provider-list-item.current:not(.active) {
  border-color: color-mix(in srgb, var(--accent-color) 22%, var(--border-color));
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

.provider-workspace {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding: 18px;
}

.provider-config-panel {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
}

.provider-config-panel {
  padding: 0 18px 6px;
}

.provider-config-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}

.provider-form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-form-actions select {
  min-width: 180px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
}

.provider-form-actions select:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--accent-color);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.detail-kicker {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.provider-config-head h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
}

.model-test-detail-status::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent);
}

.model-form-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
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

.settings-field-half {
  grid-column: span 3;
}

.settings-field-third {
  grid-column: span 2;
}

.settings-field input,
.settings-field select,
.request-template-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.settings-field input,
.settings-field select {
  height: 36px;
  padding: 0 10px;
}

.builtin-key-note strong {
  min-height: 36px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.settings-field input:focus,
.settings-field select:focus,
.request-template-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
}

.custom-headers-section,
.request-template-section {
  padding: 10px 0;
  border-top: 1px solid var(--border-color);
}

.custom-headers-heading,
.request-template-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.custom-headers-heading div,
.request-template-heading div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.custom-headers-heading strong,
.request-template-heading strong {
  color: var(--text-primary);
  font-size: 13px;
}

.custom-headers-heading small,
.request-template-heading small,
.custom-headers-empty {
  color: var(--text-secondary);
  font-size: 11px;
}

.request-template-heading code {
  color: var(--accent-color);
  font-family: Consolas, "Courier New", monospace;
}

.request-template-input {
  min-height: 80px;
  margin-top: 12px;
  padding: 10px 12px;
  resize: vertical;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
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

.persistence-row > .switch {
  width: 48px;
  min-width: 48px;
  height: 28px;
  min-height: 28px;
  flex: 0 0 48px;
  align-self: center;
  margin-top: 0;
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

.model-test-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px);
}

.model-test-detail-modal {
  width: min(1120px, 100%);
  max-height: min(820px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-md);
}

.model-test-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.model-test-detail-header h3 {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-size: 18px;
}

.model-test-detail-status {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  box-shadow: 0 14px 28px color-mix(in srgb, var(--shadow-color) 12%, transparent);
}

.model-test-detail-status.is-passed {
  color: color-mix(in srgb, var(--text-primary) 20%, #16a34a);
  border-color: color-mix(in srgb, #22c55e 36%, var(--border-color));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, #22c55e 22%, var(--bg-primary)),
    color-mix(in srgb, #16a34a 10%, var(--bg-toolbar))
  );
}

.model-test-detail-status.is-failed {
  color: color-mix(in srgb, var(--text-primary) 18%, #dc2626);
  border-color: color-mix(in srgb, #ef4444 38%, var(--border-color));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, #ef4444 22%, var(--bg-primary)),
    color-mix(in srgb, #dc2626 10%, var(--bg-toolbar))
  );
}

.model-test-detail-body {
  min-height: 0;
  overflow: auto;
  padding: 18px 20px 22px;
}

.model-test-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.model-test-detail-meta span {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
}

.model-test-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.model-test-detail-card {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.model-test-detail-card h4 {
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 13px;
}

.model-test-detail-card pre {
  max-height: 400px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  color: var(--text-primary);
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
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
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .settings-nav-item {
    flex: 1 1 calc(50% - 6px);
  }

  .feature-hero,
  .about-brand {
    flex-direction: column;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .feature-hero-badges {
    max-width: none;
    justify-content: flex-start;
  }

  .about-brand {
    align-items: flex-start;
  }

  .model-manager {
    grid-template-columns: 1fr;
  }

  .provider-tree {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .provider-workspace {
    padding: 14px;
  }

  .provider-model-row {
    grid-template-columns: 1fr;
  }

  .settings-section-actions,
  .provider-model-list-head,
  .provider-form-actions {
    flex-direction: column;
  }

  .settings-section-actions,
  .provider-model-list-head,
  .provider-form-actions {
    width: 100%;
    align-items: stretch;
  }

  .model-form-grid {
    grid-template-columns: 1fr;
  }

  .settings-field-half,
  .settings-field-third {
    grid-column: 1 / -1;
  }

  .custom-headers-heading,
  .request-template-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .custom-header-row {
    grid-template-columns: 24px minmax(0, 1fr) 32px;
  }

  .custom-header-row > input:nth-of-type(2) {
    grid-column: 2 / 3;
  }

  .model-test-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
