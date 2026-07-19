import { createDesktopShell } from "@/shared/wails/desktopShell";
import { useDesktopAppearanceBridge } from "@/shared/wails/useDesktopAppearanceBridge";
import { useDesktopSessionLifecycle } from "@/shared/wails/useDesktopSessionLifecycle";
import { useAppShellControls } from "@/shared/window/useAppShellControls";

export function useDesktopAppShell() {
  const desktopShell = createDesktopShell();
  const {
    isWailsEnv,
    waitForReady,
    aiClient,
    fileShell,
    resourceShell,
    sessionShell,
    windowShell,
  } = desktopShell;

  const previewImageBridge = Object.freeze({
    resolveImagePath(value) {
      return resourceShell.resolveImagePath(value);
    },
    readImageAsBase64(value) {
      return resourceShell.readImageAsBase64(value);
    },
  });
  const testModelAction = aiClient.supports("testModel")
    ? (model) => aiClient.testModel(model)
    : null;

  function useAppearanceBridge(options = {}) {
    return useDesktopAppearanceBridge({
      ...options,
      resourceShell,
      windowShell,
    });
  }

  function useShellControls(options = {}) {
    return useAppShellControls({
      ...options,
      window: {
        ...(options.window || {}),
        windowShell,
      },
    });
  }

  function useSessionLifecycle(options = {}) {
    return useDesktopSessionLifecycle({
      ...options,
      isWailsEnv,
      waitForReady,
      sessionShell,
      aiClient,
    });
  }

  return {
    ...desktopShell,
    aiBridge: aiClient,
    previewImageBridge,
    testModelAction,
    resolveCurrentFilePath() {
      return fileShell.getCurrentFilePath();
    },
    useAppearanceBridge,
    useShellControls,
    useSessionLifecycle,
  };
}
