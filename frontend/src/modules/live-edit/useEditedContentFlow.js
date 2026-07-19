import { watch } from "vue";

export function useEditedContentFlow({
  editedContent,
  markdownContent,
  originalContent,
  editHistory,
  historyIndex,
  isExternalChange,
  isEditorInteractionReliefActive,
  viewMode,
  hasChanges,
  fileName,
  showToast,
  clearFileConflict,
  createPerfTrace,
  schedulePerfPaintMarks,
  maxHistory,
  historySnapshotDelay,
  largeEditorOptimizationThreshold,
  largeEditorSideEffectDelay,
  hugeDocThreshold,
  hugeEditorSideEffectDelay,
  editorInteractionReliefMs,
}) {
  let pendingHistorySnapshotTimer = 0;
  let pendingHistorySnapshotValue = "";
  let hasPendingHistorySnapshot = false;
  let pendingEditedContentSyncTimer = 0;
  let pendingEditedContentSyncValue = "";
  let hasPendingEditedContentSync = false;
  let editorInteractionReliefTimer = 0;
  let lastEditedContent = "";

  function addToHistory(content) {
    if (historyIndex.value < editHistory.value.length - 1) {
      editHistory.value = editHistory.value.slice(0, historyIndex.value + 1);
    }

    editHistory.value.push(content);
    if (editHistory.value.length > maxHistory) {
      editHistory.value.shift();
    }
    historyIndex.value = editHistory.value.length - 1;
  }

  function clearPendingHistorySnapshot() {
    if (pendingHistorySnapshotTimer) {
      clearTimeout(pendingHistorySnapshotTimer);
      pendingHistorySnapshotTimer = 0;
    }
    pendingHistorySnapshotValue = "";
    hasPendingHistorySnapshot = false;
  }

  function flushPendingHistorySnapshot() {
    if (pendingHistorySnapshotTimer) {
      clearTimeout(pendingHistorySnapshotTimer);
      pendingHistorySnapshotTimer = 0;
    }

    if (!hasPendingHistorySnapshot || pendingHistorySnapshotValue === lastEditedContent) {
      pendingHistorySnapshotValue = "";
      hasPendingHistorySnapshot = false;
      return;
    }

    addToHistory(pendingHistorySnapshotValue);
    lastEditedContent = pendingHistorySnapshotValue;
    pendingHistorySnapshotValue = "";
    hasPendingHistorySnapshot = false;
  }

  function scheduleHistorySnapshot(content) {
    pendingHistorySnapshotValue = content;
    hasPendingHistorySnapshot = true;
    if (pendingHistorySnapshotTimer) {
      clearTimeout(pendingHistorySnapshotTimer);
    }

    pendingHistorySnapshotTimer = window.setTimeout(() => {
      flushPendingHistorySnapshot();
    }, historySnapshotDelay);
  }

  function clearEditorInteractionRelief() {
    if (editorInteractionReliefTimer) {
      clearTimeout(editorInteractionReliefTimer);
      editorInteractionReliefTimer = 0;
    }
    isEditorInteractionReliefActive.value = false;
  }

  function scheduleEditorInteractionRelief(length = editedContent.value.length) {
    if ((Number(length) || 0) < largeEditorOptimizationThreshold) {
      return;
    }

    isEditorInteractionReliefActive.value = true;
    if (editorInteractionReliefTimer) {
      clearTimeout(editorInteractionReliefTimer);
    }
    editorInteractionReliefTimer = window.setTimeout(() => {
      editorInteractionReliefTimer = 0;
      isEditorInteractionReliefActive.value = false;
    }, editorInteractionReliefMs);
  }

  function getEditedContentSideEffectDelay(length = editedContent.value.length, mode = viewMode.value) {
    if (mode !== "split" && mode !== "live") {
      return 0;
    }

    const contentLength = Number(length) || 0;
    if (contentLength >= hugeDocThreshold) {
      return hugeEditorSideEffectDelay;
    }
    if (contentLength >= largeEditorOptimizationThreshold) {
      return largeEditorSideEffectDelay;
    }
    return 0;
  }

  function clearPendingEditedContentSync() {
    if (pendingEditedContentSyncTimer) {
      clearTimeout(pendingEditedContentSyncTimer);
      pendingEditedContentSyncTimer = 0;
    }
    pendingEditedContentSyncValue = "";
    hasPendingEditedContentSync = false;
  }

  function applyEditedContentSideEffects(nextValue) {
    let historyScheduled = false;
    if (nextValue !== lastEditedContent && viewMode.value === "split") {
      scheduleHistorySnapshot(nextValue);
      historyScheduled = true;
    }

    let markdownSynced = false;
    if (markdownContent.value !== nextValue) {
      markdownContent.value = nextValue;
      markdownSynced = true;
    }

    return {
      historyScheduled,
      markdownSynced,
    };
  }

  function flushPendingEditedContentSync() {
    if (pendingEditedContentSyncTimer) {
      clearTimeout(pendingEditedContentSyncTimer);
      pendingEditedContentSyncTimer = 0;
    }
    if (!hasPendingEditedContentSync) {
      return {
        historyScheduled: false,
        markdownSynced: false,
        flushed: false,
      };
    }

    const nextValue = pendingEditedContentSyncValue;
    pendingEditedContentSyncValue = "";
    hasPendingEditedContentSync = false;
    return {
      ...applyEditedContentSideEffects(nextValue),
      flushed: true,
    };
  }

  function scheduleEditedContentSideEffects(nextValue) {
    const delayMs = getEditedContentSideEffectDelay(nextValue?.length || 0);
    if (delayMs <= 0) {
      return {
        ...flushPendingEditedContentSync(),
        ...applyEditedContentSideEffects(nextValue),
        delayed: false,
        delayMs: 0,
      };
    }

    pendingEditedContentSyncValue = nextValue;
    hasPendingEditedContentSync = true;
    if (pendingEditedContentSyncTimer) {
      clearTimeout(pendingEditedContentSyncTimer);
    }
    pendingEditedContentSyncTimer = window.setTimeout(() => {
      pendingEditedContentSyncTimer = 0;
      flushPendingEditedContentSync();
    }, delayMs);
    scheduleEditorInteractionRelief(nextValue.length);
    return {
      historyScheduled: false,
      markdownSynced: false,
      delayed: true,
      delayMs,
    };
  }

  function undo() {
    flushPendingHistorySnapshot();
    flushPendingEditedContentSync();
    if (historyIndex.value > 0) {
      historyIndex.value -= 1;
      editedContent.value = editHistory.value[historyIndex.value];
      markdownContent.value = editedContent.value;
    }
  }

  function redo() {
    flushPendingHistorySnapshot();
    flushPendingEditedContentSync();
    if (historyIndex.value < editHistory.value.length - 1) {
      historyIndex.value += 1;
      editedContent.value = editHistory.value[historyIndex.value];
      markdownContent.value = editedContent.value;
    }
  }

  function resetEditedContent() {
    if (!hasChanges.value) {
      return;
    }

    const shouldReset = window.confirm(
      `确定放弃当前未保存修改，并恢复到“${fileName.value}”上次保存/加载的内容吗？`
    );
    if (!shouldReset) {
      return;
    }

    editedContent.value = originalContent.value;
    markdownContent.value = originalContent.value;
    clearPendingEditedContentSync();
    showToast("已恢复到上次保存/加载的内容", "success");
  }

  function handlePlainTextEditorInput(event) {
    const nextValue = event?.target?.value ?? editedContent.value;
    scheduleEditorInteractionRelief(String(nextValue || "").length);
  }

  function setLastEditedContent(value) {
    lastEditedContent = value;
  }

  function replaceContentFromDisk(content) {
    const changed = editedContent.value !== content;
    clearPendingHistorySnapshot();
    clearPendingEditedContentSync();
    clearEditorInteractionRelief();
    isExternalChange.value = changed;
    markdownContent.value = content;
    editedContent.value = content;
    originalContent.value = content;
    lastEditedContent = content;
    editHistory.value = [content];
    historyIndex.value = 0;
    clearFileConflict?.();

    return true;
  }

  watch(
    editedContent,
    (newVal, oldVal) => {
      const trace = createPerfTrace("edited-content-watch", {
        viewMode: viewMode.value,
        newLength: newVal.length,
        oldLength: oldVal?.length || 0,
        backendCalls: false,
      });

      if (isExternalChange.value) {
        isExternalChange.value = false;
        clearPendingHistorySnapshot();
        clearPendingEditedContentSync();
        clearEditorInteractionRelief();
        lastEditedContent = newVal;
        trace.end({
          skipped: true,
          reason: "external-change",
        });
        return;
      }

      const syncResult = scheduleEditedContentSideEffects(newVal);
      trace.end({
        historyScheduled: syncResult.historyScheduled,
        markdownSynced: syncResult.markdownSynced,
        delayed: syncResult.delayed,
        delayMs: syncResult.delayMs || 0,
      });
      if (viewMode.value === "split" || viewMode.value === "live") {
        schedulePerfPaintMarks("edited-content-watch", trace.startedAt, {
          id: trace.id,
          viewMode: viewMode.value,
          newLength: newVal.length,
        });
      }
    },
    { flush: "post" }
  );

  return {
    addToHistory,
    clearPendingHistorySnapshot,
    flushPendingHistorySnapshot,
    clearEditorInteractionRelief,
    clearPendingEditedContentSync,
    flushPendingEditedContentSync,
    undo,
    redo,
    resetEditedContent,
    handlePlainTextEditorInput,
    setLastEditedContent,
    replaceContentFromDisk,
  };
}
