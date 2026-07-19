const createResolvedValue = (value) => () => Promise.resolve(value);
const pickFunction = (value, fallback) => (typeof value === "function" ? value : fallback);

export function createResourceShellClient({
  isAvailable = false,
  listExternalFonts,
  resolveImagePath,
  readImageAsBase64,
  readTextFileContent,
  getDesignExportPayloadPath,
  getDesignDraft,
  saveDesignDraft,
  deleteDesignDraft,
} = {}) {
  const requestListExternalFonts = pickFunction(listExternalFonts, createResolvedValue([]));
  const requestResolveImagePath = pickFunction(resolveImagePath, createResolvedValue(""));
  const requestReadImageAsBase64 = pickFunction(readImageAsBase64, createResolvedValue(""));
  const requestReadTextFileContent = pickFunction(readTextFileContent, createResolvedValue(""));
  const requestGetDesignExportPayloadPath = pickFunction(
    getDesignExportPayloadPath,
    createResolvedValue("")
  );
  const requestGetDesignDraft = pickFunction(getDesignDraft, createResolvedValue(null));
  const requestSaveDesignDraft = pickFunction(saveDesignDraft, createResolvedValue(undefined));
  const requestDeleteDesignDraft = pickFunction(deleteDesignDraft, createResolvedValue(undefined));

  return {
    available: isAvailable === true,
    listExternalFonts() {
      return requestListExternalFonts();
    },
    resolveImagePath(path) {
      return requestResolveImagePath(path);
    },
    readImageAsBase64(path) {
      return requestReadImageAsBase64(path);
    },
    readTextFileContent(path) {
      return requestReadTextFileContent(path);
    },
    getDesignExportPayloadPath() {
      return requestGetDesignExportPayloadPath();
    },
    getDesignDraft(sourcePath) {
      return requestGetDesignDraft(sourcePath);
    },
    saveDesignDraft(sourcePath, fileName, html) {
      return requestSaveDesignDraft(sourcePath, fileName, html);
    },
    deleteDesignDraft(sourcePath) {
      return requestDeleteDesignDraft(sourcePath);
    },
  };
}
