import { useEffect, useMemo, useRef } from "react";
import {
  DOMD,
  DOMDProvider,
  toMarkdown,
  useEditor,
  useEditorDom,
  useRenderData,
} from "@do-md/core-react";
import "@do-md/core-react/style.css";
import { createLiveEditImageLoader } from "./imageLoader";
import { tokenize } from "./prismTokenizer";

function SyncBridge({ value, onChange, onReady }) {
  const editor = useEditor();
  const renderData = useRenderData();
  const markdown = toMarkdown(renderData) ?? "";
  const lastAppliedValueRef = useRef(value ?? "");
  const lastEmittedValueRef = useRef(markdown);
  const pendingExternalValueRef = useRef(null);
  const readyEmittedRef = useRef(false);

  useEffect(() => {
    if (!editor || readyEmittedRef.current) {
      return;
    }

    readyEmittedRef.current = true;
    onReady?.(editor);
    editor.focus?.();
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextValue = value ?? "";
    const currentValue = toMarkdown(renderData) ?? "";

    if (nextValue === currentValue) {
      lastAppliedValueRef.current = nextValue;
      lastEmittedValueRef.current = nextValue;
      pendingExternalValueRef.current = null;
      return;
    }

    if (nextValue === lastAppliedValueRef.current) {
      return;
    }

    pendingExternalValueRef.current = nextValue;
    lastAppliedValueRef.current = nextValue;
    editor.editorStore.resetMD(nextValue);
  }, [editor, renderData, value]);

  useEffect(() => {
    const pendingExternalValue = pendingExternalValueRef.current;
    if (pendingExternalValue !== null) {
      if (markdown === pendingExternalValue) {
        lastAppliedValueRef.current = markdown;
        lastEmittedValueRef.current = markdown;
        pendingExternalValueRef.current = null;
      }
      return;
    }

    if (markdown === lastEmittedValueRef.current) {
      return;
    }

    lastEmittedValueRef.current = markdown;
    lastAppliedValueRef.current = markdown;
    onChange?.(markdown);
  }, [markdown, onChange]);

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
      <SyncBridge value={value} onChange={onChange} onReady={onReady} />
    </DOMDProvider>
  );
}
