export function useFileEntryFlow({
  isDragging,
  isLoading,
  loadingText,
  fileName,
  filePath,
  sessionShell,
  replaceContentFromDisk,
  setFileWorkspace,
  showToast,
}) {
  async function loadStartupFile() {
    if (!sessionShell?.available) {
      return false;
    }
    try {
      const startupFile = await sessionShell.getStartupFile();
      if (startupFile) {
        return await setFileWorkspace([startupFile]);
      }
    } catch (error) {
      console.warn("检查启动参数失败:", error);
    }
    return false;
  }

  function cancelDragState() {
    isDragging.value = false;
  }

  function handleDragOver(event) {
    event.preventDefault();
    if (!isDragging.value) {
      isDragging.value = true;
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      cancelDragState();
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    cancelDragState();

    if (sessionShell?.supportsNativeFileDrop) {
      return;
    }

    const files = event.dataTransfer.files;
    if (files.length <= 0) {
      return;
    }

    const file = files[0];
    isLoading.value = true;
    loadingText.value = "正在加载文本文件...";
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      fileName.value = file.name;
      filePath.value = "";
      replaceContentFromDisk(loadEvent.target.result);
      isLoading.value = false;
    };
    reader.onerror = () => {
      isLoading.value = false;
      showToast("无法读取该文本文件", "error");
    };
    reader.readAsText(file);
  }

  async function handleNativeFileDrop(_x, _y, paths) {
    cancelDragState();
    const droppedPaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (!droppedPaths.length) {
      showToast("未能获取拖入文件的磁盘路径", "error");
      return;
    }
    await setFileWorkspace(droppedPaths);
  }

  return {
    loadStartupFile,
    cancelDragState,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleNativeFileDrop,
  };
}
