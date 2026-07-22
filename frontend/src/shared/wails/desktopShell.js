import { createAiClient } from "@/shared/ai/client";
import { createWailsBridge, isWailsEnv, waitForWailsReady } from "@/shared/wails/appBridge";
import { createFileShellClient } from "@/shared/wails/fileShell";
import { createResourceShellClient } from "@/shared/wails/resourceShell";
import { createSessionShellClient } from "@/shared/wails/sessionShell";
import { createWindowShellClient } from "@/shared/wails/windowShell";

export function createDesktopShell() {
  const { runtime = {}, app = {} } = createWailsBridge();

  const aiClient = createAiClient({
    testModel: app.TestAIModel,
    formatDocument: app.FormatMarkdownWithAI,
    generateTheme: app.GenerateThemeWithAI,
    generateContent: app.GenerateContentWithAI,
    eventsOn: runtime.EventsOn,
    eventsOff: runtime.EventsOff,
  });

  const fileShell = createFileShellClient({
    isAvailable: isWailsEnv,
    openFileDialog: app.OpenFileDialog,
    openFilesDialog: app.OpenFilesDialog,
    openDirectoryDialog: app.OpenDirectoryDialog,
    buildFileWorkspace: app.BuildFileWorkspace,
    readFile: app.ReadFile,
    readFileAndUpdateWatch: app.ReadFileAndUpdateWatch,
    writeFile: app.WriteFile,
    getFileName: app.GetFileName,
    getFilePath: app.GetFilePath,
  });

  const resourceShell = createResourceShellClient({
    isAvailable: isWailsEnv,
    listExternalFonts: app.ListExternalFonts,
    resolveImagePath: app.ResolveImagePath,
    readImageAsBase64: app.ReadImageAsBase64,
    readTextFileContent: app.ReadTextFileContent,
    getDesignExportPayloadPath: app.GetDesignExportPayloadPath,
    getDesignDraft: app.GetDesignDraft,
    saveDesignDraft: app.SaveDesignDraft,
    deleteDesignDraft: app.DeleteDesignDraft,
  });

  const sessionShell = createSessionShellClient({
    isAvailable: isWailsEnv,
    getStartupFile: app.GetStartupFile,
    getStartupMode: app.GetStartupMode,
    eventsOn: runtime.EventsOn,
    eventsOff: runtime.EventsOff,
    onFileDrop: runtime.OnFileDrop,
    onFileDropOff: runtime.OnFileDropOff,
  });

  const windowShell = createWindowShellClient({
    isAvailable: isWailsEnv,
    windowIsMaximised: runtime.WindowIsMaximised,
    windowMinimise: runtime.WindowMinimise,
    windowToggleMaximise: runtime.WindowToggleMaximise,
    windowSetDarkTheme: runtime.WindowSetDarkTheme,
    windowSetLightTheme: runtime.WindowSetLightTheme,
    windowSetBackgroundColour: runtime.WindowSetBackgroundColour,
    quit: runtime.Quit,
  });

  return {
    isWailsEnv,
    waitForReady: waitForWailsReady,
    aiClient,
    fileShell,
    resourceShell,
    sessionShell,
    windowShell,
  };
}
