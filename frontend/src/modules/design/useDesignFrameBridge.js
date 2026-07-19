import { ref } from "vue";
import { DEFAULT_DESIGN_EXPORT_STATUS_TEXT } from "./constants";

const MAX_DESIGN_FRAME_SYNC_RETRIES = 40;

export function useDesignFrameBridge({
  designFrameRef,
  showDesignExportModal,
  isDesignExportWindow,
  designExportError,
  designExportDocumentHtml,
  designExportWindowFileName,
  designExportStatusText,
  designExportStatusDirty,
  isDesignSmartFormatting,
  styleConfig,
  getExportBaseName,
  getDesignUiThemeSnapshot,
  getDesignFontOptionsSnapshot,
  buildDesignDocumentHtml,
}) {
  let designSyncToken = 0;
  let designFrameSyncRetryTimer = null;
  const designFrameSyncRetryAttempts = ref(0);
  const lastDesignSyncSignature = ref("");
  const lockedDesignExportHtml = ref("");

  function getDesignExportFileName() {
    return String(
      designExportWindowFileName.value ||
        `${getExportBaseName()}.html` ||
        "markdown-preview.html"
    );
  }

  function buildDesignFrameHostState() {
    return {
      fontOptions: getDesignFontOptionsSnapshot(),
      designAiBusy: isDesignSmartFormatting.value,
      uiTheme: getDesignUiThemeSnapshot(),
      themeRoundedCorners: styleConfig.value.themeRoundedCorners !== false,
    };
  }

  function applyDesignFrameUiThemeOnly() {
    const frameWindow = designFrameRef.value?.contentWindow;
    if (!frameWindow || typeof frameWindow.__mdViewerApplyHostState !== "function") {
      return;
    }

    frameWindow.__mdViewerApplyHostState(buildDesignFrameHostState());
  }

  function clearDesignFrameSyncRetry() {
    if (designFrameSyncRetryTimer) {
      clearTimeout(designFrameSyncRetryTimer);
      designFrameSyncRetryTimer = null;
    }
  }

  function resetDesignFrameSyncState() {
    clearDesignFrameSyncRetry();
    designFrameSyncRetryAttempts.value = 0;
    lastDesignSyncSignature.value = "";
  }

  function cleanupDesignHeaderStatusObserver() {
    designExportStatusText.value = DEFAULT_DESIGN_EXPORT_STATUS_TEXT;
    designExportStatusDirty.value = false;
  }

  function releaseDesignFrameBridgeResources() {
    resetDesignFrameSyncState();
    cleanupDesignHeaderStatusObserver();
    lockedDesignExportHtml.value = "";
  }

  function syncDesignHeaderStatusFromBridgeState(statePayload) {
    const payload = statePayload || {};
    designExportStatusText.value = String(
      payload.statusText || DEFAULT_DESIGN_EXPORT_STATUS_TEXT
    );
    designExportStatusDirty.value = payload.statusDirty === true;
  }

  function syncDesignHeaderStatusFromFrame() {
    const frameWindow = designFrameRef.value?.contentWindow;
    if (typeof frameWindow?.__mdViewerGetDesignBridgeState !== "function") {
      return;
    }
    syncDesignHeaderStatusFromBridgeState(frameWindow.__mdViewerGetDesignBridgeState());
  }

  function scheduleDesignFrameSyncRetry() {
    if (designFrameSyncRetryTimer) {
      return;
    }
    if (!showDesignExportModal.value && !isDesignExportWindow.value) {
      return;
    }
    if (designFrameSyncRetryAttempts.value >= MAX_DESIGN_FRAME_SYNC_RETRIES) {
      designExportError.value = "设计器桥接未加载完成，请关闭设计器后重新打开。";
      return;
    }

    designFrameSyncRetryTimer = setTimeout(() => {
      designFrameSyncRetryTimer = null;
      designFrameSyncRetryAttempts.value += 1;
      void syncDesignFrameContent(true);
    }, 80);
  }

  async function syncDesignFrameContent(force = false) {
    if (
      (!showDesignExportModal.value && !isDesignExportWindow.value) ||
      !designFrameRef.value
    ) {
      return;
    }

    const frameWindow = designFrameRef.value.contentWindow;
    if (typeof frameWindow?.__mdViewerLoadDesignHtml !== "function") {
      scheduleDesignFrameSyncRetry();
      return;
    }
    clearDesignFrameSyncRetry();
    designFrameSyncRetryAttempts.value = 0;

    const token = ++designSyncToken;
    const html =
      lockedDesignExportHtml.value ||
      designExportDocumentHtml.value ||
      (await buildDesignDocumentHtml());
    if (token !== designSyncToken) {
      return;
    }

    const designFileName = getDesignExportFileName();
    const signature = `${designFileName}\n${html}`;
    if (!force && signature === lastDesignSyncSignature.value) {
      applyDesignFrameUiThemeOnly();
      return;
    }

    const payload = {
      html,
      fileName: designFileName,
      themeRoundedCorners: styleConfig.value.themeRoundedCorners !== false,
      uiTheme: getDesignUiThemeSnapshot(),
      fontOptions: getDesignFontOptionsSnapshot(),
      designAiBusy: isDesignSmartFormatting.value,
    };
    lastDesignSyncSignature.value = signature;
    try {
      frameWindow.__mdViewerLoadDesignHtml(payload);
      syncDesignHeaderStatusFromFrame();
    } catch (error) {
      lastDesignSyncSignature.value = "";
      throw error;
    }
    applyDesignFrameUiThemeOnly();
  }

  function handleDesignFrameLoad() {
    designFrameSyncRetryAttempts.value = 0;
    syncDesignHeaderStatusFromFrame();
    applyDesignFrameUiThemeOnly();
    void syncDesignFrameContent(true);
  }

  function triggerDesignReset() {
    const frameWindow = designFrameRef.value?.contentWindow;
    if (typeof frameWindow?.__mdViewerResetDesignDocument !== "function") {
      return;
    }
    frameWindow.__mdViewerResetDesignDocument();
  }

  async function readDesignFrameCurrentHtml() {
    const frameWindow = designFrameRef.value?.contentWindow;
    if (!frameWindow || typeof frameWindow.__mdViewerGetCurrentDesignHtml !== "function") {
      return "";
    }

    try {
      return String((await frameWindow.__mdViewerGetCurrentDesignHtml()) || "");
    } catch (error) {
      console.warn("读取设计器当前 HTML 失败:", error);
      return "";
    }
  }

  function setLockedDesignExportHtml(value) {
    lockedDesignExportHtml.value = String(value || "");
  }

  function clearLockedDesignExportHtml() {
    lockedDesignExportHtml.value = "";
  }

  async function applyDesignExportHtml(value) {
    const nextHtml = String(value || "");
    designExportDocumentHtml.value = nextHtml;
    setLockedDesignExportHtml(nextHtml);
    resetDesignFrameSyncState();
    await syncDesignFrameContent(true);
  }

  return {
    applyDesignFrameUiThemeOnly,
    applyDesignExportHtml,
    clearDesignFrameSyncRetry,
    resetDesignFrameSyncState,
    cleanupDesignHeaderStatusObserver,
    releaseDesignFrameBridgeResources,
    syncDesignHeaderStatusFromBridgeState,
    syncDesignHeaderStatusFromFrame,
    syncDesignFrameContent,
    handleDesignFrameLoad,
    triggerDesignReset,
    readDesignFrameCurrentHtml,
    setLockedDesignExportHtml,
    clearLockedDesignExportHtml,
  };
}
