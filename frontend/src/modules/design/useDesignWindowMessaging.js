import { nextTick } from "vue";

export function useDesignWindowMessaging({
  designFrameRef,
  showDesignExportModal,
  isPreparingDesignExport,
  startupContextReady,
  designLoadError,
  designExportError,
  syncDesignHeaderStatusFromBridgeState,
  openDesignSmartFormatPrompt,
  loadDesignPage,
  loadDesignExportPayload,
  syncDesignFrameContent,
}) {
  function handleDesignAiFormatMessage(event) {
    const data = event?.data || {};
    if (data?.type !== "md-viewer-open-design-ai-format") {
      return;
    }
    if (data?.source !== "html-designer") {
      return;
    }

    void openDesignSmartFormatPrompt();
  }

  function handleDesignBridgeMessage(event) {
    const data = event?.data || {};
    if (data?.type !== "md-viewer-design-state") {
      return;
    }
    if (data?.source !== "html-designer") {
      return;
    }
    if (
      event?.source &&
      designFrameRef.value?.contentWindow &&
      event.source !== designFrameRef.value.contentWindow
    ) {
      return;
    }
    syncDesignHeaderStatusFromBridgeState(data?.state || {});
  }

  function attachDesignWindowMessageListeners() {
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("message", handleDesignBridgeMessage);
    window.addEventListener("message", handleDesignAiFormatMessage);
  }

  function detachDesignWindowMessageListeners() {
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener("message", handleDesignBridgeMessage);
    window.removeEventListener("message", handleDesignAiFormatMessage);
  }

  async function initializeDesignExportWindowStartup() {
    showDesignExportModal.value = true;
    isPreparingDesignExport.value = true;
    startupContextReady.value = true;
    try {
      await loadDesignPage(true);
      if (designLoadError.value) {
        throw new Error(designLoadError.value);
      }
      await loadDesignExportPayload();
      await nextTick();
      await syncDesignFrameContent(true);
    } catch (error) {
      designExportError.value = error?.message || String(error);
    } finally {
      isPreparingDesignExport.value = false;
    }
  }

  return {
    attachDesignWindowMessageListeners,
    detachDesignWindowMessageListeners,
    initializeDesignExportWindowStartup,
  };
}
