import { nextTick } from "vue";

function applyThemeAppearance(windowShell, mode, background) {
  windowShell?.applyThemeAppearance?.({
    mode,
    background,
  });
}

export function useDesktopAppearanceBridge({
  resourceShell,
  windowShell,
  isLoading,
  loadingText,
  setExternalFontOptions,
  registerExternalFontFaces,
  resolveSmartThemeBackground,
}) {
  function applyWindowThemeAppearance({ themeId, smartTheme }) {
    if (smartTheme) {
      const background = resolveSmartThemeBackground(smartTheme);
      applyThemeAppearance(
        windowShell,
        smartTheme.mode === "dark" ? "dark" : "light",
        { ...background, a: 255 }
      );
      return;
    }

    if (themeId === "dark") {
      applyThemeAppearance(windowShell, "dark", { r: 13, g: 17, b: 23, a: 255 });
      return;
    }

    if (themeId === "elegant") {
      applyThemeAppearance(windowShell, "light", { r: 246, g: 241, b: 232, a: 255 });
      return;
    }

    applyThemeAppearance(windowShell, "light", { r: 255, g: 255, b: 255, a: 255 });
  }

  async function refreshExternalFonts({ showLoading = false } = {}) {
    if (!resourceShell.available) {
      setExternalFontOptions([]);
      registerExternalFontFaces([]);
      return;
    }

    const shouldShowLoading = showLoading && !isLoading.value;
    try {
      if (shouldShowLoading) {
        loadingText.value = "正在读取字体...";
        isLoading.value = true;
        await nextTick();
      }

      const fonts = await resourceShell.listExternalFonts();
      setExternalFontOptions(fonts);
      registerExternalFontFaces(fonts);
    } catch (error) {
      console.warn("加载外部字体失败:", error);
    } finally {
      if (shouldShowLoading) {
        isLoading.value = false;
      }
    }
  }

  return {
    applyWindowThemeAppearance,
    refreshExternalFonts,
  };
}
