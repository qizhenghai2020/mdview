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
  eventsOn,
  eventsOff,
} = {}) {
  const supportsTestModel = typeof testModel === "function";
  const supportsFormatDocument = typeof formatDocument === "function";
  const supportsGenerateTheme = typeof generateTheme === "function";
  const supportsGenerateContent = typeof generateContent === "function";
  const supportsProgressSubscription =
    typeof eventsOn === "function" && typeof eventsOff === "function";
  const capabilities = Object.freeze({
    testModel: supportsTestModel,
    formatDocument: supportsFormatDocument,
    generateTheme: supportsGenerateTheme,
    generateContent: supportsGenerateContent,
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
  const requestEventsOn = pickHandler(eventsOn, noop);
  const requestEventsOff = pickHandler(eventsOff, noop);

  return {
    available:
      supportsTestModel ||
      supportsFormatDocument ||
      supportsGenerateTheme ||
      supportsGenerateContent ||
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
