import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DOMD,
  DOMDProvider,
  useEditor,
  useEditorDom,
  useEditorStore,
} from "@do-md/core-react";
import { createLiveEditImageLoader } from "./imageLoader";
import {
  CODE_LANGUAGE_SUGGESTIONS,
  INSERT_ITEM_TYPES,
  MENU_ITEM_ACTIONS,
  buildMarkdownContextMenuSections,
  buildInsertSnippet,
  createAiGenerationRequest,
  createDirectInsertSnippet,
  createInsertDraft,
  createGeneratedInsertSnippet,
  getHeadingLevelLabel,
  getNthHashHeadingContext,
  normalizeHeadingLevel,
  replaceHashHeadingLevel,
  resolveFloatingMenuPosition,
  shouldOpenInsertDialog,
} from "./insertMenuShared";
import { saveImageToDocumentDirectory } from "./imageInsert";
import { isPerfDebugEnabled } from "@/shared/perf/debugFlags";
import { tokenize } from "./prismTokenizer";

const LIVE_SYNC_DELAY = 520;
const LIVE_IDLE_SYNC_TIMEOUT = 320;
const LARGE_DOC_SYNC_THRESHOLD = 80000;
const HUGE_DOC_SYNC_THRESHOLD = 180000;
const LARGE_DOC_SYNC_DELAY = 760;
const LARGE_DOC_IDLE_TIMEOUT = 440;
const HUGE_DOC_SYNC_DELAY = 980;
const HUGE_DOC_IDLE_TIMEOUT = 620;
const LIVE_PERF_ENABLED = isPerfDebugEnabled();
const SIMPLE_ENTER_BLOCK_TAGS = new Set(["P"]);
const COMPLEX_ENTER_CONTAINER_SELECTOR =
  "li, blockquote, details, summary, table, thead, tbody, tr, th, td, pre";
const RENDERED_HEADING_SELECTOR =
  "h1, h2, h3, h4, h5, h6, .DOMD-H1, .DOMD-H2, .DOMD-H3, .DOMD-H4, .DOMD-H5, .DOMD-H6";

function livePerfNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function livePerfRound(value) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function livePerfLog(label, payload = {}) {
  if (!LIVE_PERF_ENABLED) {
    return;
  }
  // console.log(LIVE_PERF_PREFIX, label, payload);
}

function liveSchedulePerfPaint(label, startedAt, payload = {}) {
  if (
    !LIVE_PERF_ENABLED ||
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }

  window.requestAnimationFrame(() => {
    livePerfLog(`${label}:next-frame`, {
      elapsedMs: livePerfRound(livePerfNow() - startedAt),
      ...payload,
    });
    window.requestAnimationFrame(() => {
      livePerfLog(`${label}:settled-frame`, {
        elapsedMs: livePerfRound(livePerfNow() - startedAt),
        ...payload,
      });
    });
  });
}

function getEventElementTarget(event) {
  const target = event?.target;
  if (!target) {
    return null;
  }
  if (target instanceof Element) {
    return target;
  }
  return target.parentElement ?? null;
}

function syncEditorCursorFromPoint(editorRoot, clientX, clientY) {
  if (!editorRoot || typeof document === "undefined") {
    return false;
  }

  const selection = document.getSelection?.();
  if (!selection) {
    return false;
  }

  let range = null;

  if (typeof document.caretPositionFromPoint === "function") {
    const caretPosition = document.caretPositionFromPoint(clientX, clientY);
    if (caretPosition?.offsetNode) {
      range = document.createRange();
      range.setStart(caretPosition.offsetNode, caretPosition.offset);
      range.collapse(true);
    }
  } else if (typeof document.caretRangeFromPoint === "function") {
    const caretRange = document.caretRangeFromPoint(clientX, clientY);
    if (caretRange) {
      range = caretRange;
      range.collapse(true);
    }
  }

  if (!range || !editorRoot.contains(range.startContainer)) {
    editorRoot.focus?.({ preventScroll: true });
    editorRoot.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY }));
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(range);
  editorRoot.focus?.({ preventScroll: true });
  editorRoot.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY }));
  return true;
}

function getRenderedHeadingLevel(element) {
  if (!(element instanceof Element)) {
    return 0;
  }

  const tagNameMatch = element.tagName?.match?.(/^H([1-6])$/i);
  if (tagNameMatch?.[1]) {
    return Number(tagNameMatch[1]) || 0;
  }

  const className =
    typeof element.className === "string"
      ? element.className
      : Array.isArray(element.classList)
        ? element.classList.join(" ")
        : "";
  const classMatch = className.match(/DOMD-H([1-6])/i);
  return Number(classMatch?.[1]) || 0;
}

function getRenderedHeadingContext(editorRoot, target) {
  if (!(editorRoot instanceof Element) || !(target instanceof Element)) {
    return null;
  }

  const headingElement = target.closest?.(RENDERED_HEADING_SELECTOR);
  if (!(headingElement instanceof Element) || !editorRoot.contains(headingElement)) {
    return null;
  }

  const currentLevel = getRenderedHeadingLevel(headingElement);
  if (!currentLevel) {
    return null;
  }

  const headingElements = Array.from(editorRoot.querySelectorAll(RENDERED_HEADING_SELECTOR));
  const headingIndex = headingElements.indexOf(headingElement);
  if (headingIndex < 0) {
    return null;
  }

  return {
    kind: "rendered-heading",
    currentLevel,
    headingIndex,
  };
}

function cloneCursorInfo(cursorInfo) {
  if (!cursorInfo?.uuid) {
    return null;
  }

  return {
    uuid: cursorInfo.uuid,
    offset: Number(cursorInfo.offset) || 0,
  };
}

function readActiveCursorInfo(editor, fallbackCursorInfo = null) {
  return cloneCursorInfo(editor?.editorStore?.startCursorInfo) ?? cloneCursorInfo(fallbackCursorInfo);
}

function readFullSelectionState(editor) {
  const markdown = editor?.editorStore?.toMarkdown?.() ?? "";
  const contextChars = Math.max(markdown.length + 32, 2048);
  const selectionState = editor?.editorStore?.getSelectionState?.(contextChars);
  if (!selectionState || selectionState.before_truncated || selectionState.after_truncated) {
    return null;
  }

  return selectionState;
}

function getSelectionHeadingContext(editorRoot) {
  if (!(editorRoot instanceof Element) || typeof document === "undefined") {
    return null;
  }

  const selection = document.getSelection?.();
  const candidates = [
    selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement ?? null,
    selection?.focusNode instanceof Element
      ? selection.focusNode
      : selection?.focusNode?.parentElement ?? null,
    document.activeElement instanceof Element ? document.activeElement : null,
  ];

  for (const candidate of candidates) {
    const headingContext = getRenderedHeadingContext(editorRoot, candidate);
    if (headingContext) {
      return headingContext;
    }
  }

  return null;
}

function resolveLiveHeadingContext(editorRoot, target) {
  return (
    getRenderedHeadingContext(editorRoot, target) ||
    getSelectionHeadingContext(editorRoot)
  );
}

function resolveAdjacentMenuPosition(anchorRect, menuWidth, menuHeight, gap = 8) {
  if (typeof window === "undefined") {
    return {
      x: anchorRect?.right || 0,
      y: anchorRect?.top || 0,
    };
  }

  const margin = 12;
  const viewportWidth = Math.max(window.innerWidth || 0, menuWidth + margin * 2);
  const viewportHeight = Math.max(window.innerHeight || 0, menuHeight + margin * 2);
  const safeWidth = Math.max(1, Number(menuWidth) || 240);
  const safeHeight = Math.max(1, Number(menuHeight) || 260);
  const anchorLeft = Number(anchorRect?.left) || 0;
  const anchorRight = Number(anchorRect?.right) || anchorLeft;
  const anchorTop = Number(anchorRect?.top) || 0;
  const anchorBottom = Number(anchorRect?.bottom) || anchorTop;
  const rightSpace = viewportWidth - anchorRight - margin;
  const leftSpace = anchorLeft - margin;

  let x = anchorRight + gap;
  if (rightSpace < safeWidth && leftSpace >= safeWidth + gap) {
    x = anchorLeft - safeWidth - gap;
  }

  let y = anchorTop;
  if (viewportHeight - anchorTop - margin < safeHeight && anchorBottom >= safeHeight) {
    y = anchorBottom - safeHeight;
  }

  return {
    x: Math.min(Math.max(x, margin), Math.max(margin, viewportWidth - safeWidth - margin)),
    y: Math.min(Math.max(y, margin), Math.max(margin, viewportHeight - safeHeight - margin)),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof Blob)) {
      reject(new Error("无效的文件对象"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function getSimpleEnterBlock(event) {
  const selection = document.getSelection?.();
  if (!selection || !selection.isCollapsed) {
    return null;
  }

  const target = getEventElementTarget(event);
  if (!target) {
    return null;
  }

  const block = target.closest?.("[data-render-id]");
  if (!block || !SIMPLE_ENTER_BLOCK_TAGS.has(block.tagName)) {
    return null;
  }

  if (block.closest(COMPLEX_ENTER_CONTAINER_SELECTOR)) {
    return null;
  }

  const blockText = String(block.textContent || "").trim();
  if (
    !blockText ||
    /^(?:[-+*]\s|\d+\.\s|>\s|#{1,6}\s|\[ ?\]\s|\[x\]\s|---$)/i.test(blockText)
  ) {
    return null;
  }

  return block;
}

function OptimizedEnterGuard() {
  const editor = useEditor();
  const { textAreaDomRef } = useEditorDom();

  useEffect(() => {
    const editorRoot = textAreaDomRef.current;
    if (!editorRoot || !editor) {
      return undefined;
    }

    const handleKeydown = (event) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        editor.editorStore?.duringComposition
      ) {
        return;
      }

      if (!getSimpleEnterBlock(event)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      editor.editorStore.insertText("\n\n");
    };

    editorRoot.addEventListener("keydown", handleKeydown, true);
    return () => editorRoot.removeEventListener("keydown", handleKeydown, true);
  }, [editor, textAreaDomRef]);

  return null;
}

function getLiveSyncProfile(length) {
  if (length >= HUGE_DOC_SYNC_THRESHOLD) {
    return {
      delayMs: HUGE_DOC_SYNC_DELAY,
      idleTimeoutMs: HUGE_DOC_IDLE_TIMEOUT,
    };
  }

  if (length >= LARGE_DOC_SYNC_THRESHOLD) {
    return {
      delayMs: LARGE_DOC_SYNC_DELAY,
      idleTimeoutMs: LARGE_DOC_IDLE_TIMEOUT,
    };
  }

  return {
    delayMs: LIVE_SYNC_DELAY,
    idleTimeoutMs: LIVE_IDLE_SYNC_TIMEOUT,
  };
}

function SyncBridge({ value, onChange, onReady }) {
  const editor = useEditor();
  const lastAppliedValueRef = useRef(value ?? "");
  const lastEmittedValueRef = useRef(value ?? "");
  const pendingExternalValueRef = useRef(null);
  const readyEmittedRef = useRef(false);
  const syncTimerRef = useRef(0);
  const idleCallbackRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const changeSequenceRef = useRef(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const cancelScheduledSync = useCallback(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = 0;
    }

    if (!idleCallbackRef.current) {
      return;
    }

    if (typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleCallbackRef.current);
    } else {
      window.clearTimeout(idleCallbackRef.current);
    }
    idleCallbackRef.current = 0;
  }, []);

  const syncMarkdownToHost = useCallback(
    (force = false) => {
      if (!editor) {
        return "";
      }

      const startedAt = livePerfNow();
      cancelScheduledSync();

      const toMarkdownStartedAt = livePerfNow();
      const markdown = editor.editorStore.toMarkdown() ?? "";
      const toMarkdownMs = livePerfRound(livePerfNow() - toMarkdownStartedAt);
      const pendingExternalValue = pendingExternalValueRef.current;

      if (pendingExternalValue !== null) {
        if (markdown === pendingExternalValue) {
          lastAppliedValueRef.current = markdown;
          lastEmittedValueRef.current = markdown;
          pendingExternalValueRef.current = null;
        }
        livePerfLog("live-sync:to-host", {
          force,
          toMarkdownMs,
          totalMs: livePerfRound(livePerfNow() - startedAt),
          length: markdown.length,
          pendingExternal: true,
          emitted: false,
          backendCalls: false,
        });
        return markdown;
      }

      if (!force && markdown === lastEmittedValueRef.current) {
        livePerfLog("live-sync:to-host", {
          force,
          toMarkdownMs,
          totalMs: livePerfRound(livePerfNow() - startedAt),
          length: markdown.length,
          pendingExternal: false,
          emitted: false,
          backendCalls: false,
        });
        return markdown;
      }

      lastAppliedValueRef.current = markdown;
      lastEmittedValueRef.current = markdown;
      onChangeRef.current?.(markdown);
      livePerfLog("live-sync:to-host", {
        force,
        toMarkdownMs,
        totalMs: livePerfRound(livePerfNow() - startedAt),
        length: markdown.length,
        pendingExternal: false,
        emitted: true,
        backendCalls: false,
      });
      liveSchedulePerfPaint("live-sync:to-host", startedAt, {
        force,
        length: markdown.length,
      });
      return markdown;
    },
    [cancelScheduledSync, editor]
  );

  const scheduleMarkdownSync = useCallback(
    (force = false) => {
      if (!editor) {
        return;
      }

      const currentLength = Math.max(
        String(lastAppliedValueRef.current ?? "").length,
        String(lastEmittedValueRef.current ?? "").length,
        String(value ?? "").length
      );
      const syncProfile = getLiveSyncProfile(currentLength);

      livePerfLog("live-sync:scheduled", {
        force,
        delayMs: force ? 0 : syncProfile.delayMs,
        idleTimeoutMs: force ? 0 : syncProfile.idleTimeoutMs,
        contentLength: currentLength,
        backendCalls: false,
      });
      cancelScheduledSync();

      if (force) {
        syncMarkdownToHost(true);
        return;
      }

      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = 0;

        const runSync = () => {
          idleCallbackRef.current = 0;
          syncMarkdownToHost();
        };

        if (typeof window.requestIdleCallback === "function") {
          idleCallbackRef.current = window.requestIdleCallback(runSync, {
            timeout: syncProfile.idleTimeoutMs,
          });
          return;
        }

        idleCallbackRef.current = window.setTimeout(runSync, 0);
      }, syncProfile.delayMs);
    },
    [cancelScheduledSync, editor, syncMarkdownToHost, value]
  );

  useEffect(() => {
    if (!editor || readyEmittedRef.current) {
      return;
    }

    readyEmittedRef.current = true;
    livePerfLog("live-editor:ready", {
      backendCalls: false,
    });
    onReady?.(editor);
    editor.focus?.();
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const startedAt = livePerfNow();
    const nextValue = value ?? "";
    const pendingExternalValue = pendingExternalValueRef.current;

    if (
      pendingExternalValue === null &&
      (nextValue === lastAppliedValueRef.current || nextValue === lastEmittedValueRef.current)
    ) {
      livePerfLog("live-sync:external-update", {
        action: "skip-local-echo",
        nextLength: nextValue.length,
        totalMs: livePerfRound(livePerfNow() - startedAt),
        backendCalls: false,
      });
      return;
    }

    const toMarkdownStartedAt = livePerfNow();
    const currentValue = editor.editorStore.toMarkdown() ?? "";
    const toMarkdownMs = livePerfRound(livePerfNow() - toMarkdownStartedAt);

    if (nextValue === currentValue) {
      cancelScheduledSync();
      lastAppliedValueRef.current = nextValue;
      lastEmittedValueRef.current = nextValue;
      pendingExternalValueRef.current = null;
      livePerfLog("live-sync:external-update", {
        action: "noop",
        nextLength: nextValue.length,
        currentLength: currentValue.length,
        toMarkdownMs,
        totalMs: livePerfRound(livePerfNow() - startedAt),
        backendCalls: false,
      });
      return;
    }

    if (nextValue === lastAppliedValueRef.current) {
      livePerfLog("live-sync:external-update", {
        action: "skip-same-applied",
        nextLength: nextValue.length,
        currentLength: currentValue.length,
        toMarkdownMs,
        totalMs: livePerfRound(livePerfNow() - startedAt),
        backendCalls: false,
      });
      return;
    }

    cancelScheduledSync();
    pendingExternalValueRef.current = nextValue;
    lastAppliedValueRef.current = nextValue;
    const resetStartedAt = livePerfNow();
    editor.editorStore.resetMD(nextValue);
    livePerfLog("live-sync:external-update", {
      action: "reset-md",
      nextLength: nextValue.length,
      currentLength: currentValue.length,
      toMarkdownMs,
      resetMs: livePerfRound(livePerfNow() - resetStartedAt),
      totalMs: livePerfRound(livePerfNow() - startedAt),
      backendCalls: false,
    });
    liveSchedulePerfPaint("live-sync:external-update", startedAt, {
      action: "reset-md",
      nextLength: nextValue.length,
    });
  }, [cancelScheduledSync, editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const unsubscribe = editor.editorStore.subscribe((nextState, prevState) => {
      if (nextState?.D === prevState?.D) {
        return;
      }
      const changeId = ++changeSequenceRef.current;
      const startedAt = livePerfNow();
      livePerfLog("live-input:store-change", {
        changeId,
        backendCalls: false,
      });
      liveSchedulePerfPaint("live-input:store-change", startedAt, {
        changeId,
      });
      scheduleMarkdownSync();
    });

    return () => {
      syncMarkdownToHost(true);
      cancelScheduledSync();
      unsubscribe?.();
    };
  }, [cancelScheduledSync, editor, scheduleMarkdownSync, syncMarkdownToHost]);

  return null;
}

function DeleteSelectionGuard() {
  const { textAreaDomRef } = useEditorDom();

  useEffect(() => {
    const editorRoot = textAreaDomRef.current;
    if (!editorRoot) {
      return undefined;
    }

    const handleDelete = (event) => {
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      ) {
        return;
      }

      const selection = document.getSelection();
      if (
        !selection ||
        selection.isCollapsed ||
        !selection.anchorNode ||
        !selection.focusNode ||
        !editorRoot.contains(selection.anchorNode) ||
        !editorRoot.contains(selection.focusNode)
      ) {
        return;
      }

      // DOMD records its structured selection on click. A drag selection can be
      // newer than that record, so refresh it before invoking DOMD's deletion.
      editorRoot.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      event.preventDefault();
      event.stopImmediatePropagation();

      let beforeInputEvent;
      try {
        beforeInputEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        });
      } catch {
        beforeInputEvent = new Event("beforeinput", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(beforeInputEvent, "inputType", {
          value: "deleteContentBackward",
        });
      }

      editorRoot.dispatchEvent(beforeInputEvent);
    };

    editorRoot.addEventListener("keydown", handleDelete, true);
    return () => editorRoot.removeEventListener("keydown", handleDelete, true);
  }, [textAreaDomRef]);

  return null;
}

function RightClickInsertMenu({ filePath = "", requestAiInsertContent = null }) {
  const editor = useEditor();
  const { textAreaDomRef } = useEditorDom();
  const startCursorInfo = useEditorStore((store) => store.startCursorInfo);
  const [menuState, setMenuState] = useState(null);
  const [submenuState, setSubmenuState] = useState(null);
  const [nestedSubmenuState, setNestedSubmenuState] = useState(null);
  const [dialogState, setDialogState] = useState(null);
  const menuRef = useRef(null);
  const submenuRef = useRef(null);
  const nestedSubmenuRef = useRef(null);
  const imageInputRef = useRef(null);
  const pendingImageInsertRef = useRef(null);
  const menuSections = useMemo(
    () =>
      buildMarkdownContextMenuSections({
        headingContext: menuState?.headingContext || null,
      }),
    [menuState?.headingContext?.currentLevel, menuState?.headingContext?.headingIndex]
  );

  const closeMenu = useCallback(() => {
    setMenuState(null);
    setSubmenuState(null);
    setNestedSubmenuState(null);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState(null);
  }, []);

  const handleInsert = useCallback(
    (snippet, cursorInfo = null) => {
      if (!editor) {
        return;
      }

      const resolvedCursorInfo = readActiveCursorInfo(editor, cursorInfo ?? startCursorInfo) ?? undefined;
      const shouldUseDirectCursorInsert =
        !cursorInfo?.uuid && typeof editor.aiInsertInCursor === "function";

      if (shouldUseDirectCursorInsert) {
        editor.aiInsertInCursor(snippet);
      } else if (editor.editorStore?.insertText) {
        editor.editorStore.insertText(snippet, resolvedCursorInfo);
      } else {
        return;
      }

      if (editor.editorStore.toMarkdown && editor.editorStore.resetMD) {
        const nextMarkdown = editor.editorStore.toMarkdown() ?? "";
        editor.editorStore.resetMD(nextMarkdown);
      }
      editor.focus?.();
      closeMenu();
    },
    [closeMenu, editor, startCursorInfo]
  );

  const updateDialogDraft = useCallback((updater) => {
    setDialogState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        error: "",
        draft: updater(current.draft, current.item),
      };
    });
  }, []);

  const openDialogForItem = useCallback((item) => {
    setDialogState({
      item,
      draft: createInsertDraft(item, "live"),
      error: "",
    });
  }, []);

  const replaceSelectionWithMarkdownSnippet = useCallback(
    (snippet) => {
      const selectionState = readFullSelectionState(editor);
      if (!selectionState || !editor?.editorStore?.resetMD) {
        return false;
      }

      const nextMarkdown = `${String(selectionState.before || "")}${String(snippet || "")}${String(
        selectionState.after || ""
      )}`;
      editor.editorStore.resetMD(nextMarkdown);
      editor.focus?.();
      closeMenu();
      return true;
    },
    [closeMenu, editor]
  );

  const requestAiGenerationForItem = useCallback(
    async (item) => {
      if (typeof requestAiInsertContent !== "function") {
        window.alert("当前不可用，请先在桌面应用中配置可用模型。");
        return;
      }

      const cursorInfo =
        cloneCursorInfo(menuState?.cursorInfo) ?? readActiveCursorInfo(editor, startCursorInfo);
      const generatedContent = await requestAiInsertContent(createAiGenerationRequest(item, "live"));
      if (!String(generatedContent || "").trim()) {
        return;
      }

      const snippet = createGeneratedInsertSnippet(item, generatedContent, "live");
      handleInsert(snippet, cursorInfo);
    },
    [editor, handleInsert, menuState?.cursorInfo, requestAiInsertContent, startCursorInfo]
  );

  const adjustHeadingLevelForItem = useCallback(
    (item) => {
      const markdown = editor?.editorStore?.toMarkdown?.() ?? "";
      const headingIndex = Number(menuState?.headingContext?.headingIndex);
      if (!editor?.editorStore?.resetMD || !Number.isFinite(headingIndex)) {
        closeMenu();
        return;
      }

      const headingContext = getNthHashHeadingContext(markdown, headingIndex);
      if (!headingContext) {
        closeMenu();
        return;
      }

      const explicitTargetLevel = Number(item?.targetLevel);
      const nextLevel = normalizeHeadingLevel(
        Number.isFinite(explicitTargetLevel)
          ? explicitTargetLevel
          : headingContext.level + (Number(item?.levelDelta) || 0)
      );
      editor.editorStore.resetMD(replaceHashHeadingLevel(markdown, headingContext, nextLevel));
      editor.focus?.();
      closeMenu();
    },
    [closeMenu, editor, menuState?.headingContext?.headingIndex]
  );

  const openImagePickerForItem = useCallback(
    (item) => {
      pendingImageInsertRef.current = {
        item,
        cursorInfo:
          cloneCursorInfo(menuState?.cursorInfo) ?? readActiveCursorInfo(editor, startCursorInfo),
      };
      closeMenu();
      window.setTimeout(() => {
        imageInputRef.current?.click?.();
      }, 0);
    },
    [closeMenu, editor, menuState?.cursorInfo, startCursorInfo]
  );

  const handleMenuItemAction = useCallback(
    (item) => {
      if (item?.action === MENU_ITEM_ACTIONS.adjustHeadingLevel) {
        adjustHeadingLevelForItem(item);
        return;
      }

      if (item?.action === MENU_ITEM_ACTIONS.aiGenerate) {
        closeMenu();
        void requestAiGenerationForItem(item);
        return;
      }

      if (item?.type === INSERT_ITEM_TYPES.image) {
        openImagePickerForItem(item);
        return;
      }

      if (item?.type === INSERT_ITEM_TYPES.heading) {
        const inserted = replaceSelectionWithMarkdownSnippet(
          createDirectInsertSnippet(item, "live")
        );
        if (inserted) {
          return;
        }
      }

      if (shouldOpenInsertDialog(item, "live")) {
        closeMenu();
        openDialogForItem(item);
        return;
      }
      handleInsert(createDirectInsertSnippet(item, "live"));
    },
    [
      adjustHeadingLevelForItem,
      closeMenu,
      editor,
      handleInsert,
      menuState?.headingContext,
      openImagePickerForItem,
      openDialogForItem,
      replaceSelectionWithMarkdownSnippet,
      requestAiGenerationForItem,
    ]
  );

  const handleDialogConfirm = useCallback(() => {
    if (!dialogState?.item) {
      return;
    }

    if (
      dialogState.item.type === INSERT_ITEM_TYPES.image &&
      !String(dialogState.draft?.source || "").trim()
    ) {
      setDialogState((current) =>
        current
          ? {
              ...current,
              error: "请先选择一张图片",
            }
          : current
      );
      return;
    }

    const snippet = buildInsertSnippet(dialogState.item, dialogState.draft, "live");
    handleInsert(snippet);
    closeDialog();
  }, [closeDialog, dialogState, handleInsert]);

  const handleImageFileChange = useCallback(
    async (event) => {
      const file = event?.target?.files?.[0];
      const pendingInsert = pendingImageInsertRef.current;
      if (!file || !pendingInsert?.item) {
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const storedImage = await saveImageToDocumentDirectory({
          documentPath: filePath,
          originalFileName: file.name || "",
          dataUrl,
        });
        const altText = file.name?.replace(/\.[^.]+$/, "") || "图片描述";
        const snippet = buildInsertSnippet(
          pendingInsert.item,
          {
            alt: altText,
            source: storedImage.source,
            fileName: storedImage.fileName,
          },
          "live"
        );
        handleInsert(snippet, pendingInsert.cursorInfo);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "读取图片失败");
      } finally {
        pendingImageInsertRef.current = null;
        if (event?.target) {
          event.target.value = "";
        }
      }
    },
    [handleInsert, filePath]
  );

  const updateTaskItem = useCallback(
    (index, patch) => {
      updateDialogDraft((draft) => ({
        ...draft,
        items: (draft.items || []).map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...patch,
              }
            : item
        ),
      }));
    },
    [updateDialogDraft]
  );

  const addTaskItem = useCallback(() => {
    updateDialogDraft((draft) => ({
      ...draft,
      items: [...(draft.items || []), { text: "待办事项", checked: false }],
    }));
  }, [updateDialogDraft]);

  const removeTaskItem = useCallback(
    (index) => {
      updateDialogDraft((draft) => {
        const nextItems = (draft.items || []).filter((_, itemIndex) => itemIndex !== index);
        return {
          ...draft,
          items: nextItems.length > 0 ? nextItems : [{ text: "", checked: false }],
        };
      });
    },
    [updateDialogDraft]
  );

  const updateTableHeader = useCallback(
    (index, value) => {
      updateDialogDraft((draft) => ({
        ...draft,
        headers: (draft.headers || []).map((header, headerIndex) =>
          headerIndex === index ? value : header
        ),
      }));
    },
    [updateDialogDraft]
  );

  const updateTableCell = useCallback(
    (rowIndex, columnIndex, value) => {
      updateDialogDraft((draft) => ({
        ...draft,
        rows: (draft.rows || []).map((row, currentRowIndex) =>
          currentRowIndex === rowIndex
            ? row.map((cell, currentColumnIndex) =>
                currentColumnIndex === columnIndex ? value : cell
              )
            : row
        ),
      }));
    },
    [updateDialogDraft]
  );

  const addTableRow = useCallback(() => {
    updateDialogDraft((draft) => {
      const headers = draft.headers || ["列1"];
      return {
        ...draft,
        rows: [...(draft.rows || []), Array.from({ length: headers.length }, () => "")],
      };
    });
  }, [updateDialogDraft]);

  const removeTableRow = useCallback(
    (rowIndex) => {
      updateDialogDraft((draft) => {
        const nextRows = (draft.rows || []).filter((_, index) => index !== rowIndex);
        const headers = draft.headers || ["列1"];
        return {
          ...draft,
          rows: nextRows.length > 0 ? nextRows : [Array.from({ length: headers.length }, () => "")],
        };
      });
    },
    [updateDialogDraft]
  );

  const addTableColumn = useCallback(() => {
    updateDialogDraft((draft) => {
      const nextColumnIndex = (draft.headers || []).length + 1;
      return {
        ...draft,
        headers: [...(draft.headers || []), `列${nextColumnIndex}`],
        rows: (draft.rows || []).map((row) => [...row, ""]),
      };
    });
  }, [updateDialogDraft]);

  const removeTableColumn = useCallback(
    (columnIndex) => {
      updateDialogDraft((draft) => {
        const headers = draft.headers || [];
        if (headers.length <= 1) {
          return draft;
        }
        return {
          ...draft,
          headers: headers.filter((_, index) => index !== columnIndex),
          rows: (draft.rows || []).map((row) => row.filter((_, index) => index !== columnIndex)),
        };
      });
    },
    [updateDialogDraft]
  );

  const isEventInsideMenu = useCallback((event) => {
    const panels = [menuRef.current, submenuRef.current, nestedSubmenuRef.current].filter(Boolean);
    if (panels.length === 0) {
      return false;
    }

    const target = getEventElementTarget(event);
    if (target && panels.some((panel) => panel.contains(target))) {
      return true;
    }

    if (typeof event?.composedPath === "function") {
      const eventPath = event.composedPath();
      return panels.some((panel) => eventPath.includes(panel));
    }

    return false;
  }, []);

  const openSubmenuForItem = useCallback((item, event) => {
    if (!item?.children?.length) {
      setSubmenuState(null);
      setNestedSubmenuState(null);
      return;
    }

    const anchorElement = event?.currentTarget;
    if (!(anchorElement instanceof Element)) {
      return;
    }

    const anchorRect = anchorElement.getBoundingClientRect();
    const nextPosition = resolveAdjacentMenuPosition(anchorRect, 280, 320);
    setSubmenuState({
      parentId: item.id,
      items: item.children,
      anchorRect: {
        left: anchorRect.left,
        right: anchorRect.right,
        top: anchorRect.top,
        bottom: anchorRect.bottom,
      },
      ...nextPosition,
    });
    setNestedSubmenuState(null);
  }, []);

  const openNestedSubmenuForItem = useCallback((item, event) => {
    if (!item?.children?.length) {
      setNestedSubmenuState(null);
      return;
    }

    const anchorElement = event?.currentTarget;
    if (!(anchorElement instanceof Element)) {
      return;
    }

    const anchorRect = anchorElement.getBoundingClientRect();
    const nextPosition = resolveAdjacentMenuPosition(anchorRect, 280, 320);
    setNestedSubmenuState({
      parentId: item.id,
      items: item.children,
      anchorRect: {
        left: anchorRect.left,
        right: anchorRect.right,
        top: anchorRect.top,
        bottom: anchorRect.bottom,
      },
      ...nextPosition,
    });
  }, []);

  useEffect(() => {
    const editorRoot = textAreaDomRef.current;
    if (!editorRoot || !editor) {
      return undefined;
    }

    const handleContextMenu = (event) => {
      if (event.shiftKey) {
        return;
      }

      const target = getEventElementTarget(event);
      if (!target || !editorRoot.contains(target)) {
        return;
      }

      event.preventDefault();
      syncEditorCursorFromPoint(editorRoot, event.clientX, event.clientY);
      const headingContext = resolveLiveHeadingContext(editorRoot, target);
      const cursorInfo = readActiveCursorInfo(editor, startCursorInfo);
      const nextPosition = resolveFloatingMenuPosition({
        anchorX: event.clientX,
        anchorY: event.clientY,
      });
      setMenuState({
        anchorX: event.clientX,
        anchorY: event.clientY,
        headingContext,
        cursorInfo,
        ...nextPosition,
      });
    };

    editorRoot.addEventListener("contextmenu", handleContextMenu);
    return () => editorRoot.removeEventListener("contextmenu", handleContextMenu);
  }, [editor, startCursorInfo, textAreaDomRef]);

  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) {
      return;
    }

    const nextPosition = resolveFloatingMenuPosition({
      anchorX: menuState.anchorX,
      anchorY: menuState.anchorY,
      menuWidth: menuRef.current.offsetWidth,
      menuHeight: menuRef.current.offsetHeight,
    });

    if (nextPosition.x === menuState.x && nextPosition.y === menuState.y) {
      return;
    }

    setMenuState((current) =>
      current
        ? {
            ...current,
            ...nextPosition,
          }
        : current
    );
  }, [menuState]);

  useLayoutEffect(() => {
    if (!submenuState || !submenuRef.current) {
      return;
    }

    const nextPosition = resolveAdjacentMenuPosition(
      submenuState.anchorRect,
      submenuRef.current.offsetWidth,
      submenuRef.current.offsetHeight
    );

    if (nextPosition.x === submenuState.x && nextPosition.y === submenuState.y) {
      return;
    }

    setSubmenuState((current) =>
      current
        ? {
            ...current,
            ...nextPosition,
          }
        : current
    );
  }, [submenuState]);

  useLayoutEffect(() => {
    if (!nestedSubmenuState || !nestedSubmenuRef.current) {
      return;
    }

    const nextPosition = resolveAdjacentMenuPosition(
      nestedSubmenuState.anchorRect,
      nestedSubmenuRef.current.offsetWidth,
      nestedSubmenuRef.current.offsetHeight
    );

    if (nextPosition.x === nestedSubmenuState.x && nextPosition.y === nestedSubmenuState.y) {
      return;
    }

    setNestedSubmenuState((current) =>
      current
        ? {
            ...current,
            ...nextPosition,
          }
        : current
    );
  }, [nestedSubmenuState]);

  useEffect(() => {
    if (!menuState) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (isEventInsideMenu(event)) {
        return;
      }
      closeMenu();
    };

    const handleScroll = (event) => {
      if (isEventInsideMenu(event)) {
        return;
      }
      closeMenu();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("keydown", handleKeydown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("keydown", handleKeydown, true);
    };
  }, [closeMenu, isEventInsideMenu, menuState]);

  useEffect(() => {
    if (!dialogState) {
      return undefined;
    }

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", handleKeydown, true);
    return () => {
      window.removeEventListener("keydown", handleKeydown, true);
    };
  }, [closeDialog, dialogState]);

  const dialogItem = dialogState?.item ?? null;
  const dialogDraft = dialogState?.draft ?? null;
  const dialogTitle = dialogItem ? `插入${dialogItem.label}` : "";
  const dialogDescription = dialogItem?.description || "";

  const renderDialogFields = () => {
    if (!dialogItem || !dialogDraft) {
      return null;
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.heading) {
      return (
        <>
          <label className="md-insert-field">
            <span className="md-insert-field-label">标题级别</span>
            <select
              className="md-insert-input"
              value={dialogDraft.level}
              onChange={(event) =>
                updateDialogDraft((draft) => ({
                  ...draft,
                  level: Number(event.target.value) || 2,
                }))
              }
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                    <option key={level} value={level}>
                      {getHeadingLevelLabel(level)} (H{level})
                    </option>
                  ))}
                </select>
          </label>
          <label className="md-insert-field">
            <span className="md-insert-field-label">标题内容</span>
            <input
              className="md-insert-input"
              type="text"
              value={dialogDraft.title}
              onChange={(event) =>
                updateDialogDraft((draft) => ({
                  ...draft,
                  title: event.target.value,
                }))
              }
              placeholder={`输入${getHeadingLevelLabel(Number(dialogDraft.level) || 2)}`}
            />
          </label>
          <label className="md-insert-field">
            <span className="md-insert-field-label">正文内容</span>
            <textarea
              className="md-insert-textarea"
              value={dialogDraft.body}
              onChange={(event) =>
                updateDialogDraft((draft) => ({
                  ...draft,
                  body: event.target.value,
                }))
              }
              placeholder="可选，插入标题下方正文"
            />
          </label>
        </>
      );
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.quote) {
      return (
        <label className="md-insert-field">
          <span className="md-insert-field-label">引用内容</span>
          <textarea
            className="md-insert-textarea"
            value={dialogDraft.text}
            onChange={(event) =>
              updateDialogDraft((draft) => ({
                ...draft,
                text: event.target.value,
              }))
            }
            placeholder="输入引用内容，支持多行"
          />
        </label>
      );
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.taskList) {
      return (
        <div className="md-insert-field">
          <div className="md-insert-field-head">
            <span className="md-insert-field-label">任务项</span>
            <button type="button" className="md-insert-mini-btn" onClick={addTaskItem}>
              新增一项
            </button>
          </div>
          <div className="md-insert-list-editor">
            {(dialogDraft.items || []).map((item, index) => (
              <div key={`task-${index}`} className="md-insert-list-row">
                <label className="md-insert-check">
                  <input
                    type="checkbox"
                    checked={item.checked === true}
                    onChange={(event) =>
                      updateTaskItem(index, {
                        checked: event.target.checked,
                      })
                    }
                  />
                  <span>已完成</span>
                </label>
                <input
                  className="md-insert-input"
                  type="text"
                  value={item.text || ""}
                  onChange={(event) =>
                    updateTaskItem(index, {
                      text: event.target.value,
                    })
                  }
                  placeholder="任务内容"
                />
                <button
                  type="button"
                  className="md-insert-mini-btn danger"
                  onClick={() => removeTaskItem(index)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.table) {
      return (
        <div className="md-insert-field">
          <div className="md-insert-field-head">
            <span className="md-insert-field-label">表格内容</span>
            <div className="md-insert-inline-actions">
              <button type="button" className="md-insert-mini-btn" onClick={addTableColumn}>
                新增列
              </button>
              <button type="button" className="md-insert-mini-btn" onClick={addTableRow}>
                新增行
              </button>
            </div>
          </div>
          <div className="md-insert-table-editor">
            <table className="md-insert-table-grid">
              <thead>
                <tr>
                  <th className="md-insert-table-index-cell">#</th>
                  {(dialogDraft.headers || []).map((header, index) => (
                    <th key={`header-${index}`} className="md-insert-table-cell is-header">
                      <input
                        className="md-insert-input"
                        type="text"
                        value={header}
                        onChange={(event) => updateTableHeader(index, event.target.value)}
                        placeholder={`列${index + 1}`}
                      />
                      <button
                        type="button"
                        className="md-insert-mini-btn danger"
                        onClick={() => removeTableColumn(index)}
                        disabled={(dialogDraft.headers || []).length <= 1}
                      >
                        删列
                      </button>
                    </th>
                  ))}
                  <th className="md-insert-table-action-head">操作</th>
                </tr>
              </thead>
              <tbody>
                {(dialogDraft.rows || []).map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    <td className="md-insert-table-index-cell">{rowIndex + 1}</td>
                    {row.map((cell, columnIndex) => (
                      <td
                        key={`cell-${rowIndex}-${columnIndex}`}
                        className="md-insert-table-cell"
                      >
                        <input
                          className="md-insert-input"
                          type="text"
                          value={cell}
                          onChange={(event) =>
                            updateTableCell(rowIndex, columnIndex, event.target.value)
                          }
                          placeholder={`第${rowIndex + 1}行第${columnIndex + 1}列`}
                        />
                      </td>
                    ))}
                    <td className="md-insert-table-row-actions">
                      <button
                        type="button"
                        className="md-insert-mini-btn danger"
                        onClick={() => removeTableRow(rowIndex)}
                      >
                        删行
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.image) {
      return (
        <div className="md-insert-upload-hint">
          图片会在右键菜单中直接调起文件选择器，选中后自动插入到当前位置。
        </div>
      );
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.code) {
      return (
        <>
          <label className="md-insert-field">
            <span className="md-insert-field-label">代码语言</span>
            <input
              className="md-insert-input"
              type="text"
              list="md-insert-language-list"
              value={dialogDraft.language}
              onChange={(event) =>
                updateDialogDraft((draft) => ({
                  ...draft,
                  language: event.target.value,
                }))
              }
              placeholder="例如：javascript"
            />
            <datalist id="md-insert-language-list">
              {CODE_LANGUAGE_SUGGESTIONS.map((language) => (
                <option key={language} value={language} />
              ))}
            </datalist>
          </label>
          <label className="md-insert-field">
            <span className="md-insert-field-label">代码内容</span>
            <textarea
              className="md-insert-textarea is-code"
              value={dialogDraft.code}
              onChange={(event) =>
                updateDialogDraft((draft) => ({
                  ...draft,
                  code: event.target.value,
                }))
              }
              placeholder="输入代码内容"
            />
          </label>
        </>
      );
    }

    if (dialogItem.type === INSERT_ITEM_TYPES.mermaid) {
      return (
        <label className="md-insert-field">
          <span className="md-insert-field-label">Mermaid 内容</span>
          <textarea
            className="md-insert-textarea is-code"
            value={dialogDraft.code}
            onChange={(event) =>
              updateDialogDraft((draft) => ({
                ...draft,
                code: event.target.value,
              }))
            }
            placeholder="支持直接粘贴 ```mermaid ... ``` 或只粘贴内部代码"
          />
          <span className="md-insert-field-tip">
            支持直接粘贴完整的 ` ```mermaid ` 代码块，也支持只粘贴内部内容，保存时会自动整理。
          </span>
        </label>
      );
    }

    return null;
  };

  if (!menuState || typeof document === "undefined") {
    return (
      <>
        <input
          ref={imageInputRef}
          className="md-insert-hidden-input"
          type="file"
          accept="image/*"
          onChange={handleImageFileChange}
        />
        {dialogState
          ? createPortal(
              <div className="md-insert-dialog-backdrop" onMouseDown={closeDialog}>
                <section
                  className="md-insert-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-label={dialogTitle}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <header className="md-insert-dialog-header">
                    <div>
                      <h3>{dialogTitle}</h3>
                      <p>{dialogDescription}</p>
                    </div>
                    <button type="button" className="md-insert-dialog-close" onClick={closeDialog}>
                      ×
                    </button>
                  </header>
                  <div className="md-insert-dialog-body">
                    {renderDialogFields()}
                    {dialogState.error ? (
                      <div className="md-insert-dialog-error">{dialogState.error}</div>
                    ) : null}
                  </div>
                  <footer className="md-insert-dialog-actions">
                    <button type="button" className="md-insert-dialog-btn" onClick={closeDialog}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="md-insert-dialog-btn primary"
                      onClick={handleDialogConfirm}
                    >
                      插入内容
                    </button>
                  </footer>
                </section>
              </div>,
              document.body
            )
          : null}
      </>
    );
  }

  return (
    <>
      <input
        ref={imageInputRef}
        className="md-insert-hidden-input"
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
      />
      {createPortal(
        <div
          ref={menuRef}
          className="md-live-context-menu"
          style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }}
          role="menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          {menuSections.map((section) => (
            <section key={section.title} className="md-live-context-menu-section">
              <div className="md-live-context-menu-title">{section.title}</div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`md-live-context-menu-item${
                    item.children?.length ? " has-children" : ""
                  }`}
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={(event) => openSubmenuForItem(item, event)}
                  onClick={(event) =>
                    item.children?.length
                      ? openSubmenuForItem(item, event)
                      : handleMenuItemAction(item)
                  }
                >
                  <span className="md-live-context-menu-item-label">{item.label}</span>
                  <span className="md-live-context-menu-item-desc">{item.description}</span>
                  {item.children?.length ? (
                    <span className="md-live-context-menu-item-arrow" aria-hidden="true">
                      ›
                    </span>
                  ) : null}
                </button>
              ))}
            </section>
          ))}
        </div>,
        document.body
      )}
      {submenuState
        ? createPortal(
            <div
              ref={submenuRef}
              className="md-live-context-submenu"
              style={{ left: `${submenuState.x}px`, top: `${submenuState.y}px` }}
              role="menu"
              onContextMenu={(event) => event.preventDefault()}
            >
              {submenuState.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`md-live-context-menu-item${item.children?.length ? " has-children" : ""}`}
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={(event) =>
                    item.children?.length
                      ? openNestedSubmenuForItem(item, event)
                      : setNestedSubmenuState(null)
                  }
                  onClick={(event) =>
                    item.children?.length
                      ? openNestedSubmenuForItem(item, event)
                      : handleMenuItemAction(item)
                  }
                >
                  <span className="md-live-context-menu-item-label">{item.label}</span>
                  <span className="md-live-context-menu-item-desc">{item.description}</span>
                  {item.children?.length ? (
                    <span className="md-live-context-menu-item-arrow" aria-hidden="true">
                      ›
                    </span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
      {nestedSubmenuState
        ? createPortal(
            <div
              ref={nestedSubmenuRef}
              className="md-live-context-submenu"
              style={{ left: `${nestedSubmenuState.x}px`, top: `${nestedSubmenuState.y}px` }}
              role="menu"
              onContextMenu={(event) => event.preventDefault()}
            >
              {nestedSubmenuState.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="md-live-context-menu-item"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleMenuItemAction(item)}
                >
                  <span className="md-live-context-menu-item-label">{item.label}</span>
                  <span className="md-live-context-menu-item-desc">{item.description}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
      {dialogState
        ? createPortal(
            <div className="md-insert-dialog-backdrop" onMouseDown={closeDialog}>
              <section
                className="md-insert-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={dialogTitle}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="md-insert-dialog-header">
                  <div>
                    <h3>{dialogTitle}</h3>
                    <p>{dialogDescription}</p>
                  </div>
                  <button
                    type="button"
                    className="md-insert-dialog-close"
                    onClick={closeDialog}
                  >
                    ×
                  </button>
                </header>
                <div className="md-insert-dialog-body">
                  {renderDialogFields()}
                  {dialogState.error ? (
                    <div className="md-insert-dialog-error">{dialogState.error}</div>
                  ) : null}
                </div>
                <footer className="md-insert-dialog-actions">
                  <button type="button" className="md-insert-dialog-btn" onClick={closeDialog}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="md-insert-dialog-btn primary"
                    onClick={handleDialogConfirm}
                  >
                    插入内容
                  </button>
                </footer>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function ReactLiveEditor({
  value,
  placeholder,
  filePath,
  onChange,
  onReady,
  resolveImagePath,
  readImageAsBase64,
  requestAiInsertContent,
}) {
  const initialValueRef = useRef(value ?? "");
  const imageLoader = useMemo(
    () => createLiveEditImageLoader(resolveImagePath, readImageAsBase64),
    [resolveImagePath, readImageAsBase64]
  );

  return (
    <DOMDProvider
      editable={true}
      initMd={initialValueRef.current}
      placeholder={placeholder}
      codeTokenizer={tokenize}
      imageLoader={imageLoader}
    >
      <div className="md-live-editor-host">
        <DOMD />
      </div>
      <RightClickInsertMenu
        filePath={filePath}
        requestAiInsertContent={requestAiInsertContent}
      />
      <DeleteSelectionGuard />
      <OptimizedEnterGuard />
      <SyncBridge value={value} onChange={onChange} onReady={onReady} />
    </DOMDProvider>
  );
}
