import { useEffect, useMemo, useRef } from "react";
import { DOMD, DOMDProvider, toMarkdown, useEditor, useRenderData } from "@do-md/core-react";
import "@do-md/core-react/style.css";
import { createLiveEditImageLoader } from "./imageLoader";
import { tokenize } from "./prismTokenizer";

function SyncBridge({ value, onChange, onReady }) {
  const editor = useEditor();
  const renderData = useRenderData();
  const markdown = toMarkdown(renderData) ?? "";
  const lastAppliedValueRef = useRef(value ?? "");
  const lastEmittedValueRef = useRef(markdown);
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
    if (nextValue === lastAppliedValueRef.current) {
      return;
    }

    const currentValue = toMarkdown(renderData) ?? "";
    if (nextValue !== currentValue) {
      editor.editorStore.resetMD(nextValue);
    }

    lastAppliedValueRef.current = nextValue;
  }, [editor, renderData, value]);

  useEffect(() => {
    if (markdown === lastEmittedValueRef.current) {
      return;
    }

    lastEmittedValueRef.current = markdown;
    lastAppliedValueRef.current = markdown;
    onChange?.(markdown);
  }, [markdown, onChange]);

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
      <SyncBridge value={value} onChange={onChange} onReady={onReady} />
    </DOMDProvider>
  );
}
