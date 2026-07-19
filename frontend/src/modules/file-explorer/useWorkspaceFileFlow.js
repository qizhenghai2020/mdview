export function normalizeWindowsPath(path) {
  return String(path || "")
    .replaceAll("/", "\\")
    .toLowerCase();
}

function firstFileInTree(nodes) {
  for (const node of nodes || []) {
    if (!node.isDir) {
      return node.path;
    }
    const childPath = firstFileInTree(node.children);
    if (childPath) {
      return childPath;
    }
  }
  return "";
}

function getDefaultExpandedTreePaths(nodes) {
  return new Set((nodes || []).filter((node) => node.isDir).map((node) => node.path));
}

function getPreferredSidebarSection(roots, fileCount, selectedCount, configuredSection) {
  if (configuredSection === "files" || configuredSection === "outline") {
    return configuredSection;
  }

  const rootList = Array.isArray(roots) ? roots : [];
  const isSingleFileWorkspace =
    selectedCount === 1 &&
    fileCount === 1 &&
    rootList.length === 1 &&
    rootList[0] &&
    !rootList[0].isDir;

  return isSingleFileWorkspace ? "outline" : "files";
}

function getAvailableSidebarSection(preferredSection, hasWorkspaceFiles, tocCount) {
  if (preferredSection === "outline" && tocCount > 0) {
    return "outline";
  }
  if (preferredSection === "files" && hasWorkspaceFiles) {
    return "files";
  }
  if (hasWorkspaceFiles) {
    return "files";
  }
  if (tocCount > 0) {
    return "outline";
  }

  return preferredSection === "outline" ? "outline" : "files";
}

export function useWorkspaceFileFlow({
  appSettings,
  fileName,
  filePath,
  workspaceRoots,
  workspaceFileCount,
  expandedTreePaths,
  sidebarSection,
  tocItems,
  hasWorkspaceFiles,
  isLoading,
  loadingText,
  hasChanges,
  viewMode,
  replaceContentFromDisk,
  readPreference,
  scheduleTocSync,
  cancelScheduledMarkdownRender,
  renderMarkdown,
  showToast,
  fileShell,
}) {
  async function loadFile(path) {
    if (!fileShell?.available) {
      showToast("请在桌面应用中使用此功能", "error");
      return;
    }

    isLoading.value = true;
    loadingText.value = "正在加载文本文件...";
    try {
      const content = await fileShell.readWatchedFile(path);
      fileName.value = (await fileShell.getCurrentFileName()) || fileName.value;
      filePath.value = (await fileShell.getCurrentFilePath()) || path;
      replaceContentFromDisk(content);
      viewMode.value = readPreference("viewMode");
    } catch (error) {
      console.error("读取文件失败:", error);
      showToast("读取文件失败: " + (error.message || error), "error");
    } finally {
      isLoading.value = false;
    }
  }

  async function setFileWorkspace(paths, { openFirst = true } = {}) {
    const selectedPaths = Array.from(new Set((paths || []).filter(Boolean)));
    if (!selectedPaths.length || !fileShell?.available) {
      return false;
    }

    if (openFirst && hasChanges.value) {
      const shouldDiscard = window.confirm(
        `“${fileName.value}”还有未保存的修改。是否放弃修改并打开新的文件列表？`
      );
      if (!shouldDiscard) {
        return false;
      }
    }

    isLoading.value = true;
    loadingText.value = "正在整理文本文件...";
    try {
      const workspace = await fileShell.buildWorkspace(selectedPaths);
      const roots = Array.isArray(workspace?.roots) ? workspace.roots : [];
      const fileCount = Number(workspace?.fileCount || 0);

      if (!fileCount) {
        showToast("所选内容中没有可打开的文本文件", "error");
        return false;
      }

      workspaceRoots.value = roots;
      workspaceFileCount.value = fileCount;
      expandedTreePaths.value = getDefaultExpandedTreePaths(roots);
      const preferredSidebarSection = getPreferredSidebarSection(
        roots,
        fileCount,
        selectedPaths.length,
        appSettings.value.sidebarDefaultSection || "auto"
      );

      if (workspace?.truncated) {
        showToast("目录文件较多，已显示前 10000 个文本文件", "error");
      }

      if (openFirst) {
        const firstPath = firstFileInTree(roots);
        if (firstPath) {
          await loadFile(firstPath);
          if (viewMode.value === "live") {
            scheduleTocSync({ immediate: true });
          } else {
            cancelScheduledMarkdownRender();
            await renderMarkdown({ reason: "workspace-first-file-open" });
          }
        }
      }

      sidebarSection.value = getAvailableSidebarSection(
        preferredSidebarSection,
        hasWorkspaceFiles.value,
        tocItems.value.length
      );
      return true;
    } catch (error) {
      console.error("构建文件目录失败:", error);
      showToast("打开文件目录失败：" + (error.message || error), "error");
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function openWorkspaceFile(path) {
    if (!path || normalizeWindowsPath(path) === normalizeWindowsPath(filePath.value)) {
      return;
    }

    if (hasChanges.value) {
      const shouldDiscard = window.confirm(
        `“${fileName.value}”还有未保存的修改。是否放弃修改并打开其他文件？`
      );
      if (!shouldDiscard) {
        return;
      }
    }

    await loadFile(path);
  }

  async function openFile() {
    if (!fileShell?.available) {
      showToast("请在桌面应用中使用此功能", "error");
      return;
    }

    const paths = await fileShell.openFiles();
    if (!paths?.length) {
      return;
    }

    await setFileWorkspace(paths);
  }

  async function openDirectory() {
    if (!fileShell?.available) {
      showToast("请在桌面应用中使用此功能", "error");
      return;
    }

    const path = await fileShell.openDirectory();
    if (!path) {
      return;
    }

    await setFileWorkspace([path]);
  }

  return {
    loadFile,
    setFileWorkspace,
    openWorkspaceFile,
    openFile,
    openDirectory,
  };
}
