export function useDesignSourceReader({
  filePath,
  fileShell,
}) {
  async function readCurrentFileContentForDesign() {
    const currentDesignPath =
      filePath.value || (fileShell?.available ? await fileShell.getCurrentFilePath() : "");
    if (!currentDesignPath || !fileShell?.available) {
      return null;
    }

    try {
      return await fileShell.readFile(currentDesignPath);
    } catch (error) {
      console.warn("设计器读取当前文件内容失败，已回退到当前预览内容。", error);
      return null;
    }
  }

  return {
    readCurrentFileContentForDesign,
  };
}
