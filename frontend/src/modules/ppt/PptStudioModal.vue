<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  view: { type: String, default: "status" },
  status: { type: String, default: "checking" },
  artifact: { type: Object, default: null },
  editorHtml: { type: String, default: "" },
  editorUrl: { type: String, default: "" },
  editorDirty: { type: Boolean, default: false },
  isGenerating: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: "" },
  generationJob: { type: Object, default: null },
  generationProgress: { type: Object, default: () => ({}) },
  generationSteps: { type: Array, default: () => [] },
  generationPercent: { type: Number, default: 0 },
  elapsedMs: { type: Number, default: 0 },
  selectedVolume: { type: Number, default: 0 },
  generationDensity: { type: String, default: "standard" },
  generationTargetSlides: { type: Number, default: 0 },
  referenceImages: { type: Array, default: () => [] },
  referenceMode: { type: String, default: "smart" },
  referenceUsage: { type: String, default: "style" },
  referenceStrength: { type: String, default: "balanced" },
  referenceLoading: { type: Boolean, default: false },
  slideRegenerationVisible: { type: Boolean, default: false },
  slideRegenerationLoading: { type: Boolean, default: false },
  slideRegenerationError: { type: String, default: "" },
  slideRegenerationRequestKey: { type: Number, default: 0 },
  slideReferenceImages: { type: Array, default: () => [] },
  slideReferenceLoading: { type: Boolean, default: false },
});

const emit = defineEmits([
  "close",
  "generate",
  "regenerate",
  "continue-generation",
  "cancel-generation",
  "copy-raw-result",
  "open-artifact",
  "open-partial",
  "select-volume",
  "update:generation-density",
  "update:generation-target-slides",
  "update:reference-mode",
  "update:reference-usage",
  "update:reference-strength",
  "choose-reference-files",
  "choose-reference-folder",
  "add-reference-image-url",
  "remove-reference-image",
  "clear-reference-images",
  "close-slide-regeneration",
  "regenerate-slide",
  "choose-slide-reference-files",
  "add-slide-reference-image-url",
  "remove-slide-reference-image",
  "clear-slide-reference-images",
  "save",
  "frame-load",
]);

const hasPartialPages = computed(() => Number(props.generationJob?.completedSlides || 0) > 0);
const failedSlides = computed(() => props.generationJob?.slides?.filter((slide) => slide.status === "failed") || []);
const isPlanning = computed(() => [
  "source-analyzing",
  "source-digesting",
  "source-digested",
  "story-planning",
  "story-retrying",
  "story-planned",
  "design-planned",
].includes(props.generationProgress?.stage || props.generationJob?.stage));
const slideInstruction = ref("");
const referenceImageURL = ref("");
const slideReferenceImageURL = ref("");

watch(() => props.slideRegenerationVisible, (visible, previousVisible) => {
  if (visible && !previousVisible) {
    slideInstruction.value = "";
    slideReferenceImageURL.value = "";
  }
});

function formatElapsed(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function selectDensity(value) {
  emit("update:generation-density", value);
}

function selectPageMode(mode) {
  if (mode === "auto") {
    emit("update:generation-target-slides", 0);
    return;
  }
  emit("update:generation-target-slides", Number(props.generationTargetSlides || props.generationJob?.totalSlides || 12));
}

function updateTargetSlides(value) {
  const pageCount = Math.round(Number(value));
  emit("update:generation-target-slides", Math.max(2, Math.min(500, Number.isFinite(pageCount) ? pageCount : 12)));
}

function adjustTargetSlides(delta) {
  updateTargetSlides(Number(props.generationTargetSlides || props.generationJob?.totalSlides || 12) + delta);
}

function closeSlideRegeneration() {
  if (!props.slideRegenerationLoading) emit("close-slide-regeneration");
}

function confirmSlideRegeneration() {
  const instruction = slideInstruction.value.trim();
  if ((!instruction && !props.slideReferenceImages.length) || props.slideRegenerationLoading) return;
  emit("regenerate-slide", instruction);
}

function addReferenceImageURL() {
  const url = referenceImageURL.value.trim();
  if (!url || props.referenceLoading || props.referenceImages.length >= 8) return;
  referenceImageURL.value = "";
  emit("add-reference-image-url", url);
}

function addSlideReferenceImageURL() {
  const url = slideReferenceImageURL.value.trim();
  if (!url || props.slideReferenceLoading || props.slideReferenceImages.length >= 8) return;
  slideReferenceImageURL.value = "";
  emit("add-slide-reference-image-url", url);
}
</script>

<template>
  <div v-if="visible" class="ppt-backdrop" :class="{ 'ppt-backdrop-editor': view === 'editor' }" role="dialog" aria-modal="true" aria-label="PPT">
    <section class="ppt-modal" :class="{ 'ppt-modal-editor': view === 'editor' }">
      <header class="ppt-header">
        <div class="ppt-header-title">
          <h2>PPT</h2>
          <p v-if="view === 'editor'">
            {{ generationJob?.volumes?.[selectedVolume]?.fileName || artifact?.volumes?.[selectedVolume]?.fileName || artifact?.fileName || "演示文稿" }}
          </p>
          <p v-else>将当前文档生成可编辑的演示文稿</p>
        </div>
        <div class="ppt-header-actions">
          <select
            v-if="view === 'editor' && (generationJob?.volumes?.length || artifact?.volumes?.length) > 1"
            class="ppt-volume-select"
            :value="selectedVolume"
            aria-label="选择 PPT 分卷"
            @change="emit('select-volume', Number($event.target.value))"
          >
            <option
              v-for="(volume, index) in generationJob?.volumes || artifact?.volumes || []"
              :key="volume.index ?? index"
              :value="index"
              :disabled="generationJob && !volume.completedSlides"
            >
              第 {{ index + 1 }} 卷{{ generationJob ? ` · ${volume.completedSlides || 0}/${volume.totalSlides || 0} 页` : "" }}
            </option>
          </select>
          <button v-if="view === 'editor' && editorDirty" class="ppt-btn" type="button" :disabled="isSaving" @click="emit('save')">
            {{ isSaving ? "保存中" : editorDirty ? "保存修改" : "保存" }}
          </button>
          <button class="ppt-icon-btn" type="button" aria-label="关闭" title="关闭" @click="emit('close')">×</button>
        </div>
      </header>

      <template v-if="view === 'editor'">
        <div v-if="isGenerating || status === 'partial' || status === 'paused'" class="ppt-generation-strip">
          <div class="ppt-generation-strip-copy">
            <span v-if="isGenerating" class="ppt-spinner" aria-hidden="true"></span>
            <div>
              <strong>{{ generationProgress?.message || generationJob?.message || "正在继续生成页面" }}</strong>
              <span>
                {{ generationJob?.completedSlides || 0 }} / {{ generationJob?.totalSlides || 0 }} 页
                · {{ formatElapsed(elapsedMs) }}
              </span>
            </div>
          </div>
          <div class="ppt-generation-strip-actions">
            <button v-if="isGenerating" class="ppt-btn" type="button" @click="emit('cancel-generation')">停止</button>
            <button v-else class="ppt-btn ppt-btn-primary" type="button" @click="emit('continue-generation')">继续生成</button>
          </div>
          <div class="ppt-progress-track" aria-label="PPT 生成进度">
            <span :style="{ width: `${generationPercent}%` }"></span>
          </div>
        </div>
        <div class="ppt-editor-body">
          <iframe
            v-if="editorUrl"
            :key="editorUrl"
            class="ppt-editor-frame"
            :src="editorUrl"
            title="PPT 编辑器"
            allowfullscreen
            allow="fullscreen"
            @load="emit('frame-load', $event.currentTarget)"
          ></iframe>
          <iframe
            v-else-if="editorHtml"
            class="ppt-editor-frame"
            :srcdoc="editorHtml"
            title="PPT 编辑器"
            allowfullscreen
            allow="fullscreen"
            @load="emit('frame-load', $event.currentTarget)"
          ></iframe>
        </div>
        <div
          v-if="slideRegenerationVisible"
          class="ppt-slide-ai-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ppt-slide-ai-title"
          @click.self="closeSlideRegeneration"
        >
          <section class="ppt-slide-ai-dialog">
            <div class="ppt-slide-ai-heading">
              <div>
                <h3 id="ppt-slide-ai-title">AI 重新生成当前页</h3>
                <p>只替换当前幻灯片，其他页面和编辑内容会保留。</p>
              </div>
              <button class="ppt-icon-btn" type="button" aria-label="关闭" title="关闭" :disabled="slideRegenerationLoading" @click="closeSlideRegeneration">×</button>
            </div>
            <label class="ppt-slide-ai-label" for="ppt-slide-ai-instruction">生成要求</label>
            <textarea
              id="ppt-slide-ai-instruction"
              v-model="slideInstruction"
              class="ppt-slide-ai-input"
              rows="6"
              maxlength="2000"
              placeholder="例如：改成更简洁的项目复盘页，突出三个关键结论，使用浅色背景和蓝色强调色。"
              :disabled="slideRegenerationLoading"
              @keydown.ctrl.enter.prevent="confirmSlideRegeneration"
            ></textarea>
            <div class="ppt-reference-block ppt-reference-block-slide">
              <div class="ppt-reference-heading">
                <span class="ppt-slide-ai-label">参考图（可选）</span>
                <div class="ppt-reference-actions">
                  <button class="ppt-btn" type="button" :disabled="slideReferenceLoading || slideRegenerationLoading" @click="emit('choose-slide-reference-files')">
                    {{ slideReferenceLoading ? "读取中" : "选择图片" }}
                  </button>
                  <button v-if="slideReferenceImages.length" class="ppt-link-btn" type="button" :disabled="slideRegenerationLoading" @click="emit('clear-slide-reference-images')">清空</button>
                </div>
              </div>
              <div v-if="slideReferenceImages.length" class="ppt-reference-grid">
                <div v-for="(image, index) in slideReferenceImages" :key="image.path" class="ppt-reference-thumb">
                  <img :src="image.dataUrl" :alt="image.name" />
                  <button type="button" :aria-label="`移除${image.name}`" :title="`移除${image.name}`" :disabled="slideRegenerationLoading" @click="emit('remove-slide-reference-image', index)">×</button>
                </div>
              </div>
              <div class="ppt-reference-url">
                <input
                  v-model="slideReferenceImageURL"
                  type="url"
                  inputmode="url"
                  autocomplete="off"
                  placeholder="粘贴公网图片链接"
                  :disabled="slideReferenceLoading || slideRegenerationLoading || slideReferenceImages.length >= 8"
                  @keydown.enter.prevent="addSlideReferenceImageURL"
                />
                <button class="ppt-btn" type="button" :disabled="slideReferenceLoading || slideRegenerationLoading || !slideReferenceImageURL.trim() || slideReferenceImages.length >= 8" @click="addSlideReferenceImageURL">添加链接</button>
              </div>
              <small>参考图只用于视觉风格和版式；当前页已有文字会保留，不会使用图片中的文案。</small>
            </div>
            <p v-if="slideRegenerationError" class="ppt-error">{{ slideRegenerationError }}</p>
            <div class="ppt-actions">
              <button class="ppt-btn" type="button" :disabled="slideRegenerationLoading" @click="closeSlideRegeneration">取消</button>
              <button class="ppt-btn ppt-btn-primary" type="button" :disabled="slideRegenerationLoading || (!slideInstruction.trim() && !slideReferenceImages.length)" @click="confirmSlideRegeneration">
                <span v-if="slideRegenerationLoading" class="ppt-spinner ppt-spinner-inline"></span>
                {{ slideRegenerationLoading ? "生成中" : "开始生成" }}
              </button>
            </div>
          </section>
        </div>
      </template>

      <div v-else class="ppt-status-body">
        <div v-if="status === 'checking'" class="ppt-status-message">
          <span class="ppt-spinner"></span><span>正在检查 PPT 状态</span>
        </div>

        <template v-else-if="status === 'generating'">
          <div class="ppt-generation-heading">
            <span class="ppt-spinner"></span>
            <div>
              <h3>{{ generationProgress?.message || generationJob?.message || "正在生成 PPT" }}</h3>
              <p>{{ generationProgress?.detail || generationJob?.detail || "大型文档会分批生成，已完成页面会立即保存" }}</p>
            </div>
          </div>
          <div class="ppt-progress-summary">
            <strong>{{ isPlanning ? "内容策划中" : `${generationJob?.completedSlides || 0} / ${generationJob?.totalSlides || 0} 页` }}</strong>
            <span>{{ isPlanning ? "准备生成" : `${generationPercent}%` }}</span>
            <span>已用时 {{ formatElapsed(elapsedMs) }}</span>
          </div>
          <div class="ppt-progress-track ppt-progress-track-large"><span :style="{ width: `${generationPercent}%` }"></span></div>
          <div v-if="generationSteps.length" class="ppt-progress-steps">
            <div v-for="step in generationSteps" :key="step.id" class="ppt-progress-step">
              <span class="ppt-step-dot"></span>
              <div>
                <strong>{{ step.message }}</strong>
                <small>{{ step.detail || formatElapsed(step.elapsedMs) }}</small>
              </div>
            </div>
          </div>
          <p v-if="generationProgress?.contentChars" class="ppt-received-count">
            当前批次已接收 {{ generationProgress.contentChars }} 字
          </p>
          <div class="ppt-actions">
            <button class="ppt-btn" type="button" @click="emit('close')">转到后台</button>
            <button class="ppt-btn ppt-btn-danger" type="button" @click="emit('cancel-generation')">停止生成</button>
          </div>
        </template>

        <template v-else-if="status === 'none' || status === 'setup'">
          <h3>{{ status === "setup" ? "重新生成 PPT" : "生成 PPT" }}</h3>
          <p>{{ status === "setup" ? "调整生成设置后创建新版本，已有 PPT 会保留到新版本生成完成。" : "设置内容密度和页数。长文档会分批处理，完成一批即可打开编辑。" }}</p>
          <div class="ppt-setting-block">
            <span class="ppt-setting-label">内容密度</span>
          <div class="ppt-density-control" role="group" aria-label="PPT 内容密度">
            <button
              v-for="option in [
                { value: 'compact', label: '精简' },
                { value: 'standard', label: '标准' },
                { value: 'detailed', label: '详细' },
              ]"
              :key="option.value"
              type="button"
              :class="{ active: generationDensity === option.value }"
              @click="selectDensity(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          </div>
          <div class="ppt-setting-block">
            <span class="ppt-setting-label">生成页数</span>
            <div class="ppt-page-mode" role="group" aria-label="PPT 页数模式">
              <button type="button" :class="{ active: !generationTargetSlides }" @click="selectPageMode('auto')">自动规划</button>
              <button type="button" :class="{ active: generationTargetSlides > 0 }" @click="selectPageMode('custom')">指定页数</button>
            </div>
            <div v-if="generationTargetSlides > 0" class="ppt-page-stepper">
              <button type="button" aria-label="减少一页" title="减少一页" @click="adjustTargetSlides(-1)">−</button>
              <input
                type="number"
                min="2"
                max="500"
                :value="generationTargetSlides"
                aria-label="PPT 生成页数"
                @change="updateTargetSlides($event.target.value)"
              />
              <span>页</span>
              <button type="button" aria-label="增加一页" title="增加一页" @click="adjustTargetSlides(1)">+</button>
            </div>
            <small>{{ generationTargetSlides > 0 ? `生成 ${generationTargetSlides} 页，包含封面` : "根据文档长度和内容密度自动确定页数" }}</small>
          </div>
          <div class="ppt-setting-block ppt-reference-block">
            <div class="ppt-reference-heading">
              <div>
                <span class="ppt-setting-label">参考图片</span>
                <small>{{ referenceImages.length ? `已选择 ${referenceImages.length} 张，最多使用 8 张` : "可选，支持单张、多张图片或整个图片文件夹" }}</small>
              </div>
              <div class="ppt-reference-actions">
                <button class="ppt-btn" type="button" :disabled="referenceLoading" @click="emit('choose-reference-files')">{{ referenceLoading ? "读取中" : "选择图片" }}</button>
                <button class="ppt-btn" type="button" :disabled="referenceLoading" @click="emit('choose-reference-folder')">选择文件夹</button>
                <button v-if="referenceImages.length" class="ppt-link-btn" type="button" @click="emit('clear-reference-images')">清空</button>
              </div>
            </div>
            <div v-if="referenceImages.length" class="ppt-reference-grid">
              <div v-for="(image, index) in referenceImages" :key="image.path" class="ppt-reference-thumb">
                <img :src="image.dataUrl" :alt="image.name" />
                <button type="button" :aria-label="`移除${image.name}`" :title="`移除${image.name}`" @click="emit('remove-reference-image', index)">×</button>
              </div>
            </div>
            <div class="ppt-reference-url">
              <input
                v-model="referenceImageURL"
                type="url"
                inputmode="url"
                autocomplete="off"
                placeholder="粘贴公网图片链接"
                :disabled="referenceLoading || referenceImages.length >= 8"
                @keydown.enter.prevent="addReferenceImageURL"
              />
              <button class="ppt-btn" type="button" :disabled="referenceLoading || !referenceImageURL.trim() || referenceImages.length >= 8" @click="addReferenceImageURL">添加链接</button>
            </div>
            <div v-if="referenceImages.length" class="ppt-reference-options">
              <label>
                <span>分析方式</span>
                <select :value="referenceMode" @change="emit('update:reference-mode', $event.target.value)">
                  <option value="smart">智能分析（推荐）</option>
                  <option value="direct">直接参考图片生成</option>
                </select>
              </label>
              <label>
                <span>参考用途</span>
                <select :value="referenceUsage" @change="emit('update:reference-usage', $event.target.value)">
                  <option value="style">只参考视觉风格</option>
                  <option value="style-content">参考风格与内容组织</option>
                  <option value="content">参考图片内容</option>
                </select>
              </label>
              <label>
                <span>参考强度</span>
                <select :value="referenceStrength" @change="emit('update:reference-strength', $event.target.value)">
                  <option value="subtle">弱</option>
                  <option value="balanced">平衡</option>
                  <option value="strong">强</option>
                </select>
              </label>
            </div>
            <small v-if="referenceImages.length">智能分析会先提取色彩、字体、卡片和版式规律，再用于整套 PPT 策划；直接参考会减少一步分析。</small>
          </div>
          <div class="ppt-actions">
            <button class="ppt-btn" type="button" @click="emit('close')">取消</button>
            <button class="ppt-btn ppt-btn-primary" type="button" @click="emit('generate')">{{ status === "setup" ? "开始重新生成" : "确认生成" }}</button>
          </div>
        </template>

        <template v-else-if="status === 'current'">
          <h3>已存在当前文档的 PPT</h3>
          <p>可以打开已有版本继续设计，也可以重新生成。</p>
          <div class="ppt-actions">
            <button class="ppt-btn" type="button" @click="emit('regenerate')">重新生成</button>
            <button class="ppt-btn ppt-btn-primary" type="button" @click="emit('open-artifact')">打开编辑</button>
          </div>
        </template>

        <template v-else-if="status === 'stale'">
          <h3>文档内容已有变化</h3>
          <p>已有 PPT 是旧版本。你可以打开旧版本，或根据当前文档重新生成。</p>
          <div class="ppt-actions">
            <button class="ppt-btn" type="button" @click="emit('open-artifact')">打开旧版本</button>
            <button class="ppt-btn ppt-btn-primary" type="button" @click="emit('regenerate')">重新生成</button>
          </div>
        </template>

        <template v-else-if="status === 'paused' || status === 'partial' || status === 'generation-failed'">
          <h3>{{ status === "paused" ? "生成已暂停" : status === "partial" ? "部分页面尚未完成" : "PPT 生成未完成" }}</h3>
          <div class="ppt-result-summary">
            <span>已完成 <strong>{{ generationJob?.completedSlides || 0 }}</strong> / {{ generationJob?.totalSlides || 0 }} 页</span>
            <span>用时 {{ formatElapsed(generationJob?.elapsedMs || elapsedMs) }}</span>
            <span v-if="failedSlides.length">失败 {{ failedSlides.length }} 页</span>
          </div>
          <p>{{ generationJob?.detail || error || "已完成页面均已保存，可以从未完成处继续。" }}</p>
          <details v-if="generationJob?.rawContent" class="ppt-raw-result">
            <summary>查看模型返回内容</summary>
            <textarea readonly :value="generationJob.rawContent"></textarea>
            <button class="ppt-btn" type="button" @click="emit('copy-raw-result')">复制返回内容</button>
          </details>
          <div class="ppt-actions ppt-actions-wrap">
            <button class="ppt-btn" type="button" @click="emit('close')">返回</button>
            <button v-if="hasPartialPages" class="ppt-btn" type="button" @click="emit('open-partial')">打开已完成页面</button>
            <button class="ppt-btn" type="button" @click="emit('regenerate')">重新生成</button>
            <button class="ppt-btn ppt-btn-primary" type="button" @click="emit('continue-generation')">继续生成</button>
          </div>
        </template>

        <template v-else>
          <h3>PPT 已生成</h3>
          <p>可以打开生成结果继续调整结构、样式和动效。</p>
          <div class="ppt-actions">
            <button class="ppt-btn" type="button" @click="emit('regenerate')">重新生成</button>
            <button class="ppt-btn ppt-btn-primary" type="button" @click="emit('open-artifact')">打开编辑</button>
          </div>
        </template>

        <p v-if="error && !['partial', 'generation-failed'].includes(status)" class="ppt-error">{{ error }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ppt-backdrop { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .48); }
.ppt-backdrop-editor { padding: 0; background: #fff; }
.ppt-modal { width: min(920px, 100%); max-height: calc(100vh - 48px); overflow: hidden; border: 1px solid rgba(15, 23, 42, .14); border-radius: 8px; background: #fff; box-shadow: 0 24px 80px rgba(15, 23, 42, .28); }
.ppt-modal-editor { width: 100vw; height: 100vh; max-height: none; display: flex; flex-direction: column; border: 0; border-radius: 0; box-shadow: none; }
.ppt-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; border-bottom: 1px solid #e5e7eb; background: #fff; }
.ppt-header-title { min-width: 0; }
.ppt-header h2, .ppt-status-body h3 { margin: 0; color: #111827; }
.ppt-header h2 { font-size: 18px; }
.ppt-header p, .ppt-status-body p { margin: 5px 0 0; color: #64748b; font-size: 13px; line-height: 1.6; }
.ppt-header p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppt-header-actions, .ppt-actions, .ppt-generation-strip-actions { display: flex; align-items: center; gap: 8px; }
.ppt-volume-select { max-width: 210px; height: 34px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #334155; padding: 0 30px 0 10px; font-size: 13px; }
.ppt-icon-btn { width: 32px; height: 32px; flex: 0 0 32px; border: 0; border-radius: 5px; background: transparent; color: #64748b; font-size: 24px; line-height: 1; cursor: pointer; }
.ppt-icon-btn:hover { background: #f1f5f9; color: #111827; }
.ppt-status-body { max-height: calc(100vh - 130px); overflow: auto; padding: 30px; }
.ppt-status-message { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 110px; color: #334155; }
.ppt-generation-heading { display: flex; align-items: flex-start; gap: 12px; }
.ppt-generation-heading .ppt-spinner { margin-top: 3px; }
.ppt-progress-summary, .ppt-result-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; margin-top: 22px; color: #475569; font-size: 13px; }
.ppt-progress-summary strong { color: #111827; font-size: 18px; }
.ppt-progress-track { width: 100%; height: 4px; overflow: hidden; background: #e2e8f0; }
.ppt-progress-track span { display: block; height: 100%; background: #2563eb; transition: width .25s ease; }
.ppt-progress-track-large { height: 7px; margin-top: 10px; border-radius: 4px; }
.ppt-progress-steps { margin-top: 22px; border-top: 1px solid #e5e7eb; }
.ppt-progress-step { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eef2f7; }
.ppt-progress-step div { display: flex; flex: 1; min-width: 0; justify-content: space-between; gap: 16px; }
.ppt-progress-step strong { color: #334155; font-size: 13px; font-weight: 500; }
.ppt-progress-step small { color: #94a3b8; font-size: 12px; text-align: right; }
.ppt-step-dot { width: 7px; height: 7px; flex: 0 0 7px; margin-top: 6px; border-radius: 50%; background: #2563eb; }
.ppt-received-count { margin-top: 12px !important; text-align: right; }
.ppt-actions { justify-content: flex-end; margin-top: 24px; }
.ppt-actions-wrap { flex-wrap: wrap; }
.ppt-btn { min-height: 34px; padding: 0 14px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #334155; font-size: 13px; cursor: pointer; }
.ppt-btn:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }
.ppt-btn-primary { border-color: #2563eb; background: #2563eb; color: #fff; }
.ppt-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.ppt-btn-danger { border-color: #dc2626; color: #b91c1c; }
.ppt-btn:disabled { cursor: wait; opacity: .65; }
.ppt-spinner { display: inline-block; box-sizing: border-box; width: 16px; height: 16px; flex: 0 0 16px; border: 2px solid #cbd5e1; border-top-color: #2563eb; border-radius: 50%; animation: ppt-spin .8s linear infinite; }
.ppt-setting-block { margin-top: 22px; }
.ppt-setting-label { display: block; margin-bottom: 8px; color: #334155; font-size: 13px; font-weight: 600; }
.ppt-density-control, .ppt-page-mode { display: grid; gap: 0; width: min(330px, 100%); border: 1px solid #cbd5e1; border-radius: 5px; overflow: hidden; }
.ppt-density-control { grid-template-columns: repeat(3, 1fr); }
.ppt-page-mode { grid-template-columns: repeat(2, 1fr); }
.ppt-density-control button, .ppt-page-mode button { height: 36px; border: 0; border-right: 1px solid #cbd5e1; background: #fff; color: #475569; cursor: pointer; }
.ppt-density-control button:last-child, .ppt-page-mode button:last-child { border-right: 0; }
.ppt-density-control button.active, .ppt-page-mode button.active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.ppt-page-stepper { display: grid; grid-template-columns: 36px 92px 28px 36px; align-items: center; width: max-content; margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 5px; overflow: hidden; }
.ppt-page-stepper button { width: 36px; height: 36px; border: 0; background: #f8fafc; color: #334155; font-size: 18px; cursor: pointer; }
.ppt-page-stepper input { box-sizing: border-box; width: 92px; height: 36px; border: 0; border-left: 1px solid #cbd5e1; background: #fff; color: #111827; font-size: 14px; text-align: center; }
.ppt-page-stepper span { color: #64748b; font-size: 13px; text-align: center; }
.ppt-setting-block small { display: block; margin-top: 8px; color: #64748b; font-size: 12px; }
.ppt-reference-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.ppt-reference-heading .ppt-setting-label, .ppt-reference-heading .ppt-slide-ai-label { margin: 0; }
.ppt-reference-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; }
.ppt-link-btn { border: 0; background: transparent; color: #2563eb; font-size: 12px; cursor: pointer; }
.ppt-reference-grid { display: grid; grid-template-columns: repeat(8, minmax(42px, 1fr)); gap: 8px; margin-top: 12px; }
.ppt-reference-thumb { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid #dbe3ee; border-radius: 5px; background: #f1f5f9; }
.ppt-reference-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ppt-reference-thumb button { position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: rgba(15, 23, 42, .72); color: #fff; font-size: 16px; line-height: 18px; cursor: pointer; }
	.ppt-reference-url { display: flex; gap: 8px; margin-top: 12px; }
	.ppt-reference-url input { box-sizing: border-box; min-width: 0; height: 34px; flex: 1; border: 1px solid #cbd5e1; border-radius: 5px; padding: 0 10px; color: #334155; font-size: 12px; }
	.ppt-reference-url input:focus { border-color: #2563eb; outline: 2px solid rgba(37, 99, 235, .14); }
	.ppt-reference-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin-top: 12px; }
.ppt-reference-options label { display: grid; gap: 5px; color: #64748b; font-size: 12px; }
.ppt-reference-options select { width: 100%; min-width: 0; height: 32px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #334155; padding: 0 7px; font-size: 12px; }
.ppt-reference-block-slide { margin-top: 16px; }
.ppt-reference-block-slide small { margin-top: 8px; }
.ppt-generation-strip { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 9px 16px 12px; border-bottom: 1px solid #dbe4ef; background: #f8fafc; }
.ppt-generation-strip-copy { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ppt-generation-strip-copy div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 12px; min-width: 0; }
.ppt-generation-strip-copy strong { color: #1e293b; font-size: 13px; }
.ppt-generation-strip-copy span { color: #64748b; font-size: 12px; }
.ppt-generation-strip .ppt-progress-track { position: absolute; left: 0; right: 0; bottom: 0; }
.ppt-editor-body { flex: 1; min-height: 0; background: #eef2f7; }
.ppt-editor-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
.ppt-slide-ai-backdrop { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .32); }
.ppt-slide-ai-dialog { width: min(520px, 100%); padding: 22px; border: 1px solid #dbe3ee; border-radius: 8px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, .24); }
.ppt-slide-ai-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.ppt-slide-ai-heading h3 { margin: 0; color: #111827; font-size: 17px; }
.ppt-slide-ai-heading p { margin: 6px 0 0; color: #64748b; font-size: 13px; line-height: 1.6; }
.ppt-slide-ai-label { display: block; margin-top: 20px; margin-bottom: 8px; color: #334155; font-size: 13px; font-weight: 600; }
.ppt-slide-ai-input { display: block; box-sizing: border-box; width: 100%; min-height: 130px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 5px; padding: 10px 12px; color: #1f2937; font: 13px/1.6 inherit; }
.ppt-slide-ai-input:focus { border-color: #2563eb; outline: 2px solid rgba(37, 99, 235, .14); }
.ppt-spinner-inline { width: 12px; height: 12px; margin-right: 6px; vertical-align: -2px; }
.ppt-result-summary { margin: 18px 0 4px; padding: 12px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
.ppt-raw-result { margin-top: 18px; color: #334155; font-size: 13px; }
.ppt-raw-result summary { cursor: pointer; font-weight: 600; }
.ppt-raw-result textarea { width: 100%; height: 180px; margin: 10px 0 8px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; background: #f8fafc; color: #334155; font: 12px/1.5 Consolas, monospace; }
.ppt-error { margin-top: 18px !important; color: #b91c1c !important; white-space: pre-wrap; }
@keyframes ppt-spin { to { transform: rotate(360deg); } }
@media (max-width: 720px) {
  .ppt-backdrop { padding: 0; }
  .ppt-modal, .ppt-modal-editor { width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0; }
  .ppt-status-body { max-height: none; padding: 24px 20px; }
  .ppt-header { padding: 12px; }
  .ppt-volume-select { max-width: 150px; }
  .ppt-generation-strip { align-items: flex-start; }
  .ppt-progress-step div { display: block; }
  .ppt-progress-step small { display: block; margin-top: 3px; text-align: left; }
  .ppt-reference-heading { display: block; }
	  .ppt-reference-actions { justify-content: flex-start; margin-top: 9px; }
	  .ppt-reference-url { align-items: stretch; }
	  .ppt-reference-url .ppt-btn { flex: 0 0 auto; }
  .ppt-reference-grid { grid-template-columns: repeat(4, minmax(42px, 1fr)); }
  .ppt-reference-options { grid-template-columns: 1fr; }
}
</style>
