import { resolveMarkdownImagesInContainer } from "@/shared/markdown/renderPostProcess";

const DEFAULT_MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_BASE64_CACHE_ENTRIES = 48;

export function usePreviewImageResolver({
  renderedHtml,
  previewRef,
  imageBridge,
  maxValueLength = DEFAULT_MAX_IMAGE_BASE64_LENGTH,
  maxCacheEntries = DEFAULT_MAX_IMAGE_BASE64_CACHE_ENTRIES,
}) {
  const imageBase64Cache = new Map();
  let imageProcessingToken = 0;

  function cancelPendingPreviewImages() {
    imageProcessingToken += 1;
  }

  function processImagePaths() {
    const runToken = ++imageProcessingToken;
    if (!String(renderedHtml.value || "").includes("<img")) {
      return;
    }

    const previewRoot = previewRef.value;
    const containers = previewRoot ? Array.from(previewRoot.querySelectorAll(".markdown-body")) : [];
    if (!containers.length) {
      return;
    }

    for (const container of containers) {
      void resolveMarkdownImagesInContainer({
        container,
        resolveImagePath: (value) => imageBridge?.resolveImagePath(value) || "",
        readImageAsBase64: (value) => imageBridge?.readImageAsBase64(value) || "",
        cache: imageBase64Cache,
        maxValueLength,
        maxCacheEntries,
        shouldContinue: () => runToken === imageProcessingToken,
      });
    }
  }

  return {
    processImagePaths,
    cancelPendingPreviewImages,
  };
}
