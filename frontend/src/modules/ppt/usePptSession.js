import { computed, onUnmounted, ref } from "vue";
import { createBentoHtml, collectMarkdownAssets, normalizeBentoJson, repairBentoHtml, sha256Hex } from "./bentoDocument";

const PPT_SHELL_VERSION = "3";
const PPT_PROMPT_VERSION = "4";
const JOB_REFRESH_STAGES = new Set([
  "source-analyzing",
  "source-digesting",
  "source-digested",
  "story-planning",
  "story-retrying",
  "story-planned",
  "design-planned",
  "planning-failed",
  "planned",
  "resuming",
  "batch-started",
  "batch-completed",
  "batch-failed",
  "partial-completed",
  "completed",
  "paused",
  "failed",
]);

function errorMessage(error) {
  return error?.message || String(error || "未知错误");
}

function baseName(fileName) {
  const value = String(fileName || "未命名文档").trim();
  return value.replace(/\.(?:markdown?|md|txt)$/i, "") || "未命名文档";
}

function isJobActive(job) {
  return job?.status === "running" || job?.status === "pausing";
}

function hasGeneratedPages(job) {
  return Number(job?.completedSlides || 0) > 0 && job?.volumes?.some((volume) => volume?.documentJson);
}

function volumeHtmlFromArtifact(artifact, index) {
  if (Array.isArray(artifact?.volumes) && artifact.volumes[index]?.html) {
    return artifact.volumes[index].html;
  }
  return index === 0 ? String(artifact?.html || "") : "";
}

export function usePptSession({
  pptArtifactShell,
  fileShell,
  readImageAsBase64,
  aiClient,
  activeModel,
  shellHtml,
  editedContent,
  markdownContent,
  filePath,
  fileName,
  hasDocumentContent,
  showToast,
  windowShell,
}) {
  const visible = ref(false);
  const view = ref("status");
  const status = ref("checking");
  const artifact = ref(null);
  const sourceHash = ref("");
  const sourcePath = ref("");
  const editorHtml = ref("");
  const editorUrl = ref("");
  const editorDirty = ref(false);
  const isGenerating = ref(false);
  const isSaving = ref(false);
  const error = ref("");
  const frameRef = ref(null);
  const generationJob = ref(null);
  const generationProgress = ref({
    stage: "",
    message: "",
    detail: "",
    contentChars: 0,
    elapsedMs: 0,
  });
  const generationSteps = ref([]);
  const elapsedMs = ref(0);
  const selectedVolume = ref(0);
  const generationDensity = ref("standard");
  const generationTargetSlides = ref(0);
  const referenceImages = ref([]);
  const referenceMode = ref("smart");
  const referenceUsage = ref("style");
  const referenceStrength = ref("balanced");
  const referenceLoading = ref(false);
  const completionAnnouncedJobId = ref("");
  const slideRegenerationVisible = ref(false);
  const slideRegenerationLoading = ref(false);
  const slideRegenerationError = ref("");
  const slideRegenerationRequestKey = ref(0);
  const pendingSlideRegeneration = ref(null);
  const slideReferenceImages = ref([]);
  const slideReferenceLoading = ref(false);

  let dirtyTimer = null;
  let stopDirtySubscription = null;
  let editorBaseline = null;
  let elapsedTimer = null;
  let jobPollTimer = null;
  let refreshPromise = null;
  let refreshQueued = false;
  let pptWindowFullscreenOwned = false;
  let pptDocumentFullscreenOwned = false;
  const savedVolumeDocuments = new Map();

  function editorFrame(value = frameRef.value) {
    const candidate = value?.currentTarget || value?.target || value;
    return candidate?.contentWindow ? candidate : null;
  }

  function editorBridge(value = frameRef.value) {
    const frame = editorFrame(value);
    try {
      return frame?.contentWindow?.__mdPptBento || frame?.contentWindow?.bento || null;
    } catch {
      return null;
    }
  }

  function waitForEditorBridge(value = frameRef.value, timeoutMs = 10000) {
    const frame = editorFrame(value);
    const immediate = editorBridge(frame);
    if (immediate?.serialize || !frame) return Promise.resolve(immediate || null);

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        const bridge = editorBridge(frame);
        if (bridge?.serialize || Date.now() - startedAt >= timeoutMs) {
          resolve(bridge || null);
          return;
        }
        window.setTimeout(check, 50);
      };
      check();
    });
  }

  const generationPercent = computed(() => {
    const total = Number(generationJob.value?.totalSlides || 0);
    const completed = Number(generationJob.value?.completedSlides || 0);
    return total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;
  });

  const currentVolume = computed(() => {
    return generationJob.value?.volumes?.[selectedVolume.value] || artifact.value?.volumes?.[selectedVolume.value] || null;
  });

  function currentSourcePath() {
    return String(filePath.value || fileName.value || "未命名文档").trim();
  }

  function hasPersistedPptSource() {
    return Boolean(String(filePath?.value || "").trim());
  }

  function ensurePersistedPptSource() {
    if (hasPersistedPptSource()) return true;
    setError("请先打开或保存需要生成 PPT 的文档，避免把未打开文件中的示例内容当作生成来源");
    return false;
  }

  function currentFileName() {
    return `${baseName(fileName.value)}.bento.html`;
  }

  function normalizeReferencePaths(paths) {
    const result = [];
    const seen = new Set();
    for (const path of Array.isArray(paths) ? paths : []) {
      const normalized = String(path || "").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= 8) break;
    }
    return result;
  }

  function normalizeReferenceImageURL(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
      return parsed.href;
    } catch {
      showToast?.("请输入完整的 http 或 https 图片链接", "error");
      return "";
    }
  }

  async function appendReferenceImages(target, paths, loadingState) {
    const current = Array.isArray(target.value) ? target.value : [];
    const existing = new Set(current.map((item) => item.path));
    const remaining = Math.max(0, 8 - current.length);
    const normalized = normalizeReferencePaths(paths)
      .filter((path) => !existing.has(path))
      .slice(0, remaining);
    if (!normalized.length) return;
    loadingState.value = true;
    try {
      const loaded = await Promise.all(normalized.map(async (path) => {
        const dataUrl = await readImageAsBase64?.(path);
        if (!String(dataUrl || "").startsWith("data:image/")) {
          throw new Error(`无法读取图片：${baseName(path)}`);
        }
        return { path, name: baseName(path), dataUrl };
      }));
      const seen = new Set(current.map((item) => item.path));
      target.value = [...current, ...loaded.filter((item) => !seen.has(item.path))].slice(0, 8);
    } catch (requestError) {
      showToast?.(`读取参考图失败：${errorMessage(requestError)}`, "error");
    } finally {
      loadingState.value = false;
    }
  }

  async function chooseReferenceFiles() {
    const paths = await fileShell?.openImageFiles?.();
    await appendReferenceImages(referenceImages, paths, referenceLoading);
  }

  async function chooseReferenceFolder() {
	const directory = await fileShell?.openDirectory?.();
	if (!directory) return;
    const paths = await fileShell?.listImageFiles?.(directory);
    if (!Array.isArray(paths) || !paths.length) {
      showToast?.("所选文件夹没有可用的参考图片", "error");
      return;
    }
	await appendReferenceImages(referenceImages, paths, referenceLoading);
  }

  async function addReferenceImageURL(value) {
    const url = normalizeReferenceImageURL(value);
    if (!url) return;
    await appendReferenceImages(referenceImages, [url], referenceLoading);
  }

  async function chooseSlideReferenceFiles() {
	const paths = await fileShell?.openImageFiles?.();
	await appendReferenceImages(slideReferenceImages, paths, slideReferenceLoading);
  }

  async function addSlideReferenceImageURL(value) {
    const url = normalizeReferenceImageURL(value);
    if (!url) return;
    await appendReferenceImages(slideReferenceImages, [url], slideReferenceLoading);
  }

  function removeReferenceImage(index) {
    referenceImages.value = referenceImages.value.filter((_, itemIndex) => itemIndex !== index);
  }

  function clearReferenceImages() {
    referenceImages.value = [];
  }

  function removeSlideReferenceImage(index) {
    slideReferenceImages.value = slideReferenceImages.value.filter((_, itemIndex) => itemIndex !== index);
  }

  function clearSlideReferenceImages() {
    slideReferenceImages.value = [];
  }

  async function loadEditorDocument(fallbackHTML, documentJson, {
    forceCurrentShell = false,
  } = {}) {
    frameRef.value = null;
    stopDirtyPolling();
    editorUrl.value = "";
    editorHtml.value = "";
    // A packaged Wails WebView can return the host SPA for a relative iframe
    // asset URL. The saved Bento HTML is validated before storage, and srcdoc
    // keeps the editor bridge in one stable document in both dev and release.
    const html = forceCurrentShell && documentJson
      ? createBentoHtml(shellHtml, documentJson)
      : fallbackHTML
      ? repairBentoHtml(fallbackHTML, shellHtml)
      : createBentoHtml(shellHtml, documentJson);
    if (!String(html || "").trim()) return false;
    editorHtml.value = html;
    return true;
  }

  function isCurrentArtifact(record, hash) {
    return Boolean(
      record?.html &&
        record.sourceHash === hash &&
        String(record.shellVersion || "") === PPT_SHELL_VERSION &&
        String(record.promptVersion || "") === PPT_PROMPT_VERSION
    );
  }

  function artifactNeedsCurrentShell(record = artifact.value) {
    return Boolean(record?.html && String(record.shellVersion || "") !== PPT_SHELL_VERSION);
  }

  function setError(message, toast = true) {
    error.value = message;
    if (toast) showToast?.(message, "error");
  }

  function clearError() {
    error.value = "";
  }

  async function resolveCurrentHash() {
    return sha256Hex(String(editedContent?.value || markdownContent.value || ""));
  }

  function buildGenerationRequest() {
    const markdown = String(editedContent?.value || markdownContent.value || "").trim();
    const model = typeof activeModel === "function" ? activeModel() : activeModel?.value;
    return {
      markdown,
      sourcePath: sourcePath.value,
      sourceHash: sourceHash.value,
      fileName: currentFileName(),
      assetManifest: JSON.stringify(collectMarkdownAssets(markdown)),
      instruction: "使用中性中文视觉风格，不添加任何品牌、Logo、官网或宣传语。",
      density: generationDensity.value,
      targetSlides: Number(generationTargetSlides.value || 0),
      batchSize: 3,
      referenceImages: referenceImages.value.map((item) => item.path),
      referenceMode: referenceMode.value,
      referenceUsage: referenceUsage.value,
      referenceStrength: referenceStrength.value,
      model,
    };
  }

  function ensureGenerationReady() {
    if (!ensurePersistedPptSource()) return null;
    const request = buildGenerationRequest();
    if (!request.model || !aiClient?.supports?.("incrementalPresentation")) {
      setError("请先在模型设置中配置并启用 AI 模型");
      return null;
    }
    if (!request.markdown) {
      setError("当前文档没有可生成 PPT 的内容");
      return null;
    }
    return request;
  }

  function addGenerationStep(progress) {
    const message = String(progress?.message || "").trim();
    if (!message) return;
    const next = {
      id: `${Date.now()}-${progress.stage || "progress"}`,
      stage: progress.stage || "",
      message,
      detail: String(progress.detail || "").trim(),
      elapsedMs: Number(progress.elapsedMs || elapsedMs.value || 0),
    };
    const previous = generationSteps.value[generationSteps.value.length - 1];
    if (previous?.stage === next.stage && previous?.message === next.message && previous?.detail === next.detail) {
      generationSteps.value = [...generationSteps.value.slice(0, -1), next];
      return;
    }
    generationSteps.value = [...generationSteps.value, next].slice(-8);
  }

  function startElapsedClock() {
    stopElapsedClock();
    const tick = () => {
      const startedAt = Number(generationJob.value?.startedAt || 0);
      elapsedMs.value = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : Number(generationProgress.value.elapsedMs || 0);
    };
    tick();
    elapsedTimer = window.setInterval(tick, 1000);
  }

  function stopElapsedClock() {
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function startJobPolling() {
    stopJobPolling();
    jobPollTimer = window.setInterval(() => {
      if (isJobActive(generationJob.value)) void refreshGenerationJob();
    }, 1800);
  }

  function stopJobPolling() {
    if (jobPollTimer) {
      window.clearInterval(jobPollTimer);
      jobPollTimer = null;
    }
  }

  function generatedArtifactFromJob(job, volumeHTMLs = []) {
    const volumes = (job?.volumes || []).map((volume, index) => ({
      index,
      fileName: volume.fileName || `${baseName(fileName.value)}-${String(index + 1).padStart(2, "0")}.bento.html`,
      html: volumeHTMLs[index] || volumeHtmlFromArtifact(artifact.value, index),
      updatedAt: job.updatedAt || Date.now(),
    }));
    return {
      sourcePath: sourcePath.value,
      sourceHash: sourceHash.value,
      fileName: volumes[0]?.fileName || currentFileName(),
      html: volumes[0]?.html || "",
      updatedAt: job?.updatedAt || Date.now(),
      shellVersion: PPT_SHELL_VERSION,
      promptVersion: PPT_PROMPT_VERSION,
      volumes,
    };
  }

  async function persistGeneratedVolumes(job) {
    if (!job?.volumes?.length || !pptArtifactShell?.available) return;
    const volumeHTMLs = job.volumes.map((_, index) => volumeHtmlFromArtifact(artifact.value, index));
    for (const volume of job.volumes) {
      if (!volume?.documentJson || Number(volume.completedSlides || 0) <= 0) continue;
      const index = Number(volume.index || 0);
      if (savedVolumeDocuments.get(index) === volume.documentJson) continue;

      let html = "";
      const bento = index === selectedVolume.value ? editorBridge() : null;
      if (bento?.mergeGeneratedDoc) {
        const merged = bento.mergeGeneratedDoc(normalizeBentoJson(volume.documentJson));
        if (merged === null) throw new Error(`第 ${index + 1} 卷增量合并失败`);
        html = repairBentoHtml(String(bento.serialize() || ""), shellHtml);
      } else {
        html = createBentoHtml(shellHtml, volume.documentJson);
      }
      await pptArtifactShell.saveArtifactVolume(
        sourcePath.value,
        sourceHash.value,
        volume.fileName || currentFileName(),
        index,
        job.volumes.length,
        html
      );
      volumeHTMLs[index] = html;
      savedVolumeDocuments.set(index, volume.documentJson);
    }

    artifact.value = generatedArtifactFromJob(job, volumeHTMLs);
    if (selectedVolume.value === 0) artifact.value.html = volumeHTMLs[0] || artifact.value.html;
  }

  async function showGeneratedVolume(index = 0, { merge = true } = {}) {
    const jobVolume = generationJob.value?.volumes?.[index];
    const artifactHTML = volumeHtmlFromArtifact(artifact.value, index);
    if (!jobVolume?.documentJson && !artifactHTML) return false;
    if (selectedVolume.value !== index && frameRef.value && editorDirty.value) {
      if (!(await saveEditor())) return false;
    }
    selectedVolume.value = index;
    clearError();
    const bento = editorBridge();
    if (merge && bento?.mergeGeneratedDoc && jobVolume?.documentJson) {
      bento.mergeGeneratedDoc(normalizeBentoJson(jobVolume.documentJson));
      editorDirty.value = true;
      view.value = "editor";
      status.value = isGenerating.value ? "generating" : "editing";
      return true;
    }
    if (!(await loadEditorDocument(artifactHTML, jobVolume?.documentJson, {
      forceCurrentShell: artifactNeedsCurrentShell(),
    }))) {
      setError("PPT 文件尚未准备好，请稍后重试");
      return false;
    }
    editorDirty.value = false;
    view.value = "editor";
    status.value = isGenerating.value ? "generating" : "editing";
    return true;
  }

  async function applyGenerationJob(job, { openEditor = true } = {}) {
    if (!job) return;
    generationJob.value = job;
    if (["compact", "standard", "detailed"].includes(job.density)) {
      generationDensity.value = job.density;
    }
    generationTargetSlides.value = Number(job.targetSlides || 0);
    isGenerating.value = isJobActive(job);
    elapsedMs.value = Number(job.elapsedMs || 0);
    generationProgress.value = {
      ...generationProgress.value,
      stage: job.stage || generationProgress.value.stage,
      message: job.message || generationProgress.value.message,
      detail: job.detail || generationProgress.value.detail,
      elapsedMs: Number(job.elapsedMs || generationProgress.value.elapsedMs || 0),
    };

    if (isGenerating.value) {
      status.value = "generating";
      startElapsedClock();
      startJobPolling();
    } else {
      stopElapsedClock();
      stopJobPolling();
      if (job.status === "paused") status.value = "paused";
      else if (job.status === "partial") status.value = "partial";
      else if (job.status === "completed") status.value = "completed";
      else if (job.status === "failed") status.value = "generation-failed";
    }

    if (hasGeneratedPages(job)) {
      try {
        await persistGeneratedVolumes(job);
        if (openEditor && visible.value && view.value !== "editor") {
          const firstReady = Math.max(0, job.volumes.findIndex((volume) => Number(volume.completedSlides || 0) > 0));
          await showGeneratedVolume(firstReady, { merge: false });
        }
      } catch (persistError) {
        setError(`保存增量 PPT 失败：${errorMessage(persistError)}`);
      }
    }

    if (job.status === "completed" && completionAnnouncedJobId.value !== job.jobId) {
      completionAnnouncedJobId.value = job.jobId;
      showToast?.(`PPT 已生成，共 ${job.totalSlides} 页`, "success");
    }
    if (job.status === "partial") {
      error.value = job.error || job.detail || "部分页面未生成，可以继续补充";
    } else if (job.status === "failed") {
      error.value = job.error || "PPT 生成失败";
    }
  }

  async function refreshGenerationJob({ openEditor = true } = {}) {
    if (!sourcePath.value || !aiClient?.supports?.("incrementalPresentation")) return null;
    if (refreshPromise) {
      refreshQueued = true;
      return refreshPromise;
    }
    refreshPromise = aiClient
      .getPresentationGeneration(sourcePath.value)
      .then(async (job) => {
        if (job) await applyGenerationJob(job, { openEditor });
        return job;
      })
      .finally(() => {
        refreshPromise = null;
        if (refreshQueued) {
          refreshQueued = false;
          void refreshGenerationJob({ openEditor });
        }
      });
    return refreshPromise;
  }

  async function openPpt() {
    if (!ensurePersistedPptSource()) return;
    if (!hasDocumentContent.value) {
      setError("当前文档没有可生成 PPT 的内容");
      return;
    }
    if (!pptArtifactShell?.available) {
      setError("PPT 功能只能在桌面应用中使用");
      return;
    }

    visible.value = true;
    view.value = "status";
    status.value = "checking";
    clearError();
    sourcePath.value = currentSourcePath();
    sourceHash.value = await resolveCurrentHash();
    savedVolumeDocuments.clear();
    try {
      const [savedArtifact, job] = await Promise.all([
        pptArtifactShell.getArtifact(sourcePath.value),
        aiClient?.supports?.("incrementalPresentation")
          ? aiClient.getPresentationGeneration(sourcePath.value)
          : Promise.resolve(null),
      ]);
      artifact.value = savedArtifact;
      if (job && job.sourceHash === sourceHash.value && ["running", "paused", "partial", "failed"].includes(job.status)) {
        await applyGenerationJob(job, { openEditor: job.status === "running" && hasGeneratedPages(job) });
        if (job.status !== "running") view.value = "status";
        return;
      }
      generationJob.value = job && job.sourceHash === sourceHash.value ? job : null;
      if (generationJob.value) {
        if (["compact", "standard", "detailed"].includes(generationJob.value.density)) {
          generationDensity.value = generationJob.value.density;
        }
        generationTargetSlides.value = Number(generationJob.value.targetSlides || 0);
      }
      status.value = savedArtifact
        ? isCurrentArtifact(savedArtifact, sourceHash.value)
          ? "current"
          : "stale"
        : "none";
    } catch (requestError) {
      artifact.value = null;
      status.value = "none";
      setError(`读取 PPT 状态失败：${errorMessage(requestError)}`);
    }
  }

  async function generatePpt() {
    if (isGenerating.value) return;
    const request = ensureGenerationReady();
    if (!request) return;
    clearError();
    generationSteps.value = [];
    generationProgress.value = { stage: "starting", message: "正在理解文档并规划 PPT", detail: "", contentChars: 0, elapsedMs: 0 };
    isGenerating.value = true;
    status.value = "generating";
    view.value = "status";
    editorHtml.value = "";
    editorUrl.value = "";
    frameRef.value = null;
    selectedVolume.value = 0;
    savedVolumeDocuments.clear();
    try {
      const job = await aiClient.startPresentationGeneration(request);
      await applyGenerationJob(job, { openEditor: false });
    } catch (requestError) {
      isGenerating.value = false;
      status.value = artifact.value ? "stale" : "generation-failed";
      setError(`启动 PPT 生成失败：${errorMessage(requestError)}`);
    }
  }

  async function regeneratePpt() {
    if (isGenerating.value) return;
    clearError();
    view.value = "status";
    status.value = "setup";
  }

  async function continueGeneration() {
    if (isGenerating.value) return;
    const request = ensureGenerationReady();
    if (!request) return;
    clearError();
    isGenerating.value = true;
    status.value = "generating";
    try {
      const job = await aiClient.resumePresentationGeneration(request);
      await applyGenerationJob(job, { openEditor: hasGeneratedPages(job) });
    } catch (requestError) {
      isGenerating.value = false;
      status.value = "generation-failed";
      setError(`继续生成失败：${errorMessage(requestError)}`);
    }
  }

  async function cancelGeneration() {
    if (!isGenerating.value) return;
    try {
      await aiClient.cancelPresentationGeneration(sourcePath.value);
      generationProgress.value = {
        ...generationProgress.value,
        stage: "cancelling",
        message: "正在停止生成，已完成页面会保留",
      };
    } catch (cancelError) {
      setError(`停止生成失败：${errorMessage(cancelError)}`);
    }
  }

  async function copyRawResult() {
    const raw = String(generationJob.value?.rawContent || "");
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      showToast?.("模型返回内容已复制", "success");
    } catch (copyError) {
      setError(`复制失败：${errorMessage(copyError)}`);
    }
  }

  function documentSnapshot(bento = editorBridge()) {
    try {
      if (!bento || typeof bento.doc !== "object" || !bento.doc) return null;
      return JSON.stringify(bento.doc);
    } catch {
      return null;
    }
  }

  function captureEditorBaseline(bento = editorBridge()) {
    editorBaseline = documentSnapshot(bento);
    editorDirty.value = false;
  }

  function syncEditorDirty(frame = frameRef.value, bento = editorBridge(frame)) {
    if (frameRef.value !== frame) return;
    const snapshot = documentSnapshot(bento);
    if (snapshot === null || editorBaseline === null) return;
    editorDirty.value = snapshot !== editorBaseline;
  }

  function startDirtyPolling(frame = frameRef.value, bento = editorBridge(frame)) {
    stopDirtyPolling();
    if (!bento?.serialize || frameRef.value !== frame) return;

    const sync = () => syncEditorDirty(frame, bento);
    if (typeof bento.onDocumentChange === "function") {
      try {
        const unsubscribe = bento.onDocumentChange(sync);
        if (typeof unsubscribe === "function") stopDirtySubscription = unsubscribe;
      } catch {
        // Older saved shells may not support cross-frame subscriptions.
      }
    }

    // The event path is immediate in the current shell. This fallback keeps
    // externally supplied legacy Bento documents functional as well.
    dirtyTimer = window.setInterval(sync, 1500);
    sync();
  }

  function stopDirtyPolling() {
    if (dirtyTimer) {
      window.clearInterval(dirtyTimer);
      dirtyTimer = null;
    }
    if (stopDirtySubscription) {
      try {
        stopDirtySubscription();
      } catch {
        // A disposed iframe can reject the final unsubscribe call.
      }
      stopDirtySubscription = null;
    }
  }

  function handleFrameLoad(frameOrEvent) {
    const frame = editorFrame(frameOrEvent);
    if (!frame) return;
    frameRef.value = frame;
    stopDirtyPolling();
    void waitForEditorBridge(frame, 12000).then(async (bento) => {
      if (frameRef.value !== frame) return;
      if (!bento?.serialize) {
        setError("PPT 编辑器加载失败，请重新打开或重新生成", false);
        return;
      }
      const volume = generationJob.value?.volumes?.[selectedVolume.value];
      if (volume?.documentJson && bento?.mergeGeneratedDoc) {
        bento.mergeGeneratedDoc(normalizeBentoJson(volume.documentJson));
      }
      captureEditorBaseline(bento);
      try {
        bento.markClean?.();
      } catch {
        // The outer save state remains correct even if a legacy bridge lacks it.
      }
      startDirtyPolling(frame, bento);
    });
  }

  async function enterPresentFullscreen() {
    if (pptWindowFullscreenOwned || pptDocumentFullscreenOwned) return;

    if (windowShell?.available && typeof windowShell.enterFullscreen === "function") {
      try {
        const alreadyFullscreen = typeof windowShell.isFullscreen === "function"
          ? await windowShell.isFullscreen()
          : false;
        if (!alreadyFullscreen) {
          windowShell.enterFullscreen();
          pptWindowFullscreenOwned = true;
        }
        return;
      } catch {
        // Fall through to the browser fullscreen API when the native bridge is unavailable.
      }
    }

    const root = document.documentElement;
    if (document.fullscreenElement || typeof root?.requestFullscreen !== "function") return;
    try {
      await root.requestFullscreen({ navigationUI: "hide" });
      pptDocumentFullscreenOwned = true;
    } catch {
      // The iframe's own fullscreen request remains the browser fallback.
    }
  }

  function exitPresentFullscreen() {
    if (pptWindowFullscreenOwned) {
      try {
        windowShell?.exitFullscreen?.();
      } catch {
        // The native window may already have been closed or restored by the OS.
      }
      pptWindowFullscreenOwned = false;
    }

    if (pptDocumentFullscreenOwned && document.fullscreenElement) {
      document.exitFullscreen?.().catch?.(() => {});
    }
    pptDocumentFullscreenOwned = false;
  }

  function handleFrameMessage(event) {
    const frame = editorFrame(frameRef.value);
    if (event.source !== frame?.contentWindow) return;
    const payload = event.data;
    if (payload?.type === "md-ppt-enter-present-fullscreen") {
      void enterPresentFullscreen();
      return;
    }
    if (payload?.type === "md-ppt-exit-present-fullscreen") {
      exitPresentFullscreen();
      return;
    }
    if (payload?.type === "md-ppt-save") {
      if (view.value === "editor" && editorDirty.value) void saveEditor();
      return;
    }
    if (!payload || payload.type !== "md-ppt-regenerate-slide" || !payload.slide) return;
    if (slideRegenerationLoading.value) return;
    const slideIndex = Number(payload.slideIndex);
    if (!Number.isInteger(slideIndex) || slideIndex < 0) return;
    const liveSlide = editorBridge(frame)?.doc?.slides?.[slideIndex];
    if (!liveSlide) return;
    pendingSlideRegeneration.value = {
      requestId: String(payload.requestId || `${Date.now()}-${slideIndex}`),
      slideIndex,
      slide: JSON.parse(JSON.stringify(liveSlide)),
    };
    slideReferenceImages.value = [];
    slideRegenerationError.value = "";
    slideRegenerationRequestKey.value += 1;
    slideRegenerationVisible.value = true;
  }

  function closeSlideRegeneration() {
    if (slideRegenerationLoading.value) return;
    slideRegenerationVisible.value = false;
    slideRegenerationError.value = "";
    pendingSlideRegeneration.value = null;
  }

  async function regenerateCurrentSlide(instruction) {
    if (slideRegenerationLoading.value) return;
    const pending = pendingSlideRegeneration.value;
    const bento = editorBridge();
    if (!pending || !bento?.replaceCurrentSlide) {
      slideRegenerationError.value = "当前 PPT 页面还没有准备好";
      return;
    }
    if (!aiClient?.supports?.("presentationSlide")) {
      slideRegenerationError.value = "当前环境不支持 AI 单页重新生成";
      return;
    }
    const model = typeof activeModel === "function" ? activeModel() : activeModel?.value;
    if (!model) {
      slideRegenerationError.value = "请先在模型设置中配置并启用 AI 模型";
      return;
    }
    const normalizedInstruction = String(instruction || "").trim();
    const references = slideReferenceImages.value.map((item) => item.path);
    if (!normalizedInstruction && !references.length) return;

    slideRegenerationLoading.value = true;
    slideRegenerationError.value = "";
    try {
      const document = bento.doc || {};
      const result = await aiClient.regeneratePresentationSlide({
        slide: pending.slide,
        context: {
          title: document.title || "",
          size: document.size || { width: 1280, height: 720 },
          theme: document.theme || {},
          slideIndex: pending.slideIndex,
          totalSlides: Array.isArray(document.slides) ? document.slides.length : 0,
        },
        instruction: normalizedInstruction,
        referenceImages: references,
        model,
      });
      let replacement = typeof result === "string" ? JSON.parse(result) : result;
      if (replacement?.slide && typeof replacement.slide === "object") replacement = replacement.slide;
      if (Array.isArray(replacement?.slides)) replacement = replacement.slides[0];
      if (!replacement || typeof replacement !== "object") throw new Error("AI 未返回有效的单页内容");
      const existingSlide = bento.doc?.slides?.[pending.slideIndex];
      replacement = { ...replacement, id: existingSlide?.id || pending.slide.id || replacement.id };
      if (!bento.replaceCurrentSlide(replacement, pending.slideIndex)) {
        throw new Error("当前页面替换失败");
      }
      editorDirty.value = true;
      slideRegenerationVisible.value = false;
      pendingSlideRegeneration.value = null;
      showToast?.(references.length ? "当前页已重新生成，已保留原有文字内容" : "当前页已重新生成", "success");
    } catch (requestError) {
      slideRegenerationError.value = `AI 重新生成失败：${errorMessage(requestError)}`;
    } finally {
      slideRegenerationLoading.value = false;
    }
  }

  async function openArtifact() {
    if (!artifact.value?.html) return;
    clearError();
    generationJob.value = null;
    selectedVolume.value = 0;
    if (!(await loadEditorDocument(artifact.value.html, "", {
      forceCurrentShell: artifactNeedsCurrentShell(),
    }))) {
      setError("PPT 文件尚未准备好，请稍后重试");
      return;
    }
    editorDirty.value = false;
    view.value = "editor";
    status.value = "editing";
  }

  async function openPartialGeneration() {
    if (!hasGeneratedPages(generationJob.value)) return;
    const firstReady = Math.max(0, generationJob.value.volumes.findIndex((volume) => Number(volume.completedSlides || 0) > 0));
    await showGeneratedVolume(firstReady, { merge: false });
  }

  async function selectVolume(index) {
    const normalized = Number(index);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized === selectedVolume.value) return;
    await showGeneratedVolume(normalized, { merge: false });
  }

  async function saveEditor() {
    if (isSaving.value) return false;
    isSaving.value = true;
    try {
      const bento = await waitForEditorBridge();
      if (!bento?.serialize) {
        setError("PPT 编辑器正在初始化，请稍后再试");
        return false;
      }
      const html = repairBentoHtml(String(bento.serialize() || ""), shellHtml);
      if (!html.trim()) throw new Error("PPT 内容为空");
      const savedSnapshot = documentSnapshot(bento);
      const volumeCount = Math.max(1, generationJob.value?.volumes?.length || artifact.value?.volumes?.length || 1);
      const volume = currentVolume.value;
      const volumeName = volume?.fileName || artifact.value?.fileName || currentFileName();
      await pptArtifactShell.saveArtifactVolume(
        sourcePath.value,
        sourceHash.value,
        volumeName,
        selectedVolume.value,
        volumeCount,
        html
      );
      const volumes = Array.isArray(artifact.value?.volumes) ? [...artifact.value.volumes] : [];
      while (volumes.length < volumeCount) volumes.push({ index: volumes.length, fileName: currentFileName(), html: "" });
      volumes[selectedVolume.value] = { ...volumes[selectedVolume.value], index: selectedVolume.value, fileName: volumeName, html, updatedAt: Date.now() };
      artifact.value = {
        ...(artifact.value || {}),
        sourcePath: sourcePath.value,
        sourceHash: sourceHash.value,
        fileName: volumes[0]?.fileName || currentFileName(),
        html: volumes[0]?.html || html,
        shellVersion: PPT_SHELL_VERSION,
        promptVersion: PPT_PROMPT_VERSION,
        volumes,
      };
      if (savedSnapshot !== null && documentSnapshot(bento) === savedSnapshot) {
        captureEditorBaseline(bento);
        try {
          bento.markClean?.();
        } catch {
          // The file has still been persisted; this only controls Bento's dot.
        }
      } else {
        syncEditorDirty();
      }
      showToast?.("PPT 已保存", "success");
      return true;
    } catch (saveError) {
      setError(`保存 PPT 失败：${errorMessage(saveError)}`);
      return false;
    } finally {
      isSaving.value = false;
    }
  }

  async function closePpt() {
    if (isSaving.value) return;
    if (view.value === "editor" && editorDirty.value) {
      const shouldSave = window.confirm("PPT 有未保存修改，是否保存后关闭？");
      if (shouldSave && !(await saveEditor())) return;
    }
    stopDirtyPolling();
    exitPresentFullscreen();
    frameRef.value = null;
    slideRegenerationVisible.value = false;
    slideRegenerationError.value = "";
    pendingSlideRegeneration.value = null;
    slideReferenceImages.value = [];
    referenceImages.value = [];
    editorHtml.value = "";
    editorUrl.value = "";
    editorDirty.value = false;
    visible.value = false;
    view.value = "status";
    status.value = "checking";
  }

  function handleProgress(payload) {
    const progress = Array.isArray(payload) ? payload[0] : payload;
    if (!progress || progress.kind !== "presentation") return;
    if (generationJob.value?.jobId && progress.jobId && generationJob.value.jobId !== progress.jobId) return;
    generationProgress.value = {
      stage: progress.stage || "",
      message: progress.message || "正在生成 PPT",
      detail: progress.detail || "",
      contentChars: Number(progress.contentChars || 0),
      elapsedMs: Number(progress.elapsedMs || 0),
    };
    elapsedMs.value = Math.max(elapsedMs.value, Number(progress.elapsedMs || 0));
    addGenerationStep(progress);
    if (JOB_REFRESH_STAGES.has(progress.stage)) void refreshGenerationJob({ openEditor: true });
  }

  window.addEventListener("message", handleFrameMessage);

  function handlePptKeydown(event) {
    if (!visible.value || view.value !== "editor") return;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    event.stopPropagation();
    if (editorDirty.value) void saveEditor();
  }

  window.addEventListener("keydown", handlePptKeydown, true);

  onUnmounted(() => {
    window.removeEventListener("message", handleFrameMessage);
    window.removeEventListener("keydown", handlePptKeydown, true);
    stopDirtyPolling();
    stopElapsedClock();
    stopJobPolling();
    exitPresentFullscreen();
  });

  return {
    visible,
    view,
    status,
    artifact,
    editorHtml,
    editorUrl,
    editorDirty,
    isGenerating,
    isSaving,
    error,
    generationJob,
    generationProgress,
    generationSteps,
    generationPercent,
    elapsedMs,
    selectedVolume,
    generationDensity,
    generationTargetSlides,
    referenceImages,
    referenceMode,
    referenceUsage,
    referenceStrength,
    referenceLoading,
    slideRegenerationVisible,
    slideRegenerationLoading,
    slideRegenerationError,
    slideRegenerationRequestKey,
    slideReferenceImages,
    slideReferenceLoading,
    openPpt,
    generatePpt,
    regeneratePpt,
    continueGeneration,
    cancelGeneration,
    copyRawResult,
    openArtifact,
    openPartialGeneration,
    selectVolume,
    saveEditor,
    closePpt,
    handleFrameLoad,
    closeSlideRegeneration,
    regenerateCurrentSlide,
    chooseReferenceFiles,
    chooseReferenceFolder,
	addReferenceImageURL,
    removeReferenceImage,
    clearReferenceImages,
    chooseSlideReferenceFiles,
	addSlideReferenceImageURL,
    removeSlideReferenceImage,
    clearSlideReferenceImages,
    handleProgress,
  };
}
