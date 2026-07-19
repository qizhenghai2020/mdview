import { normalizeHeadingText } from "@/shared/markdown/headingText";

const DEFAULT_SCROLL_TOP_OFFSET = 30;

export function useHeadingNavigation({
  activeTocId,
  viewMode,
  previewRef,
  liveEditorRef,
  tocItems,
  scrollTopOffset = DEFAULT_SCROLL_TOP_OFFSET,
}) {
  function findLiveHeadingElement(id) {
    const container = liveEditorRef.value;
    if (!container) {
      return null;
    }

    const escapedId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id;
    const matchedById = container.querySelector(`#${escapedId}`);
    if (matchedById) {
      return matchedById;
    }

    const tocItem = tocItems.value.find((item) => item.id === id);
    if (!tocItem) {
      return null;
    }

    const targetText = normalizeHeadingText(tocItem.text);
    const matchedItems = tocItems.value.filter((item) => {
      return item.level === tocItem.level && normalizeHeadingText(item.text) === targetText;
    });
    const targetIndex = Math.max(
      0,
      matchedItems.findIndex((item) => item.id === id)
    );
    const matchedNodes = Array.from(
      container.querySelectorAll(`h${tocItem.level}, .DOMD-H${tocItem.level}`)
    ).filter((node) => normalizeHeadingText(node.textContent) === targetText);

    return matchedNodes[targetIndex] || matchedNodes[0] || null;
  }

  function scrollToHeading(target) {
    const id = typeof target === "string" ? target : target.id;
    activeTocId.value = id;
    const element =
      viewMode.value === "live" ? findLiveHeadingElement(id) : document.getElementById(id);
    if (!element) {
      return;
    }

    const container =
      viewMode.value === "split"
        ? previewRef.value
        : viewMode.value === "live"
          ? liveEditorRef.value
          : document.querySelector(".content-area");
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
    container.scrollTop = relativeTop - scrollTopOffset;
  }

  return {
    scrollToHeading,
  };
}
