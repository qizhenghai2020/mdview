export function useDesktopSessionLifecycle({
  isWailsEnv,
  waitForReady,
  sessionShell,
  aiClient,
  startupMode,
  startupContextReady,
  isDesignExportWindow,
  initializeDesignExportWindowStartup,
  loadStartupFile,
  showWelcome,
  startFilePolling,
  syncBrowserZoomViewport,
  syncWindowMaximizedState,
  handleFileChanged,
  handleNativeFileDrop,
  handleAIFormatProgress,
}) {
  async function attachDesktopSessionListeners() {
    try {
      sessionShell.attachSessionListeners({
        onFileChanged: handleFileChanged,
        onNativeFileDrop: handleNativeFileDrop,
      });
    } catch (error) {
      console.warn("注册桌面会话监听失败:", error);
    }

    try {
      aiClient.subscribeProgress(handleAIFormatProgress);
    } catch (error) {
      console.warn("注册 AI 进度监听失败:", error);
    }
  }

  function detachDesktopSessionListeners() {
    if (!sessionShell.available) {
      return;
    }

    try {
      sessionShell.detachSessionListeners();
    } catch (error) {
      console.warn("取消桌面会话监听失败:", error);
    }

    try {
      aiClient.unsubscribeProgress();
    } catch (error) {
      console.warn("取消 AI 进度监听失败:", error);
    }
  }

  async function initializeDesktopSession() {
    if (!isWailsEnv) {
      startupContextReady.value = true;
      showWelcome();
      return;
    }

    await waitForReady();
    attachDesktopSessionListeners();

    startFilePolling();
    syncBrowserZoomViewport();
    await syncWindowMaximizedState();

    startupMode.value = (await sessionShell.getStartupMode()) || "";
    if (isDesignExportWindow.value) {
      await initializeDesignExportWindowStartup();
      return;
    }

    startupContextReady.value = true;
    const loaded = await loadStartupFile();
    if (!loaded) {
      showWelcome();
    }
  }

  return {
    initializeDesktopSession,
    detachDesktopSessionListeners,
  };
}
