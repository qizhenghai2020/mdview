const resolved = (value) => () => Promise.resolve(value);
const picked = (value, fallback) => (typeof value === "function" ? value : fallback);

export function createPptArtifactShell({
  isAvailable = false,
  getArtifact,
  getEditorURL,
  saveArtifact,
  saveArtifactVolume,
  deleteArtifact,
} = {}) {
  const requestGet = picked(getArtifact, resolved(null));
  const requestEditorURL = picked(getEditorURL, resolved(""));
  const requestSave = picked(saveArtifact, resolved(undefined));
  const requestSaveVolume = picked(saveArtifactVolume, resolved(undefined));
  const requestDelete = picked(deleteArtifact, resolved(undefined));

  return {
    available: isAvailable === true,
    getArtifact(sourcePath) {
      return requestGet(sourcePath);
    },
    getEditorURL(sourcePath, volumeIndex) {
      return requestEditorURL(sourcePath, volumeIndex);
    },
    saveArtifact(sourcePath, sourceHash, fileName, html) {
      return requestSave(sourcePath, sourceHash, fileName, html);
    },
    saveArtifactVolume(sourcePath, sourceHash, fileName, volumeIndex, volumeCount, html) {
      return requestSaveVolume(sourcePath, sourceHash, fileName, volumeIndex, volumeCount, html);
    },
    deleteArtifact(sourcePath) {
      return requestDelete(sourcePath);
    },
  };
}
