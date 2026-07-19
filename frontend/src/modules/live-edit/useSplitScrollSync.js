export function useSplitScrollSync({
  isHtmlDocument,
  editorRef,
  previewRef,
  htmlPreviewFrameRef,
  syncResetDelay = 80,
}) {
  let isSyncing = false
  let syncResetTimer = null
  let pendingScrollSyncFrame = 0
  let pendingScrollSyncSource = ""
  let pendingScrollSyncRatio = 0

  function getHtmlPreviewScrollElement() {
    const doc = htmlPreviewFrameRef.value?.contentDocument
    return doc?.scrollingElement || doc?.documentElement || doc?.body || null
  }

  function getPreviewScrollElement() {
    return isHtmlDocument.value ? getHtmlPreviewScrollElement() || previewRef.value : previewRef.value
  }

  function resetSyncState() {
    isSyncing = false
  }

  function scheduleSyncReset() {
    if (syncResetTimer) {
      clearTimeout(syncResetTimer)
    }
    syncResetTimer = setTimeout(() => {
      syncResetTimer = null
      resetSyncState()
    }, syncResetDelay)
  }

  function cancelPendingScrollSync() {
    if (pendingScrollSyncFrame) {
      cancelAnimationFrame(pendingScrollSyncFrame)
      pendingScrollSyncFrame = 0
    }
    pendingScrollSyncSource = ""
    pendingScrollSyncRatio = 0
  }

  function flushPendingScrollSync() {
    pendingScrollSyncFrame = 0
    if (isSyncing || !pendingScrollSyncSource) {
      return
    }

    const editor = editorRef.value
    const preview = getPreviewScrollElement()
    if (!editor || !preview) {
      pendingScrollSyncSource = ""
      return
    }

    const editorMaxScroll = editor.scrollHeight - editor.clientHeight
    const previewMaxScroll = preview.scrollHeight - preview.clientHeight
    if (editorMaxScroll <= 0 || previewMaxScroll <= 0) {
      pendingScrollSyncSource = ""
      return
    }

    isSyncing = true
    if (pendingScrollSyncSource === "editor") {
      preview.scrollTop = pendingScrollSyncRatio * previewMaxScroll
    } else {
      editor.scrollTop = pendingScrollSyncRatio * editorMaxScroll
    }
    pendingScrollSyncSource = ""
    scheduleSyncReset()
  }

  function scheduleScrollSync(source) {
    if (isSyncing) {
      return
    }

    const scrollElement = source === "editor" ? editorRef.value : getPreviewScrollElement()
    if (!scrollElement) {
      return
    }

    const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight
    if (maxScroll <= 0) {
      return
    }

    pendingScrollSyncSource = source
    pendingScrollSyncRatio = scrollElement.scrollTop / maxScroll
    if (pendingScrollSyncFrame) {
      return
    }
    pendingScrollSyncFrame = requestAnimationFrame(flushPendingScrollSync)
  }

  function handleEditorScroll() {
    scheduleScrollSync("editor")
  }

  function handlePreviewScroll() {
    scheduleScrollSync("preview")
  }

  function cleanupSplitScrollSync() {
    if (syncResetTimer) {
      clearTimeout(syncResetTimer)
      syncResetTimer = null
    }
    cancelPendingScrollSync()
    resetSyncState()
  }

  return {
    handleEditorScroll,
    handlePreviewScroll,
    cancelPendingScrollSync,
    cleanupSplitScrollSync,
  }
}
