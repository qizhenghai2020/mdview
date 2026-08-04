export function useAppKeyboardShortcuts({
  showDesignDraftPrompt,
  dismissDesignDraftPrompt,
  showDesignHelpModal,
  showDesignExportModal,
  closeDesignExportModal,
  isDragging,
  cancelDragState,
  openFile,
  openSearch,
  hasChanges,
  saveFile,
  viewMode,
  undo,
  redo,
}) {
  function handleKeyDown(event) {
    if (showDesignDraftPrompt.value && event.key === "Escape") {
      event.preventDefault();
      dismissDesignDraftPrompt();
      return;
    }
    if (showDesignHelpModal.value && event.key === "Escape") {
      event.preventDefault();
      showDesignHelpModal.value = false;
      return;
    }
    if (showDesignExportModal.value && event.key === "Escape") {
      event.preventDefault();
      closeDesignExportModal();
      return;
    }

    if (isDragging.value) {
      event.preventDefault();
      cancelDragState();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openSearch();
      return;
    }

    if (event.ctrlKey && event.key === "o") {
      event.preventDefault();
      openFile();
    }
    if (event.ctrlKey && event.key === "s") {
      event.preventDefault();
      if (hasChanges.value) {
        saveFile();
      }
    }
    if (event.ctrlKey && event.key === "z" && viewMode.value === "split") {
      event.preventDefault();
      undo();
    }
    if (event.ctrlKey && event.key === "y" && viewMode.value === "split") {
      event.preventDefault();
      redo();
    }
  }

  return {
    handleKeyDown,
  };
}
