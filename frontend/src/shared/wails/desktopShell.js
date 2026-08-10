import { createAiClient } from "@/shared/ai/client";
import { createWailsBridge, isWailsEnv, waitForWailsReady } from "@/shared/wails/appBridge";
import { createFileShellClient } from "@/shared/wails/fileShell";
import { createResourceShellClient } from "@/shared/wails/resourceShell";
import { createPptArtifactShell } from "@/shared/wails/pptArtifactShell";
import { createSessionShellClient } from "@/shared/wails/sessionShell";
import { createWindowShellClient } from "@/shared/wails/windowShell";

export function createDesktopShell() {
  const { runtime = {}, app = {} } = createWailsBridge();

  const aiClient = createAiClient({
    testModel: app.TestAIModel,
    formatDocument: app.FormatMarkdownWithAI,
    generateTheme: app.GenerateThemeWithAI,
    generateContent: app.GenerateContentWithAI,
    generatePresentation: app.GeneratePresentationWithAI,
    regeneratePresentationSlide: app.RegeneratePresentationSlideWithAI,
    startPresentationGeneration: app.StartPptGeneration,
    resumePresentationGeneration: app.ResumePptGeneration,
    getPresentationGeneration: app.GetPptGenerationJob,
    cancelPresentationGeneration: app.CancelPptGeneration,
    deletePresentationGeneration: app.DeletePptGenerationJob,
    eventsOn: runtime.EventsOn,
    eventsOff: runtime.EventsOff,
  });

  const fileShell = createFileShellClient({
    isAvailable: isWailsEnv,
    openFileDialog: app.OpenFileDialog,
    openFilesDialog: app.OpenFilesDialog,
    openImageFilesDialog: app.OpenImageFilesDialog,
    listImageFiles: app.ListImageFiles,
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

  const pptArtifactShell = createPptArtifactShell({
    isAvailable: isWailsEnv,
    getArtifact: app.GetPptArtifact,
    getEditorURL: app.GetPptArtifactEditorURL,
    saveArtifact: app.SavePptArtifact,
    saveArtifactVolume: app.SavePptArtifactVolume,
    deleteArtifact: app.DeletePptArtifact,
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
    windowFullscreen: runtime.WindowFullscreen,
    windowUnfullscreen: runtime.WindowUnfullscreen,
    windowIsFullscreen: runtime.WindowIsFullscreen,
    windowToggleMaximise: runtime.WindowToggleMaximise,
    windowSetDarkTheme: runtime.WindowSetDarkTheme,
    windowSetLightTheme: runtime.WindowSetLightTheme,
    windowSetTitle: runtime.WindowSetTitle,
    windowSetBackgroundColour: runtime.WindowSetBackgroundColour,
    quit: runtime.Quit,
  });

  return {
    isWailsEnv,
    waitForReady: waitForWailsReady,
    aiClient,
    fileShell,
    resourceShell,
    pptArtifactShell,
    sessionShell,
    windowShell,
  };
}
