const noop = () => undefined;
const createResolvedValue = (value) => () => Promise.resolve(value);
const pickFunction = (value, fallback) => (typeof value === "function" ? value : fallback);

function clampColorChannel(value, fallback = 255) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(255, Math.max(0, Math.round(numeric)));
}

function normalizeBackgroundColor(background) {
  if (!background || typeof background !== "object") {
    return null;
  }

  return {
    r: clampColorChannel(background.r, 255),
    g: clampColorChannel(background.g, 255),
    b: clampColorChannel(background.b, 255),
    a: clampColorChannel(background.a, 255),
  };
}

export function createWindowShellClient({
  isAvailable = false,
  windowIsMaximised,
  windowMinimise,
  windowFullscreen,
  windowUnfullscreen,
  windowIsFullscreen,
  windowToggleMaximise,
  windowSetDarkTheme,
  windowSetLightTheme,
  windowSetTitle,
  windowSetBackgroundColour,
  quit,
} = {}) {
  const available = isAvailable === true;
  const requestWindowIsMaximised = pickFunction(windowIsMaximised, createResolvedValue(false));
  const requestWindowMinimise = pickFunction(windowMinimise, noop);
  const requestWindowFullscreen = pickFunction(windowFullscreen, noop);
  const requestWindowUnfullscreen = pickFunction(windowUnfullscreen, noop);
  const requestWindowIsFullscreen = pickFunction(windowIsFullscreen, createResolvedValue(false));
  const requestWindowToggleMaximise = pickFunction(windowToggleMaximise, noop);
  const requestWindowSetDarkTheme = pickFunction(windowSetDarkTheme, noop);
  const requestWindowSetLightTheme = pickFunction(windowSetLightTheme, noop);
  const requestWindowSetTitle = pickFunction(windowSetTitle, noop);
  const requestWindowSetBackgroundColour = pickFunction(windowSetBackgroundColour, noop);
  const requestQuit = pickFunction(quit, noop);

  return {
    available,
    isMaximized() {
      return requestWindowIsMaximised();
    },
    enterFullscreen() {
      requestWindowFullscreen();
    },
    exitFullscreen() {
      requestWindowUnfullscreen();
    },
    isFullscreen() {
      return requestWindowIsFullscreen();
    },
    minimize() {
      requestWindowMinimise();
    },
    toggleMaximize() {
      requestWindowToggleMaximise();
    },
    setTitle(title) {
      requestWindowSetTitle(String(title || ""));
    },
    close() {
      requestQuit();
    },
    applyThemeAppearance({ mode = "light", background } = {}) {
      if (!available) {
        return;
      }

      if (String(mode).trim().toLowerCase() === "dark") {
        requestWindowSetDarkTheme();
      } else {
        requestWindowSetLightTheme();
      }

      const normalizedBackground = normalizeBackgroundColor(background);
      if (!normalizedBackground) {
        return;
      }

      requestWindowSetBackgroundColour(
        normalizedBackground.r,
        normalizedBackground.g,
        normalizedBackground.b,
        normalizedBackground.a
      );
    },
  };
}
