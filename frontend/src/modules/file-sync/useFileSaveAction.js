import { ref } from "vue";

export function useFileSaveAction({
  fileShell,
  viewMode,
  filePath,
  hasChanges,
  editedContent,
  originalContent,
  showToast,
  clearFileConflict,
  markFileConflict,
  showFileConflictModal,
  flushLiveEditorContent,
  flushPendingHistorySnapshot,
  flushPendingEditedContentSync,
}) {
  const isSaving = ref(false);

  async function saveFile() {
    if (!fileShell?.available) {
      showToast("请在桌面应用中使用此功能", "error");
      return;
    }
    if (viewMode.value === "live") {
      flushLiveEditorContent();
    }
    if (!filePath.value || !hasChanges.value || isSaving.value) {
      return;
    }

    if (viewMode.value === "split") {
      flushPendingHistorySnapshot();
    }
    flushPendingEditedContentSync();

    isSaving.value = true;
    try {
      const diskContent = await fileShell.readFile(filePath.value);
      if (diskContent !== originalContent.value) {
        if (diskContent === editedContent.value) {
          originalContent.value = editedContent.value;
          clearFileConflict();
          showToast("磁盘内容已与当前文档一致", "success");
          return;
        }

        markFileConflict(diskContent);
        showFileConflictModal.value = true;
        return;
      }

      await fileShell.writeFile(filePath.value, editedContent.value);
      originalContent.value = editedContent.value;
      clearFileConflict();
      showToast("保存成功", "success");
    } catch (error) {
      console.error("保存失败:", error);
      showToast("保存失败: " + (error?.message || error), "error");
    } finally {
      isSaving.value = false;
    }
  }

  return {
    isSaving,
    saveFile,
  };
}
