export function useFileWatchFlow({
  externalConflictContent,
  showFileConflictModal,
  isResolvingFileConflict,
  filePath,
  fileName,
  originalContent,
  editedContent,
  hasFileConflict,
  replaceContentFromDisk,
  showToast,
  fileShell,
}) {
  let pendingRefreshRequest = null;
  let isCheckingCurrentFile = false;
  let externalConflictNotified = false;
  let filePollingTimer = null;
  let fileChangeRefreshTimer = null;

  function clearFileConflict() {
    externalConflictContent.value = null;
    showFileConflictModal.value = false;
    externalConflictNotified = false;
  }

  function markFileConflict(content) {
    externalConflictContent.value = content;
    if (!externalConflictNotified) {
      showToast("检测到本地编辑与外部修改冲突，请在标题旁选择保留版本", "error");
      externalConflictNotified = true;
    }
  }

  function openFileConflictResolution() {
    if (hasFileConflict.value) {
      showFileConflictModal.value = true;
    }
  }

  function normalizeWindowsPath(path) {
    return String(path || "")
      .replaceAll("/", "\\")
      .toLowerCase();
  }

  async function refreshCurrentFile({ changedPath = "", polling = false } = {}) {
    if (!fileShell?.available) {
      return;
    }

    const currentPath = filePath.value || (await fileShell.getCurrentFilePath());
    if (!currentPath) {
      return;
    }
    if (!filePath.value) {
      filePath.value = currentPath;
      fileName.value = (await fileShell.getCurrentFileName()) || fileName.value;
    }

    if (
      changedPath &&
      normalizeWindowsPath(changedPath) !== normalizeWindowsPath(currentPath)
    ) {
      return;
    }

    if (isCheckingCurrentFile) {
      if (!pendingRefreshRequest) {
        pendingRefreshRequest = { changedPath, polling };
      }
      return;
    }

    isCheckingCurrentFile = true;

    try {
      const content = await fileShell.readFile(currentPath);
      const diskChanged = content !== originalContent.value;
      const localChanged = editedContent.value !== originalContent.value;

      if (!diskChanged) {
        clearFileConflict();
      } else if (content === editedContent.value) {
        replaceContentFromDisk(content);
      } else if (localChanged) {
        markFileConflict(content);
      } else {
        replaceContentFromDisk(content);

        if (!polling) {
          showToast("已自动加载外部修改", "success");
        }
      }
    } catch (error) {
      console.warn("重新加载文件失败:", error);
      if (!polling) {
        showToast("刷新文件失败：" + (error.message || error), "error");
      }
    } finally {
      isCheckingCurrentFile = false;

      if (pendingRefreshRequest) {
        const nextRequest = pendingRefreshRequest;
        pendingRefreshRequest = null;
        void refreshCurrentFile(nextRequest);
      }
    }
  }

  async function resolveFileConflictWithCurrent() {
    if (!hasFileConflict.value || !filePath.value || isResolvingFileConflict.value) {
      return;
    }

    isResolvingFileConflict.value = true;
    try {
      const contentToKeep = editedContent.value;
      await fileShell.writeFile(filePath.value, contentToKeep);
      replaceContentFromDisk(contentToKeep);
      showToast("已保留当前编辑并覆盖外部版本", "success");
    } catch (error) {
      showToast("保存当前版本失败：" + (error.message || error), "error");
    } finally {
      isResolvingFileConflict.value = false;
    }
  }

  async function resolveFileConflictWithExternal() {
    if (!hasFileConflict.value || !filePath.value || isResolvingFileConflict.value) {
      return;
    }

    isResolvingFileConflict.value = true;
    try {
      const latestContent = await fileShell.readFile(filePath.value);
      replaceContentFromDisk(latestContent);
      showToast("已加载外部最新版本", "success");
    } catch (error) {
      showToast("加载外部版本失败：" + (error.message || error), "error");
    } finally {
      isResolvingFileConflict.value = false;
    }
  }

  function handleFileChanged(changedPath) {
    if (fileChangeRefreshTimer) {
      clearTimeout(fileChangeRefreshTimer);
    }

    fileChangeRefreshTimer = setTimeout(() => {
      fileChangeRefreshTimer = null;
      void refreshCurrentFile({ changedPath: String(changedPath || "") });
    }, 180);
  }

  function startFilePolling() {
    if (filePollingTimer) {
      clearInterval(filePollingTimer);
    }
    filePollingTimer = setInterval(() => {
      if (filePath.value && document.visibilityState === "visible") {
        void refreshCurrentFile({ polling: true });
      }
    }, 3000);
  }

  function cleanupFileWatchFlow() {
    pendingRefreshRequest = null;
    isCheckingCurrentFile = false;
    if (fileChangeRefreshTimer) {
      clearTimeout(fileChangeRefreshTimer);
      fileChangeRefreshTimer = null;
    }
    if (filePollingTimer) {
      clearInterval(filePollingTimer);
      filePollingTimer = null;
    }
  }

  return {
    clearFileConflict,
    markFileConflict,
    openFileConflictResolution,
    refreshCurrentFile,
    resolveFileConflictWithCurrent,
    resolveFileConflictWithExternal,
    handleFileChanged,
    startFilePolling,
    cleanupFileWatchFlow,
  };
}
