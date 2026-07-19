import { nextTick } from "vue";
import { DEFAULT_DESIGN_EXPORT_STATUS_TEXT } from "./constants";

function normalizeDesignDraftSourcePath(value) {
  return String(value || "").trim();
}

function normalizeDesignDraftSourceDisplayName(value) {
  const trimmed = String(value || "").trim();
  return trimmed && trimmed !== "未打开文件" ? trimmed : "";
}

function normalizeDesignHtmlForComparison(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function useDesignSession({
  resourceShell,
  hasDocumentContent,
  hasChanges,
  filePath,
  fileName,
  editedContent,
  markdownContent,
  isExporting,
  showDesignExportModal,
  showDesignDraftPrompt,
  showDesignHelpModal,
  showDesignSmartFormatPrompt,
  showDesignSmartFormatPreview,
  isPreparingDesignExport,
  isClosingDesignExport,
  designLoadError,
  designExportError,
  designExportDocumentHtml,
  designExportSourcePath,
  designExportBaselineHtml,
  designExportWindowFileName,
  designExportStatusText,
  designExportStatusDirty,
  designDraftPromptState,
  designSmartFormatOriginalHtml,
  designSmartFormatCandidateHtml,
  getExportBaseName,
  buildDesignDocumentHtml,
  resolveCurrentFilePath,
  readCurrentFileContent,
  loadDesignPage,
  releaseDesignPageResources,
  showToast,
  syncDesignFrameContent,
  resetDesignFrameSyncState,
  readDesignFrameCurrentHtml,
  setLockedDesignExportHtml,
  clearLockedDesignExportHtml,
}) {
  function resetDesignExportSessionFields() {
    designExportSourcePath.value = "";
    designExportBaselineHtml.value = "";
    designExportDocumentHtml.value = "";
    clearLockedDesignExportHtml();
    designExportError.value = "";
    designExportStatusText.value = DEFAULT_DESIGN_EXPORT_STATUS_TEXT;
    designExportStatusDirty.value = false;
  }

  function clearDesignSmartFormatSessionFields() {
    designSmartFormatOriginalHtml.value = "";
    designSmartFormatCandidateHtml.value = "";
  }

  async function getCurrentDesignSourcePath() {
    const currentPath = normalizeDesignDraftSourcePath(
      filePath.value ||
        (typeof resolveCurrentFilePath === "function"
          ? await resolveCurrentFilePath()
          : "")
    );
    if (currentPath) {
      return currentPath;
    }

    return normalizeDesignDraftSourceDisplayName(fileName.value);
  }

  async function readCurrentDocumentSourceContentForDesign() {
    const liveContent = String(editedContent.value || markdownContent.value || "");
    if (hasChanges.value || !filePath.value || typeof readCurrentFileContent !== "function") {
      return liveContent;
    }

    const fileContent = await readCurrentFileContent();
    return fileContent !== null && fileContent !== undefined ? fileContent : liveContent;
  }

  async function buildCurrentDesignSnapshot() {
    const sourcePath = await getCurrentDesignSourcePath();
    const currentHtml = await buildDesignDocumentHtml(
      await readCurrentDocumentSourceContentForDesign()
    );
    return {
      sourcePath,
      currentHtml,
      fileName: `${getExportBaseName()}.html`,
    };
  }

  async function openPreparedDesignSession(
    { sourcePath = "", loadedHtml = "", baselineHtml = "", fileName = "" },
    { showRecoveredToast = false } = {}
  ) {
    showDesignExportModal.value = true;
    showDesignHelpModal.value = false;
    designExportError.value = "";
    designExportSourcePath.value = sourcePath;
    designExportBaselineHtml.value = baselineHtml || loadedHtml;
    designExportDocumentHtml.value = loadedHtml;
    setLockedDesignExportHtml(loadedHtml);
    designExportWindowFileName.value = fileName || `${getExportBaseName()}.html`;
    designExportStatusText.value = DEFAULT_DESIGN_EXPORT_STATUS_TEXT;
    designExportStatusDirty.value = false;
    resetDesignFrameSyncState();

    await nextTick();
    await syncDesignFrameContent(true);

    if (showRecoveredToast && typeof showToast === "function") {
      showToast("已恢复当前文档的设计草稿", "success");
    }
  }

  function dismissDesignDraftPrompt() {
    showDesignDraftPrompt.value = false;
    designDraftPromptState.value = null;
  }

  async function continueDesignDraftEditing() {
    const draftState = designDraftPromptState.value;
    if (!draftState) {
      return;
    }

    dismissDesignDraftPrompt();
    await openPreparedDesignSession(
      {
        sourcePath: draftState.sourcePath,
        loadedHtml: draftState.draftHtml,
        baselineHtml: draftState.currentHtml,
        fileName: draftState.fileName,
      },
      { showRecoveredToast: true }
    );
  }

  async function overwriteDesignDraftWithCurrentDocument() {
    const draftState = designDraftPromptState.value;
    if (!draftState) {
      return;
    }

    dismissDesignDraftPrompt();
    if (draftState.sourcePath && resourceShell?.available) {
      await resourceShell.deleteDesignDraft(draftState.sourcePath);
    }
    await openPreparedDesignSession({
      sourcePath: draftState.sourcePath,
      loadedHtml: draftState.currentHtml,
      baselineHtml: draftState.currentHtml,
      fileName: draftState.fileName,
    });
  }

  async function persistDesignDraftBeforeClose() {
    const sourcePath = normalizeDesignDraftSourcePath(designExportSourcePath.value);
    if (!sourcePath || !resourceShell?.available) {
      return;
    }

    const currentHtml = await readDesignFrameCurrentHtml();
    if (!currentHtml) {
      if (designExportStatusDirty.value) {
        console.warn("设计器存在未保存修改，但当前 HTML 读取失败，已保留现有草稿。");
        return;
      }
      await resourceShell.deleteDesignDraft(sourcePath);
      return;
    }

    const currentSignature = normalizeDesignHtmlForComparison(currentHtml);
    const baselineSignature = normalizeDesignHtmlForComparison(
      designExportBaselineHtml.value
    );

    if (!currentSignature || currentSignature === baselineSignature) {
      await resourceShell.deleteDesignDraft(sourcePath);
      return;
    }

    await resourceShell.saveDesignDraft(
      sourcePath,
      designExportWindowFileName.value,
      currentHtml
    );
  }

  async function openDesignExportHtml() {
    if (isPreparingDesignExport.value || isExporting.value) {
      return;
    }

    if (!hasDocumentContent.value) {
      if (typeof showToast === "function") {
        showToast("当前没有可导出的内容", "error");
      }
      return;
    }

    isPreparingDesignExport.value = true;
    isExporting.value = true;
    showDesignHelpModal.value = false;
    dismissDesignDraftPrompt();
    resetDesignExportSessionFields();
    designExportWindowFileName.value = `${getExportBaseName()}.html`;
    resetDesignFrameSyncState();

    try {
      await loadDesignPage(true);
      if (designLoadError.value) {
        throw new Error(designLoadError.value);
      }

      const session = await buildCurrentDesignSnapshot();
      const currentSignature = normalizeDesignHtmlForComparison(session.currentHtml);
      const existingDraft =
        session.sourcePath && resourceShell?.available
          ? await resourceShell.getDesignDraft(session.sourcePath)
          : null;
      const draftHtml = String(existingDraft?.html || "");
      const draftSignature = normalizeDesignHtmlForComparison(draftHtml);

      if (draftSignature && draftSignature !== currentSignature) {
        designDraftPromptState.value = {
          sourcePath: session.sourcePath,
          currentHtml: session.currentHtml,
          draftHtml,
          fileName: session.fileName,
        };
        showDesignDraftPrompt.value = true;
        return;
      }

      if (
        session.sourcePath &&
        draftSignature &&
        draftSignature === currentSignature &&
        resourceShell?.available
      ) {
        await resourceShell.deleteDesignDraft(session.sourcePath);
      }

      await openPreparedDesignSession({
        sourcePath: session.sourcePath,
        loadedHtml: session.currentHtml,
        baselineHtml: session.currentHtml,
        fileName: session.fileName,
      });
    } catch (error) {
      designExportError.value = error?.message || String(error);
      if (typeof showToast === "function") {
        showToast(`设计打开失败: ${designExportError.value}`, "error");
      }
    } finally {
      isPreparingDesignExport.value = false;
      isExporting.value = false;
    }
  }

  async function closeDesignExportModal() {
    if (isClosingDesignExport.value) {
      return;
    }

    isClosingDesignExport.value = true;
    try {
      await persistDesignDraftBeforeClose();
    } catch (error) {
      console.warn("设计草稿暂存失败:", error);
      if (typeof showToast === "function") {
        showToast(`设计草稿暂存失败: ${error?.message || error}`, "error");
      }
    } finally {
      showDesignHelpModal.value = false;
      showDesignSmartFormatPrompt.value = false;
      showDesignSmartFormatPreview.value = false;
      showDesignExportModal.value = false;
      releaseDesignPageResources();
      resetDesignExportSessionFields();
      clearDesignSmartFormatSessionFields();
      resetDesignFrameSyncState();
      isClosingDesignExport.value = false;
    }
  }

  return {
    dismissDesignDraftPrompt,
    continueDesignDraftEditing,
    overwriteDesignDraftWithCurrentDocument,
    openDesignExportHtml,
    closeDesignExportModal,
  };
}
