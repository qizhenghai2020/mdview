import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  DOMD,
  DOMDProvider,
  useEditor,
  useEditorDom,
} from "@do-md/core-react";
import { createLiveEditImageLoader } from "./imageLoader";
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

export function ReactLiveEditor({
  value,
  placeholder,
  onChange,
  onReady,
  resolveImagePath,
  readImageAsBase64,
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
      <DeleteSelectionGuard />
      <OptimizedEnterGuard />
      <SyncBridge value={value} onChange={onChange} onReady={onReady} />
    </DOMDProvider>
  );
}
