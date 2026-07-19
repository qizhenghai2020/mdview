const createResolvedValue = (value) => () => Promise.resolve(value);
const createRejectedValue = (message) => () => Promise.reject(new Error(message));
const pickFunction = (value, fallback) => (typeof value === "function" ? value : fallback);

function normalizePathList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((path) => String(path));
  }
  if (value) {
    return [String(value)];
  }
  return [];
}

export function createFileShellClient({
  isAvailable = false,
  openFileDialog,
  openFilesDialog,
  openDirectoryDialog,
  buildFileWorkspace,
  readFile,
  readFileAndUpdateWatch,
  writeFile,
  getFileName,
  getFilePath,
} = {}) {
  const requestOpenFileDialog = pickFunction(
    openFileDialog,
    createRejectedValue("请在桌面应用中使用此功能")
  );
  const requestOpenFilesDialog = typeof openFilesDialog === "function" ? openFilesDialog : null;
  const requestOpenDirectoryDialog = pickFunction(
    openDirectoryDialog,
    createRejectedValue("请在桌面应用中使用此功能")
  );
  const requestBuildFileWorkspace = pickFunction(
    buildFileWorkspace,
    createRejectedValue("请在桌面应用中使用此功能")
  );
  const requestReadFile = pickFunction(
    readFile,
    createRejectedValue("请在桌面应用中使用此功能")
  );
  const requestReadFileAndUpdateWatch = pickFunction(
    readFileAndUpdateWatch,
    createRejectedValue("请在桌面应用中使用此功能")
  );
  const requestWriteFile = pickFunction(
    writeFile,
    createRejectedValue("请在桌面应用中使用此功能")
  );
  const requestGetFileName = pickFunction(getFileName, createResolvedValue(""));
  const requestGetFilePath = pickFunction(getFilePath, createResolvedValue(""));

  return {
    available: isAvailable === true,
    async openFiles() {
      if (requestOpenFilesDialog) {
        return normalizePathList(await requestOpenFilesDialog());
      }

      return normalizePathList(await requestOpenFileDialog());
    },
    openDirectory() {
      return requestOpenDirectoryDialog();
    },
    buildWorkspace(paths) {
      return requestBuildFileWorkspace(normalizePathList(paths));
    },
    readFile(path) {
      return requestReadFile(path);
    },
    readWatchedFile(path) {
      return requestReadFileAndUpdateWatch(path);
    },
    writeFile(path, content) {
      return requestWriteFile(path, content);
    },
    getCurrentFileName() {
      return requestGetFileName();
    },
    getCurrentFilePath() {
      return requestGetFilePath();
    },
  };
}
