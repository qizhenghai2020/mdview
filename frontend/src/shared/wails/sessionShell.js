const noop = () => undefined;
const createResolvedValue = (value) => () => Promise.resolve(value);
const pickFunction = (value, fallback) => (typeof value === "function" ? value : fallback);
const FILE_CHANGED_EVENT_NAME = "file-changed";

export function createSessionShellClient({
  isAvailable = false,
  getStartupFile,
  getStartupMode,
  eventsOn,
  eventsOff,
  onFileDrop,
  onFileDropOff,
} = {}) {
  const available = isAvailable === true;
  const supportsNativeFileDrop =
    typeof onFileDrop === "function" && typeof onFileDropOff === "function";
  const requestGetStartupFile = pickFunction(getStartupFile, createResolvedValue(""));
  const requestGetStartupMode = pickFunction(getStartupMode, createResolvedValue(""));
  const requestEventsOn = pickFunction(eventsOn, noop);
  const requestEventsOff = pickFunction(eventsOff, noop);
  const requestOnFileDrop = pickFunction(onFileDrop, noop);
  const requestOnFileDropOff = pickFunction(onFileDropOff, noop);

  return {
    available,
    supportsNativeFileDrop,
    getStartupFile() {
      return requestGetStartupFile();
    },
    getStartupMode() {
      return requestGetStartupMode();
    },
    attachSessionListeners({
      onFileChanged,
      onNativeFileDrop,
      useDropTarget = false,
    } = {}) {
      if (!available) {
        return;
      }
      if (typeof onFileChanged === "function") {
        requestEventsOn(FILE_CHANGED_EVENT_NAME, onFileChanged);
      }
      if (typeof onNativeFileDrop === "function" && supportsNativeFileDrop) {
        requestOnFileDrop(onNativeFileDrop, useDropTarget);
      }
    },
    detachSessionListeners() {
      if (!available) {
        return;
      }
      requestEventsOff(FILE_CHANGED_EVENT_NAME);
      if (supportsNativeFileDrop) {
        requestOnFileDropOff();
      }
    },
  };
}
