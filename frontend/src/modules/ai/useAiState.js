import { computed, ref } from "vue";
import {
  loadSmartThemePromptHistory,
  loadSmartThemes,
} from "@/modules/style-config/smartThemes";

const DEFAULT_MAX_SMART_FORMAT_PROGRESS_STEPS = 6;

export function useAiState({
  maxSmartFormatProgressSteps = DEFAULT_MAX_SMART_FORMAT_PROGRESS_STEPS,
} = {}) {
  const isSmartFormatting = ref(false);
  const showSmartFormatFailure = ref(false);
  const showSmartFormatPrompt = ref(false);
  const showSmartFormatPreview = ref(false);
  const showSmartThemePrompt = ref(false);
  const isGeneratingSmartTheme = ref(false);
  const smartFormatRequestId = ref(0);
  const designSmartFormatRequestId = ref(0);
  const smartThemeRequestId = ref(0);
  const showDesignSmartFormatPrompt = ref(false);
  const showDesignSmartFormatPreview = ref(false);
  const isDesignSmartFormatting = ref(false);
  const designSmartFormatOriginalHtml = ref("");
  const designSmartFormatCandidateHtml = ref("");
  const designSmartFormatInstruction = ref("");
  const smartFormatError = ref("");
  const smartFormatErrorDetail = ref("");
  const smartFormatRetryModelId = ref("");
  const smartFormatOriginalContent = ref("");
  const smartFormatCandidateContent = ref("");
  const smartFormatInstruction = ref("");
  const smartFormatProgressDetail = ref("");
  const smartFormatProgressSteps = ref([]);
  const smartThemePrompt = ref("");
  const smartThemes = ref(loadSmartThemes());
  const smartThemePromptHistory = ref(loadSmartThemePromptHistory());

  const isDetailedAiLoading = computed(
    () => isSmartFormatting.value || isDesignSmartFormatting.value || isGeneratingSmartTheme.value
  );

  const activeAiLoadingKind = computed(() => {
    if (isDesignSmartFormatting.value) {
      return "html-format";
    }
    if (isSmartFormatting.value) {
      return "markdown-format";
    }
    if (isGeneratingSmartTheme.value) {
      return "theme";
    }
    return "";
  });

  const canCloseAiLoading = computed(() => Boolean(activeAiLoadingKind.value));

  function resetSmartFormatProgress() {
    smartFormatProgressDetail.value = "";
    smartFormatProgressSteps.value = [];
  }

  function pushSmartFormatProgress(message, detail = "") {
    const title = String(message || "").trim();
    const extra = String(detail || "").trim();
    const text = extra ? `${title}：${extra}` : title;
    if (!text) {
      return;
    }

    const lastItem = smartFormatProgressSteps.value[smartFormatProgressSteps.value.length - 1];
    if (lastItem?.text === text) {
      return;
    }

    smartFormatProgressSteps.value = [
      ...smartFormatProgressSteps.value.slice(-(maxSmartFormatProgressSteps - 1)),
      {
        id: `${Date.now()}-${smartFormatProgressSteps.value.length}`,
        time: new Date().toLocaleTimeString("zh-CN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        text,
      },
    ];
  }

  function setSmartFormatProgress(loadingText, message, detail = "", { reset = false } = {}) {
    if (reset) {
      resetSmartFormatProgress();
    }

    loadingText.value = String(message || "智能排版中，请稍候...");
    smartFormatProgressDetail.value = String(detail || "").trim();
    pushSmartFormatProgress(message, detail);
  }

  function buildSmartFormatDebugDetail(extraDetail = "") {
    const sections = [];
    const detail = String(extraDetail || "").trim();
    if (detail) {
      sections.push(detail);
    }

    if (smartFormatProgressSteps.value.length) {
      sections.push(
        [
          "最近进度：",
          ...smartFormatProgressSteps.value.map((item) => `- ${item.time} ${item.text}`),
        ].join("\n")
      );
    }

    return sections.join("\n\n").trim();
  }

  return {
    isSmartFormatting,
    showSmartFormatFailure,
    showSmartFormatPrompt,
    showSmartFormatPreview,
    showSmartThemePrompt,
    isGeneratingSmartTheme,
    smartFormatRequestId,
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
    smartFormatProgressSteps,
    smartThemePrompt,
    smartThemes,
    smartThemePromptHistory,
    isDetailedAiLoading,
    activeAiLoadingKind,
    canCloseAiLoading,
    resetSmartFormatProgress,
    setSmartFormatProgress,
    buildSmartFormatDebugDetail,
  };
}
