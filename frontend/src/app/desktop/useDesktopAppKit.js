import { useDesktopDesignFlows } from "@/app/desktop/useDesktopDesignFlows";
import { useDesktopAppShell } from "@/shared/wails/useDesktopAppShell";
import { useAiModule } from "@/modules/ai/useAiModule";
import { useDesignSourceReader } from "@/modules/design/useDesignSourceReader";
import { useFileEntryFlow } from "@/modules/file-explorer/useFileEntryFlow";
import { useWorkspaceFileFlow } from "@/modules/file-explorer/useWorkspaceFileFlow";
import { useFileSaveAction } from "@/modules/file-sync/useFileSaveAction";
import { useFileWatchFlow } from "@/modules/file-sync/useFileWatchFlow";

const noop = () => undefined;
const noopAsync = async () => "";

function createViewBindings(desktop) {
  const imageResolverBindings = Object.freeze({
    resolveImagePath: desktop.previewImageBridge.resolveImagePath,
    readImageAsBase64: desktop.previewImageBridge.readImageAsBase64,
  });
  const settingsModalBindings = Object.freeze({
    testModel: desktop.testModelAction,
  });

  return {
    showNativeWindowControls: desktop.isWailsEnv,
    startupContextReadyDefault: !desktop.isWailsEnv,
    imageResolverBindings,
    settingsModalBindings,
  };
}

function createDesignFrameBridgeProxy() {
  let applyDesignFrameUiThemeOnlyImpl = noop;
  let applyDesignExportHtmlImpl = noopAsync;
  let releaseDesignFrameBridgeResourcesImpl = noop;
  let readDesignFrameCurrentHtmlImpl = noopAsync;

  function bindDesignFrameBridge(bridge = {}) {
    applyDesignFrameUiThemeOnlyImpl =
      typeof bridge.applyDesignFrameUiThemeOnly === "function"
        ? bridge.applyDesignFrameUiThemeOnly
        : noop;
    applyDesignExportHtmlImpl =
      typeof bridge.applyDesignExportHtml === "function"
        ? bridge.applyDesignExportHtml
        : noopAsync;
    releaseDesignFrameBridgeResourcesImpl =
      typeof bridge.releaseDesignFrameBridgeResources === "function"
        ? bridge.releaseDesignFrameBridgeResources
        : noop;
    readDesignFrameCurrentHtmlImpl =
      typeof bridge.readDesignFrameCurrentHtml === "function"
        ? bridge.readDesignFrameCurrentHtml
        : noopAsync;
  }

  return {
    bindDesignFrameBridge,
    applyDesignFrameUiThemeOnly(...args) {
      return applyDesignFrameUiThemeOnlyImpl(...args);
    },
    async applyDesignExportHtml(...args) {
      return await applyDesignExportHtmlImpl(...args);
    },
    releaseDesignFrameBridgeResources(...args) {
      return releaseDesignFrameBridgeResourcesImpl(...args);
    },
    async readDesignFrameCurrentHtml(...args) {
      return await readDesignFrameCurrentHtmlImpl(...args);
    },
  };
}

function createAiFlows({ desktop, moduleOptions }) {
  const aiFlow = useAiModule({
    ...moduleOptions,
    bridge: {
      ...(moduleOptions?.bridge || {}),
      aiClient: desktop.aiBridge,
    },
  });

  return {
    ...aiFlow,
    testModelAction: desktop.testModelAction,
  };
}

function createFileFlows({
  desktop,
  designSource,
  fileWatch,
  fileSave,
  workspace,
  fileEntry,
}) {
  const { fileShell, sessionShell } = desktop;

  const designSourceFlow = useDesignSourceReader({
    ...designSource,
    fileShell,
  });

  const fileWatchFlow = useFileWatchFlow({
    ...fileWatch,
    fileShell,
  });

  const workspaceFlow = useWorkspaceFileFlow({
    ...workspace,
    fileShell,
  });

  const fileEntryFlow = useFileEntryFlow({
    ...fileEntry,
    sessionShell,
    setFileWorkspace: workspaceFlow.setFileWorkspace,
  });

  const fileSaveFlow = useFileSaveAction({
    ...fileSave,
    fileShell,
    clearFileConflict: fileWatchFlow.clearFileConflict,
    markFileConflict: fileWatchFlow.markFileConflict,
  });

  return {
    ...designSourceFlow,
    ...fileWatchFlow,
    ...workspaceFlow,
    ...fileEntryFlow,
    ...fileSaveFlow,
  };
}

function createRuntimeFlows({
  desktop,
  appearance,
  controls,
  session,
}) {
  const appearanceFlow = appearance ? desktop.useAppearanceBridge(appearance) : {};
  const controlsFlow = controls ? desktop.useShellControls(controls) : {};
  const sessionFlow =
    session && controls
      ? desktop.useSessionLifecycle({
          ...session,
          syncBrowserZoomViewport: controlsFlow.syncBrowserZoomViewport,
          syncWindowMaximizedState: controlsFlow.syncWindowMaximizedState,
        })
      : {};

  return {
    ...appearanceFlow,
    ...controlsFlow,
    ...sessionFlow,
  };
}

export function useDesktopAppKit() {
  const desktopAppShell = useDesktopAppShell();
  const viewBindings = createViewBindings(desktopAppShell);
  const designFrameBridgeProxy = createDesignFrameBridgeProxy();
  const {
    applyDesignFrameUiThemeOnly,
    applyDesignExportHtml,
    releaseDesignFrameBridgeResources,
    readDesignFrameCurrentHtml,
  } = designFrameBridgeProxy;

  function useAiFlows(moduleOptions) {
    return createAiFlows({
      desktop: desktopAppShell,
      moduleOptions,
    });
  }

  function useFileFlows(options = {}) {
    return createFileFlows({
      desktop: desktopAppShell,
      ...options,
    });
  }

  function useDesignFlows(options = {}) {
    return useDesktopDesignFlows({
      desktop: desktopAppShell,
      designFrameProxy: designFrameBridgeProxy,
      ...options,
    });
  }

  function useRuntimeFlows(options = {}) {
    return createRuntimeFlows({
      desktop: desktopAppShell,
      ...options,
    });
  }

  return {
    ...viewBindings,
    applyDesignFrameUiThemeOnly,
    applyDesignExportHtml,
    releaseDesignFrameBridgeResources,
    readDesignFrameCurrentHtml,
    useAiFlows,
    useDesignFlows,
    useFileFlows,
    useRuntimeFlows,
  };
}
