import { buildAIModelPayload } from "@/shared/ai/request";
import { normalizeAIProgressPayload } from "@/shared/ai/progress";

const noop = () => undefined;
const createUnavailableHandler = (message) => () => Promise.reject(new Error(message));
const pickHandler = (handler, fallback) => (typeof handler === "function" ? handler : fallback);
const AI_PROGRESS_EVENT_NAME = "ai-format-progress";

export function createAiClient({
  testModel,
  formatDocument,
  generateTheme,
  generateContent,
  generatePresentation,
  regeneratePresentationSlide,
  startPresentationGeneration,
  resumePresentationGeneration,
  getPresentationGeneration,
  cancelPresentationGeneration,
  deletePresentationGeneration,
  eventsOn,
  eventsOff,
} = {}) {
  const supportsTestModel = typeof testModel === "function";
  const supportsFormatDocument = typeof formatDocument === "function";
  const supportsGenerateTheme = typeof generateTheme === "function";
  const supportsGenerateContent = typeof generateContent === "function";
  const supportsGeneratePresentation = typeof generatePresentation === "function";
  const supportsRegeneratePresentationSlide = typeof regeneratePresentationSlide === "function";
  const supportsIncrementalPresentation =
    typeof startPresentationGeneration === "function" &&
    typeof resumePresentationGeneration === "function" &&
    typeof getPresentationGeneration === "function";
  const supportsProgressSubscription =
    typeof eventsOn === "function" && typeof eventsOff === "function";
  const capabilities = Object.freeze({
    testModel: supportsTestModel,
    formatDocument: supportsFormatDocument,
    generateTheme: supportsGenerateTheme,
    generateContent: supportsGenerateContent,
    generatePresentation: supportsGeneratePresentation,
    presentationSlide: supportsRegeneratePresentationSlide,
    incrementalPresentation: supportsIncrementalPresentation,
    progressSubscription: supportsProgressSubscription,
  });

  const requestTestModel = pickHandler(
    testModel,
    createUnavailableHandler("请在桌面应用中测试模型")
  );
  const requestFormatDocument = pickHandler(
    formatDocument,
    createUnavailableHandler("请在桌面应用中使用 AI 排版")
  );
  const requestGenerateTheme = pickHandler(
    generateTheme,
    createUnavailableHandler("请在桌面应用中生成智能主题")
  );
  const requestGenerateContent = pickHandler(
    generateContent,
    createUnavailableHandler("请在桌面应用中生成内容")
  );
  const requestGeneratePresentation = pickHandler(
    generatePresentation,
    createUnavailableHandler("当前环境不支持 PPT 生成")
  );
  const requestStartPresentationGeneration = pickHandler(
    startPresentationGeneration,
    createUnavailableHandler("当前环境不支持增量 PPT 生成")
  );
  const requestResumePresentationGeneration = pickHandler(
    resumePresentationGeneration,
    createUnavailableHandler("当前环境不支持继续 PPT 生成")
  );
  const requestGetPresentationGeneration = pickHandler(
    getPresentationGeneration,
    createUnavailableHandler("当前环境不支持读取 PPT 生成任务")
  );
  const requestCancelPresentationGeneration = pickHandler(cancelPresentationGeneration, noop);
  const requestDeletePresentationGeneration = pickHandler(deletePresentationGeneration, noop);
  const requestEventsOn = pickHandler(eventsOn, noop);
  const requestEventsOff = pickHandler(eventsOff, noop);

  return {
    available:
      supportsTestModel ||
      supportsFormatDocument ||
      supportsGenerateTheme ||
      supportsGenerateContent ||
      supportsGeneratePresentation ||
      supportsRegeneratePresentationSlide ||
      supportsIncrementalPresentation ||
      supportsProgressSubscription,
    capabilities,
    supports(capability) {
      return capabilities[String(capability || "")] === true;
    },
    testModel(model) {
      return requestTestModel(buildAIModelPayload(model));
    },
    formatDocument(request = {}) {
      return requestFormatDocument({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    generateTheme(request = {}) {
      return requestGenerateTheme({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    generateContent(request = {}) {
      return requestGenerateContent({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    generatePresentation(request = {}) {
      return requestGeneratePresentation({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    regeneratePresentationSlide(request = {}) {
      const requestHandler = pickHandler(
        regeneratePresentationSlide,
        createUnavailableHandler("当前环境不支持 AI 单页重新生成")
      );
      return requestHandler({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    startPresentationGeneration(request = {}) {
      return requestStartPresentationGeneration({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    resumePresentationGeneration(request = {}) {
      return requestResumePresentationGeneration({
        ...request,
        model: buildAIModelPayload(request?.model),
      });
    },
    getPresentationGeneration(sourcePath) {
      return requestGetPresentationGeneration(sourcePath);
    },
    cancelPresentationGeneration(sourcePath) {
      return requestCancelPresentationGeneration(sourcePath);
    },
    deletePresentationGeneration(sourcePath) {
      return requestDeletePresentationGeneration(sourcePath);
    },
    subscribeProgress(handler) {
      if (typeof handler !== "function") {
        return;
      }
      requestEventsOn(AI_PROGRESS_EVENT_NAME, (payload) => {
        handler(normalizeAIProgressPayload(payload));
      });
    },
    unsubscribeProgress() {
      requestEventsOff(AI_PROGRESS_EVENT_NAME);
    },
  };
}
