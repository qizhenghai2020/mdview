import {
  BuildFileWorkspace,
  CancelPptGeneration,
  DeleteDesignDraft,
  DeletePptGenerationJob,
  FormatMarkdownWithAI,
  GenerateContentWithAI,
  GeneratePresentationWithAI,
  RegeneratePresentationSlideWithAI,
  GenerateThemeWithAI,
  GetDesignDraft,
  GetDesignExportPayloadPath,
  GetFileName,
  GetFilePath,
  GetPptArtifact,
  GetPptArtifactEditorURL,
  GetPptGenerationJob,
  GetStartupFile,
  GetStartupMode,
  ListExternalFonts,
  OpenDirectoryDialog,
  OpenFileDialog,
  OpenFilesDialog,
  OpenImageFilesDialog,
  ListImageFiles,
  ReadFile,
  ReadFileAndUpdateWatch,
  ReadImageAsBase64,
  ReadTextFileContent,
  ResolveImagePath,
  ResumePptGeneration,
  SaveDesignDraft,
  SavePptArtifact,
  SavePptArtifactVolume,
  StartPptGeneration,
  DeletePptArtifact,
  TestAIModel,
  TestAIModelDetailed,
  WriteFile,
} from "../../../wailsjs/go/backend/App";
import {
  EventsOff,
  EventsOn,
  OnFileDrop,
  OnFileDropOff,
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowFullscreen,
  WindowUnfullscreen,
  WindowIsFullscreen,
  WindowSetBackgroundColour,
  WindowSetDarkTheme,
  WindowSetLightTheme,
  WindowSetTitle,
  WindowToggleMaximise,
} from "../../../wailsjs/runtime/runtime";

const noop = () => undefined;
const createResolvedValue = (value) => () => Promise.resolve(value);
const createRejectedValue = (message) => () => Promise.reject(new Error(message));
const pickFunction = (value, fallback) => (typeof value === "function" ? value : fallback);

function hasWailsBridge() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.runtime) &&
    Boolean(window.go?.backend || window.go?.main)
  );
}

export const isWailsEnv = hasWailsBridge();

export async function waitForWailsReady({
  timeoutMs = 2000,
  intervalMs = 50,
} = {}) {
  if (hasWailsBridge()) {
    return;
  }

  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (hasWailsBridge()) {
        clearInterval(checkInterval);
        clearTimeout(timeoutHandle);
        resolve();
      }
    }, intervalMs);

    const timeoutHandle = setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, timeoutMs);
  });
}

function createRuntimeBridge(runtime = {}) {
  return {
    EventsOn: pickFunction(runtime.EventsOn, noop),
    EventsOff: pickFunction(runtime.EventsOff, noop),
    OnFileDrop: pickFunction(runtime.OnFileDrop, noop),
    OnFileDropOff: pickFunction(runtime.OnFileDropOff, noop),
    WindowMinimise: pickFunction(runtime.WindowMinimise, noop),
    WindowFullscreen: pickFunction(runtime.WindowFullscreen, noop),
    WindowUnfullscreen: pickFunction(runtime.WindowUnfullscreen, noop),
    WindowIsFullscreen: pickFunction(runtime.WindowIsFullscreen, createResolvedValue(false)),
    WindowToggleMaximise: pickFunction(runtime.WindowToggleMaximise, noop),
    WindowIsMaximised: pickFunction(runtime.WindowIsMaximised, createResolvedValue(false)),
    WindowSetDarkTheme: pickFunction(runtime.WindowSetDarkTheme, noop),
    WindowSetLightTheme: pickFunction(runtime.WindowSetLightTheme, noop),
    WindowSetTitle: pickFunction(runtime.WindowSetTitle, noop),
    WindowSetBackgroundColour: pickFunction(runtime.WindowSetBackgroundColour, noop),
    Quit: pickFunction(runtime.Quit, noop),
  };
}

function createAppBridge(app = {}) {
  return {
    OpenFileDialog: pickFunction(app.OpenFileDialog, createResolvedValue("")),
    OpenFilesDialog: pickFunction(app.OpenFilesDialog, createResolvedValue([])),
    OpenImageFilesDialog: pickFunction(app.OpenImageFilesDialog, createResolvedValue([])),
    ListImageFiles: pickFunction(app.ListImageFiles, createResolvedValue([])),
    OpenDirectoryDialog: pickFunction(app.OpenDirectoryDialog, createResolvedValue("")),
    BuildFileWorkspace: pickFunction(app.BuildFileWorkspace, createResolvedValue(null)),
    ListExternalFonts: pickFunction(app.ListExternalFonts, createResolvedValue([])),
    GetDesignDraft: pickFunction(app.GetDesignDraft, createResolvedValue(null)),
    SaveDesignDraft: pickFunction(app.SaveDesignDraft, createResolvedValue(undefined)),
    DeleteDesignDraft: pickFunction(app.DeleteDesignDraft, createResolvedValue(undefined)),
    ReadFile: pickFunction(app.ReadFile, createResolvedValue("")),
    ReadTextFileContent: pickFunction(app.ReadTextFileContent, createResolvedValue("")),
    GetFileName: pickFunction(app.GetFileName, createResolvedValue("")),
    GetFilePath: pickFunction(app.GetFilePath, createResolvedValue("")),
    GetStartupMode: pickFunction(app.GetStartupMode, createResolvedValue("")),
    GetDesignExportPayloadPath: pickFunction(app.GetDesignExportPayloadPath, createResolvedValue("")),
    ResolveImagePath: pickFunction(app.ResolveImagePath, createResolvedValue("")),
    ReadImageAsBase64: pickFunction(app.ReadImageAsBase64, createResolvedValue("")),
    GetStartupFile: pickFunction(app.GetStartupFile, createResolvedValue("")),
    ReadFileAndUpdateWatch: pickFunction(app.ReadFileAndUpdateWatch, createResolvedValue("")),
    WriteFile: pickFunction(app.WriteFile, createResolvedValue(undefined)),
    FormatMarkdownWithAI: pickFunction(
      app.FormatMarkdownWithAI,
      createRejectedValue("请在桌面应用中使用 AI 排版")
    ),
    GenerateContentWithAI: pickFunction(
      app.GenerateContentWithAI,
      createRejectedValue("请在桌面应用中使用 AI 生成")
    ),
    GeneratePresentationWithAI: pickFunction(
      app.GeneratePresentationWithAI,
      createRejectedValue("当前环境不支持 PPT 生成")
    ),
    RegeneratePresentationSlideWithAI: pickFunction(
      app.RegeneratePresentationSlideWithAI,
      createRejectedValue("当前环境不支持 AI 单页重新生成")
    ),
    StartPptGeneration: pickFunction(
      app.StartPptGeneration,
      createRejectedValue("当前环境不支持增量 PPT 生成")
    ),
    ResumePptGeneration: pickFunction(
      app.ResumePptGeneration,
      createRejectedValue("当前环境不支持继续 PPT 生成")
    ),
    GetPptGenerationJob: pickFunction(app.GetPptGenerationJob, createResolvedValue(null)),
    CancelPptGeneration: pickFunction(app.CancelPptGeneration, createResolvedValue(undefined)),
    DeletePptGenerationJob: pickFunction(app.DeletePptGenerationJob, createResolvedValue(undefined)),
    GenerateThemeWithAI: pickFunction(
      app.GenerateThemeWithAI,
      createRejectedValue("请在桌面应用中生成智能主题")
    ),
    GetPptArtifact: pickFunction(app.GetPptArtifact, createResolvedValue(null)),
    GetPptArtifactEditorURL: pickFunction(app.GetPptArtifactEditorURL, createResolvedValue("")),
    SavePptArtifact: pickFunction(app.SavePptArtifact, createRejectedValue("当前环境不支持 PPT 保存")),
    SavePptArtifactVolume: pickFunction(
      app.SavePptArtifactVolume,
      createRejectedValue("当前环境不支持 PPT 分卷保存")
    ),
    DeletePptArtifact: pickFunction(app.DeletePptArtifact, createResolvedValue(undefined)),
    TestAIModel: pickFunction(
      app.TestAIModel,
      createRejectedValue("请在桌面应用中测试模型")
    ),
  };
}

export function createWailsBridge() {
  const runtimeBridge = createRuntimeBridge({
    EventsOn,
    EventsOff,
    OnFileDrop,
    OnFileDropOff,
    WindowMinimise,
    WindowFullscreen,
    WindowUnfullscreen,
    WindowIsFullscreen,
    WindowToggleMaximise,
    WindowIsMaximised,
    WindowSetDarkTheme,
    WindowSetLightTheme,
    WindowSetTitle,
    WindowSetBackgroundColour,
    Quit,
  });

  const appBridge = createAppBridge({
    OpenFileDialog,
    OpenFilesDialog,
    OpenImageFilesDialog,
    ListImageFiles,
    OpenDirectoryDialog,
    BuildFileWorkspace,
    ListExternalFonts,
    GetDesignDraft,
    SaveDesignDraft,
    DeleteDesignDraft,
    ReadFile,
    ReadTextFileContent,
    GetFileName,
    GetFilePath,
    GetStartupMode,
    GetDesignExportPayloadPath,
    ResolveImagePath,
    ReadImageAsBase64,
    GetStartupFile,
    ReadFileAndUpdateWatch,
    WriteFile,
    FormatMarkdownWithAI,
    GenerateContentWithAI,
    GeneratePresentationWithAI,
    RegeneratePresentationSlideWithAI,
    StartPptGeneration,
    ResumePptGeneration,
    GetPptGenerationJob,
    CancelPptGeneration,
    DeletePptGenerationJob,
    GenerateThemeWithAI,
    GetPptArtifact,
    GetPptArtifactEditorURL,
    SavePptArtifact,
    SavePptArtifactVolume,
    DeletePptArtifact,
    TestAIModel: TestAIModelDetailed || TestAIModel,
  });

  return {
    runtime: isWailsEnv ? runtimeBridge : createRuntimeBridge(),
    app: isWailsEnv ? appBridge : createAppBridge(),
  };
}
