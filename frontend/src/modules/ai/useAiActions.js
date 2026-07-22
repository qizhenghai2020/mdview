import { getAIModelDisplayName, hasConfiguredAIModel } from "@/shared/ai/model";
import { getAIProgressPresentation, normalizeAIProgressPayload } from "@/shared/ai/progress";
import { sanitizeAITextInput } from "@/shared/ai/request";
import {
  createSmartThemeFromAI,
  isSmartThemeId,
  rememberSmartThemePrompt,
} from "@/modules/style-config/smartThemes";

function stripOuterHtmlFence(text) {
  const trimmed = String(text || "").trim();
  const matched = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return matched ? matched[1].trim() : trimmed;
}

const DEFAULT_LOADING_TEXT = "加载中...";

export function useAiActions({
  state,
  appSettings,
  loading,
  models,
  content,
  design,
  theme,
  bridge,
  helpers,
}) {
  const {
    isSmartFormatting,
    isGeneratingSmartContent,
    showSmartFormatFailure,
    showSmartFormatPrompt,
    showSmartFormatPreview,
    showSmartThemePrompt,
    isGeneratingSmartTheme,
    smartFormatRequestId,
    smartContentRequestId,
    designSmartFormatRequestId,
    smartThemeRequestId,
    showDesignSmartFormatPrompt,
    showDesignSmartFormatPreview,
    isDesignSmartFormatting,
    designSmartFormatOriginalHtml,
    designSmartFormatCandidateHtml,
    designSmartFormatInstruction,
    smartFormatError,
    smartFormatErrorDetail,
    smartFormatRetryModelId,
    smartFormatOriginalContent,
    smartFormatCandidateContent,
    smartFormatInstruction,
    smartFormatProgressDetail,
    smartThemePrompt,
    smartThemes,
    smartThemePromptHistory,
    activeAiLoadingKind,
    resetSmartFormatProgress,
    setSmartFormatProgress,
    buildSmartFormatDebugDetail,
  } = state;

  const { isLoading, loadingText } = loading;
  const { enabledSmartFormatModels, activeSmartFormatModel } = models;
  const { isMarkdownDocument, editedContent, markdownContent, currentTheme } = content;
  const {
    showDesignExportModal,
    isDesignExportWindow,
    readDesignFrameCurrentHtml,
    applyDesignFrameUiThemeOnly,
    applyDesignExportHtml,
  } = design;
  const { builtInThemes, syncSmartThemeStyles, setTheme } = theme;
  const { aiClient } = bridge;
  const {
    openSettings,
    showToast,
    applySmartFormattedContent,
    stripOuterMarkdownFence,
  } = helpers;

  function getSmartFormatModel(modelId = "") {
    if (modelId) {
      return enabledSmartFormatModels.value.find((model) => model.id === modelId) || null;
    }

    return activeSmartFormatModel.value;
  }

  function openSmartFormatPreview(originalContent, formattedContent) {
    smartFormatOriginalContent.value = originalContent;
    smartFormatCandidateContent.value = formattedContent;
    showSmartFormatPreview.value = true;
  }

  function hasAiCapability(capability) {
    return Boolean(aiClient?.supports?.(capability));
  }

  function openModelsSettingsWithToast(message) {
    showToast(message, "error");
    openSettings("models");
  }

  function ensureAiCapability(capability, unavailableMessage) {
    if (hasAiCapability(capability)) {
      return true;
    }
    showToast(unavailableMessage, "error");
    return false;
  }

  function ensureReadyAiModel(
    message = "请先在模型配置中添加、测试并启用模型",
    missingConfigMessage = "当前模型缺少接口地址或模型名称，请先补充"
  ) {
    const model = activeSmartFormatModel.value;
    if (!model) {
      openModelsSettingsWithToast(message);
      return null;
    }
    if (!hasConfiguredAIModel(model)) {
      openModelsSettingsWithToast(missingConfigMessage);
      return null;
    }
    return model;
  }

  function resolveRequiredTextContent(value, emptyMessage) {
    const normalized = String(value || "");
    if (normalized.trim()) {
      return normalized;
    }
    showToast(emptyMessage, "error");
    return "";
  }

  async function resolveSourceContentValue(value) {
    if (typeof value === "function") {
      return await value();
    }
    return await value;
  }

  function ensureDesignExportContext() {
    if (showDesignExportModal.value || isDesignExportWindow.value) {
      return true;
    }
    showToast("请先打开 HTML 设计器", "error");
    return false;
  }

  async function resolveDesignFormatSourceContent(sourceContent = "") {
    if (String(sourceContent || "").trim()) {
      return sourceContent;
    }
    return await readDesignFrameCurrentHtml();
  }

  function clearSmartFormatFailureState() {
    showSmartFormatFailure.value = false;
    smartFormatError.value = "";
    smartFormatErrorDetail.value = "";
  }

  function getAiOperationContext(kind) {
    if (kind === "markdown-format") {
      return {
        requestIdRef: smartFormatRequestId,
        activeRef: isSmartFormatting,
        resetProgressOnCancel: true,
      };
    }
    if (kind === "content-generate") {
      return {
        requestIdRef: smartContentRequestId,
        activeRef: isGeneratingSmartContent,
        resetProgressOnCancel: true,
      };
    }
    if (kind === "html-format") {
      return {
        requestIdRef: designSmartFormatRequestId,
        activeRef: isDesignSmartFormatting,
        resetProgressOnCancel: true,
        onDeactivate: applyDesignFrameUiThemeOnly,
      };
    }
    if (kind === "theme") {
      return {
        requestIdRef: smartThemeRequestId,
        activeRef: isGeneratingSmartTheme,
      };
    }
    return null;
  }

  function beginAiOperation(
    kind,
    { loadingMessage = DEFAULT_LOADING_TEXT, loadingDetail = "", resetProgress = false, clearFailure = false } = {}
  ) {
    const context = getAiOperationContext(kind);
    if (!context) {
      return 0;
    }

    const requestId = ++context.requestIdRef.value;
    context.activeRef.value = true;
    isLoading.value = true;

    if (clearFailure) {
      clearSmartFormatFailureState();
    }

    if (resetProgress) {
      setSmartFormatProgress(loadingText, loadingMessage, loadingDetail, { reset: true });
    } else {
      loadingText.value = loadingMessage;
    }

    return requestId;
  }

  function shouldIgnoreAiOperation(kind, requestId, message) {
    const context = getAiOperationContext(kind);
    if (!context || requestId === context.requestIdRef.value) {
      return false;
    }
    if (message) {
      console.info(message);
    }
    return true;
  }

  function finishAiOperation(kind, requestId) {
    const context = getAiOperationContext(kind);
    if (!context || requestId !== context.requestIdRef.value) {
      return false;
    }

    context.activeRef.value = false;
    isLoading.value = false;
    loadingText.value = DEFAULT_LOADING_TEXT;
    context.onDeactivate?.();
    return true;
  }

  function cancelAiOperation(kind) {
    const context = getAiOperationContext(kind);
    if (!context) {
      return;
    }

    context.requestIdRef.value += 1;
    context.activeRef.value = false;
    if (context.resetProgressOnCancel) {
      resetSmartFormatProgress();
    }
    context.onDeactivate?.();
  }

  function isAiOperationActive(kind) {
    return Boolean(getAiOperationContext(kind)?.activeRef?.value);
  }

  function getAiErrorMessage(error) {
    return error?.message || String(error);
  }

  async function runManagedAiRequest({
    kind,
    model,
    startMessage,
    startDetail = "请求由桌面端后端发起。",
    clearFailure = false,
    logPrefix,
    operationLabel,
    logMeta = {},
    ignoreResultMessage = "",
    ignoreErrorMessage = "",
    pendingMessage = "已提交到桌面端后台",
    pendingDetail = "正在连接模型接口并等待响应",
    onBeforeRequest = null,
    execute,
    logSuccess = null,
    onSuccess = null,
    onError = null,
  }) {
    const requestId = beginAiOperation(kind, {
      loadingMessage: startMessage,
      loadingDetail: startDetail,
      resetProgress: true,
      clearFailure,
    });

    console.info(`${logPrefix} 开始请求`, logMeta);
    onBeforeRequest?.();

    try {
      if (pendingMessage || pendingDetail) {
        setSmartFormatProgress(loadingText, pendingMessage || startMessage, pendingDetail);
      }

      const result = await execute();
      if (shouldIgnoreAiOperation(kind, requestId, ignoreResultMessage)) {
        return;
      }

      logSuccess?.(result);
      if (model?.id) {
        appSettings.value.activeModelId = model.id;
      }
      onSuccess?.(result);
    } catch (error) {
      if (shouldIgnoreAiOperation(kind, requestId, ignoreErrorMessage)) {
        return;
      }

      const errorMessage = getAiErrorMessage(error);
      console.error(`${operationLabel}失败:`, error);
      if (typeof onError === "function") {
        onError(errorMessage, model, error);
      } else {
        setSmartFormatProgress(loadingText, `${operationLabel}失败`, errorMessage);
        showToast(`${operationLabel}失败：` + errorMessage, "error");
      }
    } finally {
      finishAiOperation(kind, requestId);
    }
  }

  async function runFormatRequest({
    kind,
    modelId = "",
    instruction = "",
    sourceContent,
    format = "",
    unavailableMessage,
    emptyMessage,
    startMessage,
    operationLabel,
    logPrefix,
    ignoreResultMessage,
    ignoreErrorMessage,
    missingConfigFailureMessage = "",
    successValidationMessage = "",
    successProgressDetail = "准备打开排版前后对比预览",
    onBeforeRequest = null,
    onSuccess = null,
    onError = null,
  }) {
    if (!ensureAiCapability("formatDocument", unavailableMessage)) {
      return;
    }

    const model = resolveActionModel(
      modelId,
      missingConfigFailureMessage
        ? {
            onMissingConfig: (invalidModel) => {
              openSmartFormatFailure(missingConfigFailureMessage, invalidModel.id);
            },
          }
        : {}
    );
    if (!model) {
      return;
    }

    const resolvedSourceContent = resolveRequiredTextContent(
      await resolveSourceContentValue(sourceContent),
      emptyMessage
    );
    if (!resolvedSourceContent) {
      return;
    }

    const normalizedInstruction = sanitizeAITextInput(instruction, 1000);
    const requestPayload = {
      markdown: resolvedSourceContent,
      instruction: normalizedInstruction,
      model,
    };
    if (format) {
      requestPayload.format = format;
    }

    await runManagedAiRequest({
      kind,
      model,
      startMessage,
      clearFailure: true,
      logPrefix,
      operationLabel,
      logMeta: {
        modelId: model.id,
        modelName: getAIModelDisplayName(model, ""),
        baseUrl: model.baseUrl,
        formatTimeout: model.formatTimeout,
        instructionLength: normalizedInstruction.length,
        sourceLength: resolvedSourceContent.length,
      },
      ignoreResultMessage,
      ignoreErrorMessage,
      onBeforeRequest,
      execute: async () => {
        const rawContent = await aiClient.formatDocument(requestPayload);
        const formattedContent =
          format === "html" ? stripOuterHtmlFence(rawContent) : stripOuterMarkdownFence(rawContent);
        return {
          formattedContent,
          sourceContent: resolvedSourceContent,
          instruction: normalizedInstruction,
        };
      },
      logSuccess: ({ formattedContent }) => {
        console.info(`${logPrefix} 已收到模型返回`, {
          resultLength: formattedContent.length,
          preview: formattedContent.slice(0, 200),
        });
        setSmartFormatProgress(loadingText, "已收到模型返回", successProgressDetail);
        if (successValidationMessage) {
          console.info(successValidationMessage);
        }
      },
      onSuccess: ({ formattedContent, sourceContent, instruction }) => {
        onSuccess?.({
          formattedContent,
          sourceContent,
          model,
          instruction,
        });
      },
      onError,
    });
  }

  async function generateInsertContent({
    kind = "code",
    modelId = "",
    language = "",
    prompt = "",
    template = "",
    unavailableMessage = "请在桌面应用中使用 AI 生成",
    emptyMessage = "请输入生成需求",
    startMessage = "正在准备 AI 生成请求",
    operationLabel = "AI 生成",
    logPrefix = "[AI生成]",
    ignoreResultMessage = "[AI生成] 等待已被关闭，忽略本次返回结果",
    ignoreErrorMessage = "[AI生成] 等待已被关闭，忽略本次失败结果",
  } = {}) {
    if (!ensureAiCapability("generateContent", unavailableMessage)) {
      return "";
    }

    const model = resolveActionModel(modelId, {
      missingModelMessage: "请先在设置中添加并启用模型",
      missingConfigMessage: "当前模型缺少接口地址或模型名称，请先补充",
    });
    if (!model) {
      return "";
    }

    const normalizedPrompt = sanitizeAITextInput(prompt, 1200);
    if (!normalizedPrompt) {
      showToast(emptyMessage, "error");
      return "";
    }

    const normalizedTemplate = sanitizeAITextInput(template, 2000);
    const normalizedLanguage = sanitizeAITextInput(language, 120);
    let generatedContent = "";

    await runManagedAiRequest({
      kind: "content-generate",
      model,
      startMessage,
      clearFailure: true,
      logPrefix,
      operationLabel,
      logMeta: {
        modelId: model.id,
        modelName: getAIModelDisplayName(model, ""),
        baseUrl: model.baseUrl,
        language: normalizedLanguage,
        promptLength: normalizedPrompt.length,
        templateLength: normalizedTemplate.length,
      },
      ignoreResultMessage,
      ignoreErrorMessage,
      execute: async () => {
        const rawContent = await aiClient.generateContent({
          kind,
          language: normalizedLanguage,
          prompt: normalizedPrompt,
          template: normalizedTemplate,
          model,
        });
        const normalizedContent = stripOuterMarkdownFence(rawContent);
        return {
          rawContent,
          generatedContent: normalizedContent,
          model,
        };
      },
      logSuccess: ({ generatedContent: returnedContent }) => {
        generatedContent = returnedContent;
        console.info(`${logPrefix} 已收到模型返回`, {
          resultLength: returnedContent.length,
          preview: returnedContent.slice(0, 200),
        });
        setSmartFormatProgress(loadingText, "已收到模型返回", `内容长度：${returnedContent.length}`);
      },
    });

    return generatedContent;
  }

  function resolveActionModel(
    modelId = "",
    {
      missingModelMessage = "请先在设置中添加并启用模型",
      missingConfigMessage = "当前模型缺少接口地址或模型名称，请先补充",
      onMissingConfig = null,
    } = {}
  ) {
    const model = getSmartFormatModel(modelId);
    if (!model) {
      openModelsSettingsWithToast(missingModelMessage);
      return null;
    }

    if (!hasConfiguredAIModel(model)) {
      if (typeof onMissingConfig === "function") {
        onMissingConfig(model);
      } else {
        openModelsSettingsWithToast(missingConfigMessage);
      }
      return null;
    }

    return model;
  }

  function resolveThemeModel(modelId = "") {
    return resolveActionModel(modelId, {
      missingModelMessage: "请先在模型配置中添加、测试并启用一个模型",
    });
  }

  async function runThemeRequest({
    modelId = "",
    preference = smartThemePrompt.value,
    onSuccess = null,
    onError = null,
  } = {}) {
    if (!ensureAiCapability("generateTheme", "请在桌面应用中生成智能主题")) {
      return;
    }

    const model = resolveThemeModel(modelId);
    if (!model) {
      return;
    }

    const normalizedPreference = sanitizeAITextInput(preference, 800);
    await runManagedAiRequest({
      kind: "theme",
      model,
      startMessage: "AI 正在生成智能主题...",
      logPrefix: "[智能主题]",
      operationLabel: "智能主题生成",
      logMeta: {
        modelId: model.id,
        modelName: getAIModelDisplayName(model, ""),
        baseUrl: model.baseUrl,
        preferenceLength: normalizedPreference.length,
        currentTheme: currentTheme.value,
      },
      ignoreResultMessage: "[智能主题] 等待已被关闭，忽略本次返回结果",
      ignoreErrorMessage: "[智能主题] 等待已被关闭，忽略本次失败结果",
      execute: async () => ({
        rawTheme: await aiClient.generateTheme({
          preference: normalizedPreference,
          currentTheme: currentTheme.value,
          model,
        }),
        normalizedPreference,
      }),
      logSuccess: ({ rawTheme }) => {
        console.info("[智能主题] 已收到模型返回", {
          resultType: typeof rawTheme,
          resultKeys:
            rawTheme && typeof rawTheme === "object" ? Object.keys(rawTheme).slice(0, 12) : [],
        });
      },
      onSuccess: ({ rawTheme, normalizedPreference }) => {
        onSuccess?.({
          rawTheme,
          model,
          normalizedPreference,
        });
      },
      onError,
    });
  }

  function closeSmartFormatPreview() {
    showSmartFormatPreview.value = false;
  }

  function confirmSmartFormatPreview() {
    applySmartFormattedContent(smartFormatCandidateContent.value);
    showSmartFormatPreview.value = false;
    showToast("已应用智能排版结果，请确认后保存", "success");
  }

  function openSmartFormatFailure(message, failedModelId = "") {
    smartFormatError.value = message;
    smartFormatErrorDetail.value = buildSmartFormatDebugDetail(smartFormatProgressDetail.value);
    smartFormatRetryModelId.value =
      enabledSmartFormatModels.value.find((model) => model.id !== failedModelId)?.id ||
      failedModelId ||
      enabledSmartFormatModels.value[0]?.id ||
      "";
    showSmartFormatFailure.value = true;
  }

  function closeActiveAiLoading() {
    const activeKind = activeAiLoadingKind.value;
    if (!activeKind || !getAiOperationContext(activeKind)) {
      return;
    }

    cancelAiOperation(activeKind);
    isLoading.value = false;
    loadingText.value = DEFAULT_LOADING_TEXT;
    console.info("[AI] 用户主动关闭等待，本次结果将被忽略", {
      kind: activeKind,
    });
    showToast("已关闭等待，本次 AI 返回结果将忽略", "success");
  }

  function handleAIFormatProgress(payload) {
    const progress = normalizeAIProgressPayload(payload);
    if (
      !progress ||
      (progress.kind !== "markdown-format" &&
        progress.kind !== "html-format" &&
        progress.kind !== "content-generate" &&
        progress.kind !== "theme")
    ) {
      return;
    }
    if (!isAiOperationActive(progress.kind)) {
      return;
    }

    const detail = String(
      progress.detail ||
        (progress.stage === "stream-chunk" && progress.contentChars
          ? `已累计接收 ${progress.contentChars} 字`
          : "")
    ).trim();
    const progressPresentation = getAIProgressPresentation(progress.kind);
    console.info(progressPresentation.logPrefix, {
      stage: progress.stage || "",
      message: progress.message || "",
      detail,
      elapsedMs: progress.elapsedMs || 0,
      statusCode: progress.statusCode || 0,
      endpoint: progress.endpoint || "",
    });

    setSmartFormatProgress(
      loadingText,
      progress.message || progressPresentation.fallbackMessage,
      detail
    );
  }

  function openSmartFormatPrompt() {
    if (!isMarkdownDocument.value) {
      showToast("智能排版仅适用于 Markdown 文档", "error");
      return;
    }

    if (!ensureAiCapability("formatDocument", "请在桌面应用中使用智能排版")) {
      return;
    }

    if (!ensureReadyAiModel("请先在模型配置中添加、测试并启用模型")) {
      return;
    }

    if (!resolveRequiredTextContent(editedContent.value || markdownContent.value, "当前文档没有可排版内容")) {
      return;
    }

    smartFormatInstruction.value = "";
    showSmartFormatPrompt.value = true;
  }

  function confirmSmartFormatPrompt(instruction) {
    smartFormatInstruction.value = sanitizeAITextInput(instruction, 1000);
    showSmartFormatPrompt.value = false;
    void smartFormatMarkdown("", smartFormatInstruction.value);
  }

  async function smartFormatMarkdown(modelId = "", instruction = smartFormatInstruction.value) {
    await runFormatRequest({
      kind: "markdown-format",
      modelId,
      instruction,
      sourceContent: editedContent.value || markdownContent.value,
      unavailableMessage: "请在桌面应用中使用智能排版",
      emptyMessage: "当前文档没有可排版内容",
      startMessage: "正在准备 AI 排版请求",
      operationLabel: "智能排版",
      logPrefix: "[AI排版]",
      ignoreResultMessage: "[AI排版] 等待已被关闭，忽略本次返回结果",
      ignoreErrorMessage: "[AI排版] 等待已被关闭，忽略本次失败结果",
      missingConfigFailureMessage: "当前模型缺少接口地址或模型名称，请补充后重试。",
      successValidationMessage: "[AI排版] 跳过正文安全校验，直接交给用户预览判断",
      onSuccess: ({ formattedContent, sourceContent }) => {
        showSmartFormatFailure.value = false;
        openSmartFormatPreview(sourceContent, formattedContent);
      },
      onError: (errorMessage, model) => {
        openSmartFormatFailure("智能排版请求失败：" + errorMessage, model.id);
      },
    });
  }

  function retrySmartFormat() {
    showSmartFormatFailure.value = false;
    void smartFormatMarkdown(smartFormatRetryModelId.value, smartFormatInstruction.value);
  }

  function openSettingsFromSmartFormatFailure() {
    showSmartFormatFailure.value = false;
    openSettings("models");
  }

  async function openDesignSmartFormatPrompt() {
    if (!ensureDesignExportContext()) {
      return;
    }
    if (!ensureAiCapability("formatDocument", "请在桌面应用中使用 AI 排版")) {
      return;
    }
    if (!ensureReadyAiModel("请先在模型配置中添加、测试并启用模型")) {
      return;
    }

    const currentHtml = resolveRequiredTextContent(
      await resolveDesignFormatSourceContent(),
      "当前设计器里没有可排版的 HTML 内容"
    );
    if (!currentHtml) {
      return;
    }

    designSmartFormatOriginalHtml.value = currentHtml;
    showDesignSmartFormatPrompt.value = true;
  }

  function closeDesignSmartFormatPrompt() {
    showDesignSmartFormatPrompt.value = false;
  }

  function closeDesignSmartFormatPreview() {
    showDesignSmartFormatPreview.value = false;
  }

  function confirmDesignSmartFormatPrompt(instruction) {
    designSmartFormatInstruction.value = sanitizeAITextInput(instruction, 1000);
    showDesignSmartFormatPrompt.value = false;
    void smartFormatDesignHtml("", designSmartFormatInstruction.value);
  }

  async function smartFormatDesignHtml(
    modelId = "",
    instruction = designSmartFormatInstruction.value
  ) {
    await runFormatRequest({
      kind: "html-format",
      modelId,
      instruction,
      sourceContent: () => resolveDesignFormatSourceContent(designSmartFormatOriginalHtml.value),
      format: "html",
      unavailableMessage: "请在桌面应用中使用 AI 排版",
      emptyMessage: "当前设计器里没有可排版的 HTML 内容",
      startMessage: "正在准备 HTML AI 排版请求",
      operationLabel: "HTML AI 排版",
      logPrefix: "[HTML AI排版]",
      ignoreResultMessage: "[HTML AI排版] 等待已被关闭，忽略本次返回结果",
      ignoreErrorMessage: "[HTML AI排版] 等待已被关闭，忽略本次失败结果",
      successValidationMessage: "[HTML AI排版] 跳过 HTML 严格校验，直接交给用户预览判断",
      onBeforeRequest: () => {
        applyDesignFrameUiThemeOnly();
      },
      onSuccess: ({ formattedContent, sourceContent }) => {
        designSmartFormatOriginalHtml.value = sourceContent;
        designSmartFormatCandidateHtml.value = formattedContent;
        showDesignSmartFormatPreview.value = true;
      },
    });
  }

  async function confirmDesignSmartFormatPreview() {
    const nextHtml = String(designSmartFormatCandidateHtml.value || "").trim();
    if (!nextHtml) {
      return;
    }

    showDesignSmartFormatPreview.value = false;
    await applyDesignExportHtml(nextHtml);
    showToast("已应用 AI HTML 排版结果", "success");
  }

  function applySmartTheme(themeId) {
    const builtInTheme = builtInThemes.find((item) => item.id === themeId) || null;
    if (builtInTheme) {
      setTheme(builtInTheme.id);
      showToast(`已切换到内置主题：${builtInTheme.name}`, "success");
      return;
    }

    const themeItem = smartThemes.value.find((item) => item.id === themeId) || null;
    if (!themeItem) {
      showToast("主题不存在，可能已被删除。", "error");
      if (currentTheme.value === themeId) {
        setTheme("elegant");
      }
      return;
    }

    setTheme(themeItem.id);
    showToast(`已切换到智能主题：${themeItem.name}`, "success");
  }

  function deleteSmartTheme(themeId) {
    if (!isSmartThemeId(themeId)) {
      showToast("内置主题不能删除", "error");
      return;
    }

    const themeItem = smartThemes.value.find((item) => item.id === themeId) || null;
    if (!themeItem) {
      return;
    }

    smartThemes.value = smartThemes.value.filter((item) => item.id !== themeId);
    syncSmartThemeStyles();

    if (currentTheme.value === themeId) {
      setTheme("elegant");
    }

    showToast(`已删除智能主题：${themeItem.name}`, "success");
  }

  function openSmartThemePrompt() {
    if (!ensureAiCapability("generateTheme", "请在桌面应用中生成智能主题")) {
      return;
    }

    if (!resolveThemeModel()) {
      return;
    }

    showSmartThemePrompt.value = true;
  }

  function confirmSmartThemePrompt(prompt) {
    smartThemePrompt.value = sanitizeAITextInput(prompt, 800);
    smartThemePromptHistory.value = rememberSmartThemePrompt(
      smartThemePromptHistory.value,
      smartThemePrompt.value
    );
    showSmartThemePrompt.value = false;
    void generateSmartTheme(smartThemePrompt.value);
  }

  function deleteSmartThemePromptHistoryItem(itemId) {
    smartThemePromptHistory.value = smartThemePromptHistory.value.filter(
      (item) => item.id !== itemId
    );
  }

  async function generateSmartTheme(preference = smartThemePrompt.value) {
    await runThemeRequest({
      preference,
      onSuccess: ({ rawTheme, normalizedPreference }) => {
        const smartTheme = createSmartThemeFromAI(
          rawTheme,
          normalizedPreference || "生成智能主题"
        );
        if (!smartTheme) {
          throw new Error("AI 返回了无效的主题配置");
        }

        smartThemes.value = [
          smartTheme,
          ...smartThemes.value.filter((item) => item.id !== smartTheme.id),
        ].slice(0, 12);
        syncSmartThemeStyles();
        setTheme(smartTheme.id);
        showToast(`已生成并应用主题：${smartTheme.name}`, "success");
      },
    });
  }

  return {
    handleAIFormatProgress,
    closeActiveAiLoading,
    openSmartFormatPreview,
    closeSmartFormatPreview,
    confirmSmartFormatPreview,
    openSmartFormatPrompt,
    confirmSmartFormatPrompt,
    smartFormatMarkdown,
    retrySmartFormat,
    openSettingsFromSmartFormatFailure,
    openDesignSmartFormatPrompt,
    closeDesignSmartFormatPrompt,
    closeDesignSmartFormatPreview,
    confirmDesignSmartFormatPrompt,
    smartFormatDesignHtml,
    confirmDesignSmartFormatPreview,
    applySmartTheme,
    deleteSmartTheme,
    openSmartThemePrompt,
    confirmSmartThemePrompt,
    deleteSmartThemePromptHistoryItem,
    generateSmartTheme,
    generateInsertContent,
  };
}
