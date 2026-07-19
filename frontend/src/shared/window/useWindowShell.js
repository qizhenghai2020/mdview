const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
const MIN_BROWSER_ZOOM = 50;
const MAX_BROWSER_ZOOM = 200;
const BROWSER_ZOOM_STEP = 10;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function useWindowShell({
  filePath,
  zoomLevel,
  browserZoomLevel,
  browserViewportWidth,
  browserViewportHeight,
  isWindowMaximized,
  windowShell,
  getBrowserViewportWidth,
  getBrowserViewportHeight,
  refreshCurrentFile,
  showToast,
}) {
  function syncBrowserZoomViewport() {
    browserViewportWidth.value = getBrowserViewportWidth();
    browserViewportHeight.value = getBrowserViewportHeight();
  }

  async function syncWindowMaximizedState() {
    if (!windowShell?.available) {
      return;
    }

    try {
      isWindowMaximized.value = Boolean(await windowShell.isMaximized());
    } catch (error) {
      console.warn("读取窗口状态失败:", error);
    }
  }

  function handleWindowFocus() {
    if (filePath.value) {
      refreshCurrentFile({ polling: true });
    }
    syncBrowserZoomViewport();
    void syncWindowMaximizedState();
  }

  function handleWindowResize() {
    syncBrowserZoomViewport();
    void syncWindowMaximizedState();
  }

  function minimizeWindow() {
    windowShell?.minimize();
  }

  function toggleWindowMaximize(event) {
    if (event?.target?.closest("button, input, select, textarea, a")) {
      return;
    }
    windowShell?.toggleMaximize();
    window.setTimeout(handleWindowResize, 120);
  }

  function closeWindow() {
    windowShell?.close();
  }

  function applyZoom() {
    document.documentElement.style.setProperty(
      "--base-font-size",
      `${16 * (zoomLevel.value / 100)}px`
    );
  }

  function zoomIn() {
    if (zoomLevel.value < MAX_ZOOM) {
      zoomLevel.value += ZOOM_STEP;
      applyZoom();
    }
  }

  function zoomOut() {
    if (zoomLevel.value > MIN_ZOOM) {
      zoomLevel.value -= ZOOM_STEP;
      applyZoom();
    }
  }

  function resetZoom() {
    zoomLevel.value = 100;
    applyZoom();
  }

  function setBrowserZoomLevel(nextZoom) {
    browserZoomLevel.value = clampNumber(
      Math.round(nextZoom / BROWSER_ZOOM_STEP) * BROWSER_ZOOM_STEP,
      MIN_BROWSER_ZOOM,
      MAX_BROWSER_ZOOM
    );
  }

  function resetBrowserZoom() {
    setBrowserZoomLevel(100);
    showToast("浏览器缩放已还原为 100%", "success");
  }

  function handleBrowserZoomWheel(event) {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setBrowserZoomLevel(browserZoomLevel.value + direction * BROWSER_ZOOM_STEP);
  }

  return {
    syncBrowserZoomViewport,
    syncWindowMaximizedState,
    handleWindowFocus,
    handleWindowResize,
    minimizeWindow,
    toggleWindowMaximize,
    closeWindow,
    applyZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    resetBrowserZoom,
    handleBrowserZoomWheel,
  };
}
