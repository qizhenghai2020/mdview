import { nextTick, watch } from "vue";

export function useViewModeController({
  viewMode,
  markdownContent,
  editedContent,
  editHistory,
  historyIndex,
  isHtmlDocument,
  isMarkdownDocument,
  editorRef,
  previewRef,
  liveEditorRef,
  liveEditSurfaceRef,
  htmlPreviewFrameRef,
  setLastEditedContent,
  clearPendingEditedContentSync,
  flushPendingEditedContentSync,
  flushPendingHistorySnapshot,
  handlePreviewScroll,
  perfNow,
  perfRound,
  perfLog,
  createPerfTrace,
  schedulePerfPaintMarks,
  cancelPreviewEnhancements,
  needsMarkdownPreviewRender,
  scheduleRenderMarkdown,
  schedulePreviewEnhancements,
  preloadLiveEditor,
}) {
  let savedScrollRatio = 0;
  let removeHtmlPreviewScrollListener = null;
  let pendingViewModePerf = null;

  function getScrollRatio(element) {
    if (!element) {
      return 0;
    }

    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
      return 0;
    }

    return element.scrollTop / maxScroll;
  }

  function applyScrollRatio(element, ratio) {
    if (!element) {
      return;
    }

    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
      return;
    }

    element.scrollTop = ratio * maxScroll;
  }

  function cleanupHtmlPreviewScrollListener() {
    if (typeof removeHtmlPreviewScrollListener === "function") {
      removeHtmlPreviewScrollListener();
      removeHtmlPreviewScrollListener = null;
    }
  }

  function getHtmlPreviewScrollElement() {
    const doc = htmlPreviewFrameRef.value?.contentDocument;
    return doc?.scrollingElement || doc?.documentElement || doc?.body || null;
  }

  function getPreviewScrollElement() {
    return isHtmlDocument.value ? getHtmlPreviewScrollElement() || previewRef.value : previewRef.value;
  }

  function attachHtmlPreviewScrollListener() {
    cleanupHtmlPreviewScrollListener();
    const scrollElement = getHtmlPreviewScrollElement();
    if (!scrollElement) {
      return;
    }

    scrollElement.addEventListener("scroll", handlePreviewScroll, { passive: true });
    removeHtmlPreviewScrollListener = () => {
      scrollElement.removeEventListener("scroll", handlePreviewScroll);
    };
  }

  function handleHtmlPreviewLoad() {
    attachHtmlPreviewScrollListener();
  }

  function readCurrentScrollRatio(mode = viewMode.value) {
    if (mode === "split") {
      const ratios = [getScrollRatio(editorRef.value), getScrollRatio(getPreviewScrollElement())];
      return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
    }

    if (mode === "live") {
      return getScrollRatio(liveEditorRef.value);
    }

    return getScrollRatio(getPreviewScrollElement());
  }

  function restoreScrollRatioForMode(mode) {
    nextTick(() => {
      if (mode === "split") {
        applyScrollRatio(editorRef.value, savedScrollRatio);
        applyScrollRatio(getPreviewScrollElement(), savedScrollRatio);
        return;
      }

      if (mode === "live") {
        applyScrollRatio(liveEditorRef.value, savedScrollRatio);
        return;
      }

      applyScrollRatio(getPreviewScrollElement(), savedScrollRatio);
    });
  }

  function scrollElementToTop(element, behavior = "smooth") {
    if (!element) {
      return;
    }

    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: 0, behavior });
      return;
    }

    element.scrollTop = 0;
  }

  function scrollDocumentToTop(behavior = "smooth") {
    if (viewMode.value === "split") {
      scrollElementToTop(editorRef.value, behavior);
      scrollElementToTop(getPreviewScrollElement(), behavior);
      return;
    }

    if (viewMode.value === "live") {
      scrollElementToTop(liveEditorRef.value, behavior);
      scrollElementToTop(
        liveEditorRef.value?.querySelector?.(".plain-text-editor, .html-source-editor"),
        behavior
      );
      return;
    }

    scrollElementToTop(getPreviewScrollElement(), behavior);
  }

  function prepareEditingBuffer(sourceContent = markdownContent.value) {
    clearPendingEditedContentSync();
    editedContent.value = sourceContent;
    setLastEditedContent(sourceContent);

    if (
      editHistory.value.length === 0 ||
      editHistory.value[editHistory.value.length - 1] !== sourceContent
    ) {
      editHistory.value = [sourceContent];
      historyIndex.value = 0;
    }
  }

  function flushLiveEditorContent() {
    const trace = createPerfTrace("live-editor-flush", {
      viewMode: viewMode.value,
      isMarkdownDocument: isMarkdownDocument.value,
      backendCalls: false,
    });
    if (viewMode.value !== "live" || !isMarkdownDocument.value) {
      trace.end({
        skipped: true,
      });
      return editedContent.value;
    }

    const latestValue = liveEditSurfaceRef.value?.flushValue?.();
    const contentChanged = typeof latestValue === "string" && latestValue !== editedContent.value;
    if (typeof latestValue === "string" && latestValue !== editedContent.value) {
      editedContent.value = latestValue;
      if (markdownContent.value !== latestValue) {
        markdownContent.value = latestValue;
      }
    }

    trace.end({
      latestLength: typeof latestValue === "string" ? latestValue.length : editedContent.value.length,
      contentChanged,
    });
    return typeof latestValue === "string" ? latestValue : editedContent.value;
  }

  function clearPendingViewModePerf() {
    pendingViewModePerf = null;
  }

  function toggleEditorMode(targetMode) {
    flushPendingEditedContentSync();
    const fromMode = viewMode.value;
    const trace = createPerfTrace("view-mode-switch", {
      from: fromMode,
      to: targetMode,
      isMarkdownDocument: isMarkdownDocument.value,
      backendCalls: false,
    });
    pendingViewModePerf = trace;
    const currentLiveContent = fromMode === "live" ? flushLiveEditorContent() : editedContent.value;
    savedScrollRatio = readCurrentScrollRatio();
    const targetIsEditor = targetMode === "split" || targetMode === "live";

    if (fromMode === targetMode) {
      viewMode.value = "preview";
      restoreScrollRatioForMode("preview");
      trace.end({
        toggledBackToPreview: true,
        savedScrollRatio,
      });
      schedulePerfPaintMarks("view-mode-switch", trace.startedAt, {
        id: trace.id,
        from: fromMode,
        to: "preview",
      });
      return;
    }

    if (targetIsEditor && fromMode === "preview") {
      prepareEditingBuffer(markdownContent.value);
    } else if (targetMode === "split" && fromMode === "live") {
      prepareEditingBuffer(currentLiveContent);
    }

    viewMode.value = targetMode;
    restoreScrollRatioForMode(targetMode);
    trace.end({
      targetMode,
      savedScrollRatio,
      currentLiveLength: currentLiveContent.length,
    });
    schedulePerfPaintMarks("view-mode-switch", trace.startedAt, {
      id: trace.id,
      from: fromMode,
      to: targetMode,
    });
  }

  function switchViewMode(targetMode) {
    perfLog("view-mode-request", {
      from: viewMode.value,
      to: targetMode,
      backendCalls: false,
    });
    if (viewMode.value === targetMode) {
      return;
    }

    if (targetMode === "live" && isMarkdownDocument.value) {
      preloadLiveEditor?.();
    }

    toggleEditorMode(targetMode);
  }

  function handleLiveEditorReady() {
    perfLog("live-editor-ready", {
      viewMode: viewMode.value,
      backendCalls: false,
    });
    if (viewMode.value === "live") {
      restoreScrollRatioForMode("live");
      schedulePerfPaintMarks("live-editor-ready", perfNow(), {
        viewMode: viewMode.value,
      });
    }
  }

  watch([isHtmlDocument, viewMode], ([htmlMode, mode]) => {
    if (!htmlMode || mode === "live") {
      cleanupHtmlPreviewScrollListener();
    }
  });

  watch(viewMode, (mode, previousMode) => {
    const watcherStartedAt = perfNow();
    perfLog("view-mode-watch:start", {
      mode,
      previousMode,
      pendingTraceId: pendingViewModePerf?.id || 0,
      backendCalls: false,
    });
    if (previousMode === "split" && mode !== "split") {
      flushPendingHistorySnapshot();
    }

    if (mode === "live") {
      cancelPreviewEnhancements();
      perfLog("view-mode-watch:end", {
        mode,
        previousMode,
        elapsedMs: perfRound(perfNow() - watcherStartedAt),
        branch: "live",
      });
      schedulePerfPaintMarks("view-mode-watch", watcherStartedAt, {
        mode,
        previousMode,
        pendingTraceId: pendingViewModePerf?.id || 0,
      });
      clearPendingViewModePerf();
      return;
    }

    if (!isMarkdownDocument.value) {
      perfLog("view-mode-watch:end", {
        mode,
        previousMode,
        elapsedMs: perfRound(perfNow() - watcherStartedAt),
        branch: "non-markdown",
      });
      clearPendingViewModePerf();
      return;
    }

    if (needsMarkdownPreviewRender()) {
      scheduleRenderMarkdown({
        immediate: true,
        reason: `view-mode-watch:${previousMode}->${mode}`,
      });
      perfLog("view-mode-watch:end", {
        mode,
        previousMode,
        elapsedMs: perfRound(perfNow() - watcherStartedAt),
        branch: "render-markdown",
      });
      schedulePerfPaintMarks("view-mode-watch", watcherStartedAt, {
        mode,
        previousMode,
        pendingTraceId: pendingViewModePerf?.id || 0,
      });
      clearPendingViewModePerf();
      return;
    }

    schedulePreviewEnhancements({
      immediate: true,
      reason: `view-mode-watch:${previousMode}->${mode}`,
    });
    perfLog("view-mode-watch:end", {
      mode,
      previousMode,
      elapsedMs: perfRound(perfNow() - watcherStartedAt),
      branch: "preview-enhancements",
    });
    schedulePerfPaintMarks("view-mode-watch", watcherStartedAt, {
      mode,
      previousMode,
      pendingTraceId: pendingViewModePerf?.id || 0,
    });
    clearPendingViewModePerf();
  });

  return {
    cleanupHtmlPreviewScrollListener,
    flushLiveEditorContent,
    handleHtmlPreviewLoad,
    handleLiveEditorReady,
    scrollDocumentToTop,
    switchViewMode,
  };
}
