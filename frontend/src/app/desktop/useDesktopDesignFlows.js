import { useDesignDocumentBuilder } from "@/modules/design/useDesignDocumentBuilder";
import { useDesignFrameBridge } from "@/modules/design/useDesignFrameBridge";
import { useDesignPageLoader } from "@/modules/design/useDesignPageLoader";
import { useDesignSession } from "@/modules/design/useDesignSession";
import { useDesignWindowMessaging } from "@/modules/design/useDesignWindowMessaging";
import { useExportSurface } from "@/modules/export/useExportSurface";

export function useDesktopDesignFlows({
  desktop,
  designFrameProxy,
  resource,
  document,
  frameBridge,
  session,
  windowMessaging,
}) {
  const { resourceShell, resolveCurrentFilePath } = desktop;

  const designPageFlow = useDesignPageLoader({
    ...resource?.designPage,
    resourceShell,
  });

  const exportSurfaceFlow = useExportSurface({
    ...resource?.exportSurface,
    resourceShell,
  });

  function useDesignSessionBridge(options = {}) {
    return useDesignSession({
      ...options,
      resourceShell,
      resolveCurrentFilePath,
      loadDesignPage: designPageFlow.loadDesignPage,
      releaseDesignPageResources: designPageFlow.releaseDesignPageResources,
      getExportBaseName: exportSurfaceFlow.getExportBaseName,
    });
  }

  const documentFlow = useDesignDocumentBuilder({
    ...document,
    createExportSurface: exportSurfaceFlow.createExportSurface,
    createCurrentPreviewExportSurface: exportSurfaceFlow.createCurrentPreviewExportSurface,
    getExportCssVars: exportSurfaceFlow.getExportCssVars,
    collectExportStyleText: exportSurfaceFlow.collectExportStyleText,
  });

  const frameBridgeFlow = useDesignFrameBridge({
    ...frameBridge,
    getExportBaseName: exportSurfaceFlow.getExportBaseName,
    getDesignUiThemeSnapshot: documentFlow.getDesignUiThemeSnapshot,
    getDesignFontOptionsSnapshot: documentFlow.getDesignFontOptionsSnapshot,
    buildDesignDocumentHtml: documentFlow.buildDesignDocumentHtml,
  });

  if (designFrameProxy?.bindDesignFrameBridge) {
    designFrameProxy.bindDesignFrameBridge({
      applyDesignFrameUiThemeOnly: frameBridgeFlow.applyDesignFrameUiThemeOnly,
      applyDesignExportHtml: frameBridgeFlow.applyDesignExportHtml,
      releaseDesignFrameBridgeResources: frameBridgeFlow.releaseDesignFrameBridgeResources,
      readDesignFrameCurrentHtml: frameBridgeFlow.readDesignFrameCurrentHtml,
    });
  }

  const designSessionFlow = useDesignSessionBridge({
    ...session,
    buildDesignDocumentHtml: documentFlow.buildDesignDocumentHtml,
    syncDesignFrameContent: frameBridgeFlow.syncDesignFrameContent,
    resetDesignFrameSyncState: frameBridgeFlow.resetDesignFrameSyncState,
    readDesignFrameCurrentHtml:
      designFrameProxy?.readDesignFrameCurrentHtml || frameBridgeFlow.readDesignFrameCurrentHtml,
    setLockedDesignExportHtml: frameBridgeFlow.setLockedDesignExportHtml,
    clearLockedDesignExportHtml: frameBridgeFlow.clearLockedDesignExportHtml,
  });

  const windowMessagingFlow = useDesignWindowMessaging({
    ...windowMessaging,
    syncDesignHeaderStatusFromBridgeState:
      frameBridgeFlow.syncDesignHeaderStatusFromBridgeState,
    loadDesignPage: designPageFlow.loadDesignPage,
    loadDesignExportPayload: exportSurfaceFlow.loadDesignExportPayload,
    syncDesignFrameContent: frameBridgeFlow.syncDesignFrameContent,
  });

  return {
    ...designPageFlow,
    ...exportSurfaceFlow,
    ...documentFlow,
    ...frameBridgeFlow,
    ...designSessionFlow,
    ...windowMessagingFlow,
  };
}
